import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Button, Panel, Empty, Spinner, SlideSkeleton, Tooltip } from "../components/ui.jsx";
import Lightbox from "../components/Lightbox.jsx";
import SlideEditor from "../components/SlideEditor.jsx";
import { moveSlide, duplicateSlide, deleteSlide, setPresenter } from "../lib/slides.js";
import { progressLabel } from "../lib/progress.js";
import { useModels } from "../lib/useModels.js";
import { ChevronDown, DownloadIcon } from "../components/icons.jsx";

/**
 * One deck: header with theme/style + render + download, a Report panel (the
 * land target of the home Report mode), then the live slide grid with lightbox,
 * inline editing and presenter picks. Rendering happens through the real API;
 * "rendering…" and the problems list are sync feedback, not decoration.
 */
export default function DeckDetail({ slug, hasReport, refreshToken, onBack, onDeckChanged, onOpenDeck, onOpenResearch, onOpenReport }) {
  const [data, setData] = useState(null);
  const [themes, setThemes] = useState([]);
  const [styles, setStyles] = useState([]);
  const [theme, setTheme] = useState("");
  const [style, setStyle] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [problems, setProblems] = useState([]);
  const [zoom, setZoom] = useState(null);
  const [editing, setEditing] = useState(null); // slide index in the editor
  const [identity, setIdentity] = useState(null);
  const [reportExists, setReportExists] = useState(hasReport);
  const [punch, setPunch] = useState(null); // slide index being punched up
  const [punchErr, setPunchErr] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [versions, setVersions] = useState(null); // null = not loaded
  const [mode, setMode] = useState(null); // deck's remembered dark mode
  const [exportOpen, setExportOpen] = useState(false);
  // The content-density sweep: rewrite all slide content at a chosen density,
  // keeping structure, types and presenters. density = current deck density.
  const [density, setDensity] = useState("balanced");
  const [sweeping, setSweeping] = useState(false);
  const [sweepMsg, setSweepMsg] = useState("");
  // The type-swap gallery: which slide is being re-typed, the loaded specimen
  // previews, and the conversion state.
  const [swap, setSwap] = useState(null); // slide index
  const [specimens, setSpecimens] = useState(null); // { types, previews }
  const [swapBusy, setSwapBusy] = useState(false);
  const [swapErr, setSwapErr] = useState("");
  // Image upload: which slide an uploaded image is destined for, and the file.
  // A ref, not state: the file-input change fires synchronously after the
  // picker click, before a state update could commit.
  const imgForRef = useRef(null);
  const imgInputRef = useRef(null);
  // F9 — undo/redo stacks of full deck states. Every commitDeck pushes the
  // previous deck; Ctrl+Z/Ctrl+Y walk the stacks and re-save + re-render.
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [tplOpen, setTplOpen] = useState(false);
  const renderTimer = useRef(null);
  const exportRef = useRef(null);

  useEffect(() => setReportExists(hasReport), [hasReport]);

  // The Export menu closes on outside click and Escape.
  useEffect(() => {
    if (!exportOpen) return;
    const onDown = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setExportOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [exportOpen]);

  useEffect(() => {
    // refreshToken bumps after a chat turn or report generate, so a deck
    // changed elsewhere shows its new slides here without a manual reload.
    api.deck(slug).then((r) => {
      const stamp = Date.now();
      setData({
        ...r,
        slides: r.slides.map((s) => `${s}?t=${stamp}`),
        thumbs: r.thumbs.map((s) => `${s}?t=${stamp}`),
      });
      setTheme(r.deck.theme ?? "");
      setStyle(r.deck.style ?? "");
      setMode(r.meta?.mode ?? null);
      setDensity(r.meta?.density ?? "balanced");
    });
    api.themes().then((r) => setThemes(r.themes)).catch(() => {});
    api.styles().then((r) => setStyles(r.styles)).catch(() => {});
    api.templates().then((r) => setTemplates(r.templates ?? [])).catch(() => {});
    // Team members for the presenter picker; the deck's own meta snapshot wins.
    api.identity().then((r) => setIdentity(r.identity ?? {})).catch(() => {});
  }, [slug, refreshToken]);

  const members = (data?.meta?.team?.members?.length
    ? data.meta.team.members
    : identity?.team?.members) ?? [];

  /**
   * Gamma-style per-slide quick action: "make this punchier" is a chat turn
   * scoped to the slide, through the same runTurn pipeline the chat rail uses.
   * The instruction names the slide's index so the structural command handling
   * in runTurn resolves it; the deck re-renders when the turn lands.
   */
  function punchUp(i) {
    if (punch !== null) return;
    setPunch(i);
    setPunchErr("");
    const headline = slides[i]?.headline ?? slides[i]?.type;
    api.chatDeck(slug, {
      instruction:
        `Make slide ${i + 1} punchier — tighten its wording and make the claim ` +
        `("${headline}") sharper and more confident. Keep the slide type and ` +
        `structure; edit only that slide.`,
    }, {
      result: () => onDeckChanged(),
    }).promise.catch((err) => {
      setPunchErr(err.message);
    }).finally(() => setPunch(null));
  }

  /**
   * Persist a deck mutation directly to deck.yaml (never through a model), then
   * re-render. The grid updates optimistically so the change is visible
   * immediately; the rasterised preview catches up within a beat.
   */
  function commitDeck(nextDeck) {
    setData((d) => (d ? { ...d, deck: nextDeck } : d));
    // The deck being replaced joins the undo history.
    setPast((p) => [...p.slice(-19), deck]);
    setFuture([]);
    api.saveDeck(slug, nextDeck, data?.meta)
      .then(() => {
        clearTimeout(renderTimer.current);
        setSyncing(true);
        renderTimer.current = setTimeout(runRender, 450);
      })
      .catch((err) => setProblems([err.message, ...(err.errors ?? [])]));
  }

  // Ctrl+Z / Ctrl+Y undo and redo across the stacks, saving + re-rendering the
  // restored deck exactly like any other mutation.
  function stepHistory(dir) {
    const from = dir < 0 ? past : future;
    if (!from.length) return;
    setData((d) => {
      const current = d?.deck ?? deck;
      const [restore] = from.slice(-1);
      const rest = from.slice(0, -1);
      if (dir < 0) {
        setPast(rest);
        setFuture((f) => [...f, current].slice(-20));
      } else {
        setFuture(rest);
        setPast((p) => [...p, current].slice(-20));
      }
      api.saveDeck(slug, restore, data?.meta).catch((e) => setProblems([e.message]));
      clearTimeout(renderTimer.current);
      setSyncing(true);
      renderTimer.current = setTimeout(runRender, 450);
      return d ? { ...d, deck: restore } : d;
    });
  }

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        if (editing === null) stepHistory(-1);
      } else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        if (editing === null) stepHistory(1);
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (editing !== null) return; // the editor's own save button
        rerender();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function runRender() {
    setBusy(true);
    try {
      const r = await api.renderDeck(slug, { theme: theme || undefined, style: style || undefined });
      const stamp = Date.now();
      setData((d) => (d ? {
        ...d,
        slides: r.slides.map((s) => `${s}?t=${stamp}`),
        thumbs: (r.thumbs ?? r.slides).map((s) => `${s}?t=${stamp}`),
      } : d));
      setProblems(r.problems ?? []);
    } catch (err) {
      setProblems([err.message, ...(err.errors ?? [])]);
    } finally {
      setBusy(false);
      setSyncing(false);
    }
  }

  function rerender() {
    clearTimeout(renderTimer.current);
    setSyncing(true);
    runRender();
  }

  /**
   * The content-density sweep — the deck-level control that replaces the old
   * chat rail's whole-deck edits. Rewrites every content slide at the chosen
   * density (sparse/balanced/dense) keeping structure, types and presenters,
   * then re-renders. One scoped model call per slide, streamed as progress.
   */
  function sweep() {
    if (sweeping) return;
    if (!window.confirm("Rewrite every slide's content at this density? This replaces the current slide text (structure, types and presenters are kept).")) return;
    setSweeping(true);
    setSweepMsg(`Rewriting at ${density} density…`);
    setProblems([]);
    api.sweepDensity(slug, {
      density,
      theme: theme || undefined,
    }, {
      status: (p) => {
        if (p?.index != null && p?.total != null) {
          setSweepMsg(`Rewriting slide ${p.index + 1} of ${p.total} at ${density} density…`);
        }
      },
      result: (r) => {
        const stamp = Date.now();
        setData((d) => (d ? {
          ...d,
          slides: r.slides.map((s) => `${s}?t=${stamp}`),
          thumbs: (r.thumbs ?? r.slides).map((s) => `${s}?t=${stamp}`),
        } : d));
        setProblems(r.problems ?? []);
        onDeckChanged?.();
      },
    }).promise
      .catch((err) => setProblems([err.message]))
      .finally(() => { setSweeping(false); setSweepMsg(""); });
  }

  /**
   * The type-swap gallery. Opening it loads one rendered preview per slide
   * type in the current theme (cached server-side), so the user sees each of
   * the 75 types AS IT RENDERS here before choosing. Picking a type converts
   * that slide — a compatible type remaps instantly, anything else gets a
   * scoped model rewrite — preserving section and presenter.
   */
  function openSwap(i) {
    setSwap(i);
    setSwapErr("");
    setSwapBusy(true);
    api.typeSpecimens(theme || deck.theme)
      .then((r) => setSpecimens({ types: r.types, previews: r.previews }))
      .catch((err) => setSwapErr(err.message))
      .finally(() => setSwapBusy(false));
  }

  function closeSwap() {
    setSwap(null);
    setSpecimens(null);
  }

  function convertTo(i, targetType) {
    if (swapBusy) return;
    if (targetType === slides[i]?.type) return closeSwap();
    setSwapBusy(true);
    setSwapErr("");
    setProblems([]);
    api.convertSlide(slug, i, { type: targetType }, {
      result: (r) => {
        const stamp = Date.now();
        setData((d) => (d ? {
          ...d,
          slides: r.slides.map((s) => `${s}?t=${stamp}`),
          thumbs: (r.thumbs ?? r.slides).map((s) => `${s}?t=${stamp}`),
        } : d));
        setProblems(r.problems ?? []);
        onDeckChanged?.();
        closeSwap();
      },
    }).promise
      .catch((err) => setSwapErr(err.message))
      .finally(() => setSwapBusy(false));
  }

  /**
   * Add an image to a slide. Picking a file opens the native chooser; the
   * upload lands in decks/<slug>/assets/ (gitignored) and the slide is set to
   * an image-carrying type with that asset as its image field. If the slide is
   * already an image type, the image field is set in place; otherwise it is
   * converted to image-text so the image has somewhere to render.
   */
  /**
   * Add an image to a slide. Picking a file uploads it to decks/<slug>/assets/
   * (gitignored), then the slide is set to an image-carrying type with that
   * asset as its image field — directly, no model involved (an image slide's
   * layout is deterministic; only the picture is new). If the slide already
   * carries the image, just attach it; otherwise it becomes an image-text slide
   * preserving its headline.
   */
  async function handleImageFile(file) {
    if (!file || imgForRef.current === null) return;
    const idx = imgForRef.current;
    setSwapBusy(true);
    setSwapErr("");
    try {
      const r = await api.uploadDeckImage(slug, file);
      const next = { ...deck };
      const prev = next.slides[idx];
      const isImageType = ["image", "image-text", "hero-image", "image-grid", "split-screen", "side-by-side"].includes(prev?.type);
      const target = isImageType
        ? { ...prev, image: r.file }
        : {
            type: "image-text",
            headline: prev?.headline ?? prev?.type ?? "Image",
            image: r.file,
            body: [prev?.headline ?? "A slide with a picture."],
            section: prev?.section,
            presenter: prev?.presenter,
          };
      // The [image] hint is satisfied — drop it so the "add image" badge clears.
      if (/\[image\]/.test(target.notes ?? "")) {
        target.notes = target.notes.replace(/\[image\][^\n]*\n?/, "").trim() || undefined;
      }
      next.slides[idx] = target;
      await api.saveDeck(slug, next, data?.meta);
      clearTimeout(renderTimer.current);
      setSyncing(true);
      renderTimer.current = setTimeout(runRender, 450);
      onDeckChanged?.();
    } catch (err) {
      setSwapErr(err.message);
    } finally {
      setSwapBusy(false);
      imgForRef.current = null;
    }
  }

  function openImagePicker(i) {
    imgForRef.current = i;
    setSwapErr("");
    setTimeout(() => imgInputRef.current?.click(), 0);
  }

  /**
   * The deck's remembered dark mode (F17): toggling saves `mode` into meta.yaml
   * and re-renders in that mode, so a dark deck stays dark across reloads.
   */
  function toggleMode() {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    const meta = { ...(data?.meta ?? {}), mode: next };
    api.saveDeck(slug, deck, meta).catch((e) => setActionErr(e.message));
    clearTimeout(renderTimer.current);
    setSyncing(true);
    api.renderDeck(slug, { theme: theme || undefined, style: style || undefined, mode: next })
      .then((r) => {
        const stamp = Date.now();
        setData((d) => (d ? {
          ...d,
          meta,
          slides: r.slides.map((s) => `${s}?t=${stamp}`),
          thumbs: (r.thumbs ?? r.slides).map((s) => `${s}?t=${stamp}`),
        } : d));
        setProblems(r.problems ?? []);
      })
      .catch((e) => setProblems([e.message]))
      .finally(() => setSyncing(false));
  }

  function doClone() {
    setActionErr("");
    api.cloneDeck(slug)
      .then((r) => onOpenDeck?.(r.slug))
      .catch((e) => setActionErr(e.message));
  }

  function doExport(format) {
    setActionErr("");
    api.exportDeck(slug, format, theme || undefined)
      .then((r) => {
        const a = document.createElement("a");
        a.href = r.file;
        a.download = r.file.split("/").pop();
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch((e) => setActionErr(e.message));
  }

  function doBundle() {
    setActionErr("");
    api.downloadBundle(slug)
      .then(async (res) => {
        if (!res.ok) throw new Error(`bundle failed: HTTP ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${slug}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .catch((e) => setActionErr(e.message));
  }

  function toggleVersions() {
    setVersions((v) => (v === null ? "loading" : null));
    if (versions === null) {
      api.versions(slug).then((r) => setVersions(r.versions)).catch(() => setVersions([]));
    }
  }

  function restoreVersion(file) {
    setActionErr("");
    api.restoreVersion(slug, file)
      .then(() => { setVersions(null); onDeckChanged?.(); })
      .catch((e) => setActionErr(e.message));
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-6xl px-10 py-10">
        <div className="skeleton h-8 w-80 rounded-lg" />
        <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <SlideSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  const deck = data.deck;
  const slides = deck.slides;
  const types = slides.map((s) => s.type);
  const themeName = theme || deck.theme;
  const themeLabel = themes.find((t) => t.name === themeName)?.label ?? themeName;

  function onMove(i, dir) {
    const next = moveSlide(slides, i, dir);
    if (next !== slides) commitDeck({ ...deck, slides: next });
  }
  function onDuplicate(i) {
    commitDeck({ ...deck, slides: duplicateSlide(slides, i) });
  }
  function onDelete(i) {
    commitDeck({ ...deck, slides: deleteSlide(slides, i) });
  }
  function onPresenter(i, presenter) {
    commitDeck({ ...deck, slides: setPresenter(slides, i, presenter) });
  }

  const selectCls =
    "appearance-none rounded-lg border border-line bg-sunken py-2 pl-3 pr-8 text-sm text-fg outline-none transition hover:border-line-strong focus:border-accent";

  return (
    <div className="mx-auto max-w-6xl px-10 py-10">
      <input
        ref={imgInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handleImageFile(f); }}
      />
      <button
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-1.5 text-xs text-fg-faint transition hover:text-fg"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18 9 12l6-6" />
        </svg>
        Home
      </button>

      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <h1 className="break-words text-[1.75rem] font-semibold leading-tight tracking-[-0.015em]">
            {deck.title}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px] text-fg-muted">
            <span className="tabular-nums">{slides.length} slides</span>
            {deck.sections?.length > 0 && (
              <>
                <span className="text-line-strong">·</span>
                <span className="tabular-nums">{deck.sections.length} sections</span>
              </>
            )}
            {themeLabel && (
              <>
                <span className="text-line-strong">·</span>
                <span>{themeLabel}</span>
              </>
            )}
            {syncing && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-fg-faint">
                <Spinner /> rendering…
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className={selectCls}
            >
              <option value="">from deck.yaml</option>
              {themes.map((t) => (
                <option key={t.name} value={t.name}>{t.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" />
          </div>

          <div className="relative">
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              title="Style — a cross-cutting density/layout variant on top of the theme"
              className={selectCls}
            >
              <option value="">theme default</option>
              {styles.map((s) => (
                <option key={s.name} value={s.name}>{s.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" />
          </div>

          <div className="relative">
            <select
              value={density}
              onChange={(e) => setDensity(e.target.value)}
              title="Content density — rewrite every slide's content at this density"
              className={selectCls}
            >
              <option value="sparse">Sparse</option>
              <option value="balanced">Balanced</option>
              <option value="dense">Dense</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" />
          </div>

          <Button
            variant="outline"
            onClick={sweep}
            disabled={busy || sweeping}
            title="Rewrite all slide content at this density — keeps structure, types and presenters"
          >
            {sweeping ? <Spinner /> : null}
            {sweeping ? sweepMsg.slice(0, 26) : "Re-sweep"}
          </Button>

          <Button variant="primary" onClick={rerender} disabled={busy}>
            {busy && <Spinner />}
            {busy ? "Rendering" : "Render"}
          </Button>

          <a
            href={`/api/decks/${slug}/download/deck.pptx`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-sm text-fg-muted transition hover:border-line-strong hover:text-fg"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            .pptx
          </a>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div ref={exportRef} className="relative">
          <ActionBtn onClick={() => setExportOpen((o) => !o)} title="PDF, Markdown, bundle, clone, versions, mode">
            Export <ChevronDown className="h-3 w-3" />
          </ActionBtn>
          {exportOpen && (
            <div className="fade-in absolute left-0 top-full z-30 mt-1.5 w-56 rounded-card border border-line bg-panel p-1.5 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.05)]">
              <MenuBtn onClick={() => { doExport("pdf"); setExportOpen(false); }}>PDF</MenuBtn>
              <MenuBtn onClick={() => { doExport("markdown"); setExportOpen(false); }}>Markdown (.md)</MenuBtn>
              <MenuBtn onClick={() => { doBundle(); setExportOpen(false); }}>Bundle (.zip)</MenuBtn>
              <MenuBtn onClick={() => { doClone(); setExportOpen(false); }}>Clone deck</MenuBtn>
              <MenuBtn onClick={() => { setExportOpen(false); toggleVersions(); }}>Versions</MenuBtn>
              <MenuBtn onClick={() => { toggleMode(); setExportOpen(false); }}>
                {mode === "dark" ? "Light mode" : "Dark mode"}
              </MenuBtn>
            </div>
          )}
        </div>
        {versions && (
          <div className="absolute left-0 top-full z-30 mt-1.5 w-80 rounded-card border border-line bg-panel p-2 shadow-lg">
            <div className="px-1.5 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-fg-faint">Version history</div>
            {versions === "loading" ? (
              <div className="px-1.5 py-2 text-[12px] text-fg-muted"><Spinner /> Loading…</div>
            ) : versions.length === 0 ? (
              <div className="px-1.5 py-2 text-[12px] leading-relaxed text-fg-muted">
                No backups yet — saving this deck snapshots the previous deck.yaml.
              </div>
            ) : (
              <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                {versions.map((v) => (
                  <li key={v.file} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-hover">
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-muted">
                      {new Date(v.at).toLocaleString()}
                    </span>
                    <button
                      onClick={() => restoreVersion(v.file)}
                      className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10.5px] text-fg-faint transition hover:border-line-strong hover:text-fg"
                    >
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {actionErr && <span className="text-[12px] text-amber">{actionErr}</span>}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ReportPanel
          slug={slug}
          hasReport={reportExists}
          defaultDepth={data.meta?.reportDepth ?? "full"}
          onGenerated={() => {
            setReportExists(true);
            onDeckChanged?.();
          }}
          onOpenReport={onOpenReport}
        />
        <ResearchCard slug={slug} onOpen={onOpenResearch} />
      </div>

      {problems.length > 0 && (
        <Panel className="mt-5 border-amber/30 bg-amber/5 p-3.5">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber">
            {problems.length} problem{problems.length > 1 ? "s" : ""}
          </div>
          <ul className="space-y-1 text-xs leading-relaxed text-fg-muted">
            {problems.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </Panel>
      )}

      {punchErr && (
        <Panel className="mt-5 border-amber/30 bg-amber/5 p-3.5">
          <div className="text-xs leading-relaxed text-amber">{punchErr}</div>
        </Panel>
      )}

      {data.slides.length === 0 ? (
        <div className="mt-7">
          <Empty
            title="Not rendered yet"
            hint="Render turns deck.yaml into a .pptx, then rasterises it so you can check the result before opening PowerPoint."
            action={<Button variant="primary" onClick={rerender} disabled={busy}>Render now</Button>}
          />
        </div>
      ) : (
        <div className="mt-7">
          <div className="relative mb-3 flex items-center justify-between">
            <div className="text-[11px] font-medium uppercase tracking-wider text-fg-faint">Slides</div>
            <div className="relative">
              <Button size="sm" variant="outline" onClick={() => setTplOpen((o) => !o)}>
                + Add slide
              </Button>
              {tplOpen && (
                <div className="absolute right-0 top-full z-30 mt-1.5 w-56 rounded-card border border-line bg-panel p-1.5 shadow-lg">
                  <button
                    onClick={() => {
                      commitDeck({ ...deck, slides: [...slides, { type: "bullets", headline: "New slide", bullets: ["Point one", "Point two"] }] });
                      setTplOpen(false);
                    }}
                    className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-fg-muted transition hover:bg-hover hover:text-fg"
                  >
                    Blank bullets
                  </button>
                  {templates.map((t) => (
                    <button
                      key={t.name}
                      onClick={() => {
                        commitDeck({ ...deck, slides: [...slides, structuredClone(t.slide)] });
                        setTplOpen(false);
                      }}
                      className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-fg-muted transition hover:bg-hover hover:text-fg"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {slides.map((slide, i) => {
            const src = data.slides[i];
            return (
              <div key={i} className="card-hover group panel-surface rounded-[var(--radius-lg)] border border-line bg-panel p-2">
                <button
                  onClick={() => setZoom(i)}
                  className="block w-full text-left"
                  title="View full size"
                >
                  <div className="slide-frame overflow-hidden rounded-lg transition hover:ring-2 hover:ring-accent/70">
                    {/* Iterate over the deck, not the previews: right after a
                        delete/duplicate the rasterised set lags the content by
                        a beat, so a missing frame is a skeleton, not a gap.
                        480px thumbs in the grid; the lightbox loads the full
                        plate. No lazy-loading — at ~28 kB each, fetching the
                        deck outright beats gating on observers. */}
                    {src ? (
                      <img
                        src={data.thumbs?.[i] ?? src}
                        alt={`Slide ${i + 1}`}
                        className="block w-full"
                      />
                    ) : (
                      <div className="skeleton aspect-video" />
                    )}
                  </div>
                </button>

                <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                  <span className="font-mono tabular-nums text-fg-faint">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="truncate text-fg-faint">{slide?.type}</span>
                  {/\[image\]/.test(slide?.notes ?? "") && (
                    <button
                      onClick={() => openImagePicker(i)}
                      title="The model asked for an image here — add one"
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[9.5px] font-medium text-accent transition hover:bg-accent/20"
                    >
                      <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="m21 15-5-5L5 21" />
                      </svg>
                      add image
                    </button>
                  )}
                  <select
                    value={slide?.presenter ?? ""}
                    onChange={(e) => onPresenter(i, e.target.value)}
                    title="Who presents this slide"
                    className="ml-auto max-w-[7rem] appearance-none rounded border border-line bg-sunken px-1.5 py-0.5 text-[10.5px] text-fg-muted outline-none transition hover:border-line-strong focus:border-accent"
                  >
                    <option value="">auto</option>
                    {/* Empty-name members are placeholder rows on the team card;
                        they are not presenters, and duplicate empty keys would
                        collide in React's reconciliation. */}
                    {members.filter((m) => m.name?.trim()).map((m, mi) => <option key={mi} value={m.name}>{m.name}</option>)}
                  </select>
                </div>

                {/* The hover-reveal toolbar: three primary actions up front,
                    the rest behind a "⋯" menu. Visible on hover, settled and
                    quiet otherwise — seven grey icons under every slide was
                    noise. Delete sits in the menu, crimson, behind a confirm. */}
                <div className="mt-1 flex items-center justify-between">
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-[var(--dur-shell)] ease-[var(--ease-shell)] group-hover:opacity-100">
                    <Tooltip label="Edit content">
                      <CardBtn onClick={() => setEditing(i)}><EditIcon /></CardBtn>
                    </Tooltip>
                    <Tooltip label={punch === i ? "Making it punchier…" : "Make this slide punchier"}>
                      <CardBtn onClick={() => punchUp(i)} disabled={punch !== null}>
                        {punch === i ? <Spinner className="h-3 w-3 text-fg-faint" /> : <BoltIcon />}
                      </CardBtn>
                    </Tooltip>
                    <Tooltip label="Swap slide type">
                      <CardBtn onClick={() => openSwap(i)} disabled={swapBusy}>
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 12h18M12 3v18M8 8l-4 4 4 4M16 8l4 4-4 4" />
                        </svg>
                      </CardBtn>
                    </Tooltip>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-[var(--dur-shell)] ease-[var(--ease-shell)] group-hover:opacity-100">
                    <CardMenu
                      items={[
                        { label: "Move left", onClick: () => onMove(i, -1), disabled: i === 0 },
                        { label: "Move right", onClick: () => onMove(i, 1), disabled: i === slides.length - 1 },
                        { label: "Add image", onClick: () => openImagePicker(i), disabled: swapBusy },
                        { label: "Duplicate", onClick: () => onDuplicate(i) },
                        { label: "Delete slide", danger: true, onClick: () => onDelete(i), disabled: slides.length <= 1 },
                      ]}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {zoom !== null && (
        <Lightbox
          slides={data.slides}
          thumbs={data.thumbs}
          types={types}
          index={zoom}
          onIndex={setZoom}
          onClose={() => setZoom(null)}
          // The enlarged view carries the same per-slide actions as the small
          // card — editing/swap/image close the viewer so their modal can own
          // the screen; punch, move, duplicate and delete run in place. Moving
          // follows the slide to its new position.
          actions={{
            onEdit: (i) => { setZoom(null); setEditing(i); },
            onPunch: (i) => punchUp(i),
            punching: punch === zoom,
            onSwap: (i) => { setZoom(null); openSwap(i); },
            onImage: (i) => { setZoom(null); openImagePicker(i); },
            onDuplicate: (i) => onDuplicate(i),
            onDelete: (i) => { onDelete(i); setZoom((z) => Math.max(0, Math.min(slides.length - 2, z))); },
            canDelete: slides.length > 1,
            onMoveLeft: (i) => { onMove(i, -1); setZoom((z) => Math.max(0, z - 1)); },
            onMoveRight: (i) => { onMove(i, 1); setZoom((z) => Math.min(slides.length - 1, z + 1)); },
          }}
        />
      )}

      {editing !== null && (
        <SlideEditor
          deck={deck}
          index={editing}
          members={members}
          onSave={(nextDeck) => {
            commitDeck(nextDeck);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {swap !== null && (
        <TypeSwapModal
          index={swap}
          slide={slides[swap]}
          specimens={specimens}
          busy={swapBusy}
          error={swapErr}
          onPick={(t) => convertTo(swap, t)}
          onClose={closeSwap}
        />
      )}
    </div>
  );
}

/**
 * The type-swap gallery: a scrollable grid of every slide type rendered in the
 * current theme (one cached specimen render per type). Picking a type converts
 * that slide — remap when compatible, scoped model rewrite otherwise.
 *
 * A thumb at 75-across grid resolution is too small to judge, so this has two
 * previews on top of a bigger tile: hovering a tile shows that type enlarged in
 * the dock below the grid, and clicking a tile opens a full-size single preview
 * (the same cached PNG, no re-render) where the commit happens. The current
 * type keeps its "now" badge and the filter box stays.
 */
function TypeSwapModal({ index, slide, specimens, busy, error, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState(null);   // hovered type name → dock preview
  const [preview, setPreview] = useState(null); // pinned type → full-size preview
  const types = specimens?.types ?? [];
  const previews = specimens?.previews ?? [];
  const filtered = query.trim()
    ? types.map((t, i) => ({ t, i })).filter(({ t }) => t.replace(/-/g, " ").includes(query.trim().toLowerCase()))
    : types.map((t, i) => ({ t, i }));

  const activeType = slide?.type;
  const dockType = hover ?? activeType ?? null;
  const dockIdx = dockType ? types.indexOf(dockType) : -1;
  const previewIdx = preview ? types.indexOf(preview) : -1;

  // Escape closes the full-size preview before anything else.
  useEffect(() => {
    if (!preview) return;
    const onKey = (e) => { if (e.key === "Escape") setPreview(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="fade-in flex max-h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded-card border border-line bg-panel shadow-[0_40px_80px_-40px_rgba(0,0,0,0.9)]">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-fg">Swap slide type</div>
              <div className="truncate text-[11px] text-fg-faint">
                Slide {index + 1} · <span className="font-mono">{slide?.type}</span> — pick how it renders next.
                Compatible types convert instantly; the rest are rewritten.
              </div>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter types…"
              className="w-40 rounded-lg border border-line bg-sunken px-2.5 py-1.5 text-[12px] text-fg outline-none transition focus:border-accent"
            />
            <button onClick={onClose} className="rounded p-1.5 text-fg-faint transition hover:bg-hover hover:text-fg" title="Close">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {error ? (
              <div className="rounded-lg border border-amber/30 bg-amber/5 px-3 py-2 text-[12px] text-amber">{error}</div>
            ) : !specimens ? (
              <div className="flex items-center gap-2 text-[12.5px] text-fg-muted"><Spinner /> Rendering one preview per type in this theme…</div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {filtered.map(({ t, i }) => {
                  const active = t === activeType;
                  return (
                    <button
                      key={t}
                      onClick={() => setPreview(t)}
                      onMouseEnter={() => setHover(t)}
                      onMouseLeave={() => setHover((h) => (h === t ? null : h))}
                      onFocus={() => setHover(t)}
                      onBlur={() => setHover((h) => (h === t ? null : h))}
                      disabled={busy}
                      className={`group overflow-hidden rounded-card border text-left transition ${
                        active
                          ? "border-accent ring-1 ring-accent/60"
                          : hover === t
                            ? "border-accent/50"
                            : "border-line hover:border-line-strong"
                      } bg-sunken`}
                      title={`Preview ${t}${active ? " (current)" : ""} — click for full size`}
                    >
                      <div className="overflow-hidden border-b border-line/60">
                        {previews[i] ? (
                          <img src={previews[i]} alt={t} className="aspect-video w-full object-cover transition duration-200 group-hover:scale-[1.04]" loading="lazy" />
                        ) : (
                          <div className="skeleton aspect-video" />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-2">
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-muted">{t}</span>
                        {active && <span className="shrink-0 text-[9px] font-semibold uppercase text-accent">now</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* The hover dock — whatever tile the pointer is over, enlarged. */}
          {specimens && dockIdx >= 0 && (
            <div className="shrink-0 border-t border-line px-4 py-3">
              <div className="flex items-center gap-4">
                <div className="w-60 shrink-0 overflow-hidden rounded-lg border border-line bg-sunken">
                  <img src={previews[dockIdx]} alt={dockType} className="aspect-video w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[12px] font-medium text-fg">{dockType}</span>
                    {dockType === activeType && <span className="text-[9px] font-semibold uppercase text-accent">now</span>}
                    <span className="text-[10.5px] text-fg-faint">
                      {hover === dockType ? "hover preview" : "current type"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">
                    {hover === dockType ? "Hovering shows the type at this size — click the tile (or here) for the full-size preview." : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="primary" disabled={busy || dockType === activeType} onClick={() => onPick(dockType)}>
                      Use this type
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPreview(dockType)}>See full size</Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {busy && (
            <div className="shrink-0 border-t border-line px-4 py-2 text-[12px] text-fg-muted">
              <Spinner /> Converting…
            </div>
          )}
        </div>
      </div>

      {/* The full-size preview — the same cached specimen PNG, undocked. */}
      {preview && previewIdx >= 0 && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-8 backdrop-blur-sm"
          onClick={() => setPreview(null)}
        >
          <div className="fade-in flex max-h-full w-full max-w-5xl flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="font-mono text-[13px] font-medium text-fg">{preview}</span>
              {preview === activeType && <span className="text-[9px] font-semibold uppercase text-accent">now</span>}
              <span className="text-[11px] text-fg-faint">rendered in this theme</span>
              <div className="ml-auto flex items-center gap-2">
                <Button size="sm" variant="primary" disabled={busy || preview === activeType} onClick={() => onPick(preview)}>
                  {busy ? <Spinner /> : null}
                  Use this type
                </Button>
                <button
                  onClick={() => setPreview(null)}
                  className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-fg-muted transition hover:border-line-strong hover:text-fg"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-card border border-line bg-sunken p-4">
              {previews[previewIdx] ? (
                <img src={previews[previewIdx]} alt={preview} className="max-h-full max-w-full rounded-lg shadow-2xl" />
              ) : (
                <Spinner />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ReportPanel({ slug, hasReport, defaultDepth, onGenerated, onOpenReport }) {
  const { models, mode: modelMode, cloudOn, defaultModel } = useModels();
  const [model, setModel] = useState("");
  const [depth, setDepth] = useState(defaultDepth ?? "full");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [job, setJob] = useState(null);

  async function generate() {
    setBusy(true);
    setError("");
    setStatus("Queued…");
    const j = api.generateReport(
      slug,
      { depth, model: model || undefined },
      { status: (p) => setStatus(progressLabel(p)) },
    );
    setJob(j);
    try {
      await j.promise;
      onGenerated();
    } catch (err) {
      setError(err.name === "AbortError" ? "Cancelled." : err.message);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function renderDoc() {
    setBusy(true);
    setError("");
    try {
      const r = await api.renderReport(slug);
      setResult(r);
      // Rasterised pages of the actual .docx — the report as it opens in Word.
      if (r.previewPages?.length) {
        const stamp = Date.now();
        setPreview({
          pages: r.previewPages.map((s) => `${s}?t=${stamp}`),
          thumbs: (r.previewThumbs ?? r.previewPages).map((s) => `${s}?t=${stamp}`),
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function stop() {
    job?.abort();
    setStatus("");
  }

  const selectCls =
    "appearance-none rounded-lg border border-line bg-sunken py-1.5 pl-3 pr-8 text-[12.5px] text-fg outline-none transition hover:border-line-strong focus:border-accent";

  return (
    <Panel className="p-4">
      <div className="mb-3 text-[11px] font-medium uppercase tracking-wider text-fg-faint">Report</div>

      {!hasReport ? (
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[13px] text-fg-muted">Generate a graded report from this deck's research and outline.</span>
          <div className="relative">
            <select value={depth} onChange={(e) => setDepth(e.target.value)} title="Report depth" className={selectCls}>
              <option value="full">Full depth</option>
              <option value="brief">Brief</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-faint" />
          </div>
          <div className="relative">
            <select value={model} onChange={(e) => setModel(e.target.value)} title={modelMode === "cloud" ? "Cloud model — requires the attached key" : "Which local model writes the report"} className={`${selectCls} max-w-[16rem]`}>
              <option value="">auto · {defaultModel}</option>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-faint" />
          </div>
          <Button variant="primary" size="sm" onClick={generate} disabled={busy}>
            {busy && <Spinner />}
            {busy ? "Generating…" : "Generate report"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {result ? (
            <span className="text-[13px] tabular-nums text-fg-muted">
              {result.sections.length} sections · {pageCount(result.pages)} pages
            </span>
          ) : (
            <span className="text-[13px] text-fg-muted">A report already exists for this deck.</span>
          )}
          <Button variant="outline" size="sm" onClick={renderDoc} disabled={busy}>
            {busy && <Spinner />}
            {busy ? "Rendering…" : "Render .docx"}
          </Button>
          {result && (
            <a
              href={`/api/decks/${slug}/download/report.docx`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-fg-muted transition hover:border-line-strong hover:text-fg"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              Download report.docx
            </a>
          )}
          {onOpenReport && (
            <Button variant="ghost" size="sm" onClick={() => onOpenReport(slug)} title="Open the report's full document view">
              Open report view
            </Button>
          )}
        </div>
      )}

      {status && (
        <div className="mt-2.5 flex items-center gap-2 text-[12px] text-fg-muted">
          <Spinner /> {status}
        </div>
      )}

      {error && (
        <div className="mt-2.5 rounded-lg border border-amber/30 bg-amber/5 px-3 py-2 text-[12px] leading-relaxed text-amber">
          {error}
        </div>
      )}

      {result?.problems?.length > 0 && (
        <ul className="mt-2.5 space-y-1 text-[11.5px] leading-relaxed text-amber">
          {result.problems.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      )}

      {preview && (
        <div className="mt-3 grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto">
          {preview.pages.map((src, i) => (
            <a
              key={src}
              href={`/api/decks/${slug}/download/report.docx`}
              title={`Report page ${i + 1} — the rendered document as it opens in Word`}
              className="group relative overflow-hidden rounded-md border border-line"
            >
              <img src={src} alt={`Report page ${i + 1}`} className="aspect-[3/4] w-full object-cover" loading={i < 3 ? undefined : "lazy"} />
            </a>
          ))}
        </div>
      )}
    </Panel>
  );
}

function pageCount(pages) {
  if (!pages || typeof pages !== "object") return 0;
  return Math.max(0, ...Object.values(pages).map((v) => Number(v) || 0));
}

/**
 * The research card on the deck page — a compact summary that links to the
 * full Research view. The full view (notes as prose, sources table, diversity
 * summary, edit) is where the researched content actually lives; this card is
 * just the doorway plus the one-line trust surface (how many sources, how many
 * domains).
 */
function ResearchCard({ slug, onOpen }) {
  const [summary, setSummary] = useState(null);
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.research(slug)
      .then((r) => { setExists(r.exists); setSummary(r.summary ?? null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  return (
    <Panel className="flex flex-col p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wider text-fg-faint">Research</div>
        {loading && <Spinner />}
      </div>
      {!loading && !exists ? (
        <div className="text-[12px] leading-relaxed text-fg-muted">
          No research pass yet — regenerate with research on and the notes the
          writer draws from appear here.
        </div>
      ) : (
        <div className="text-[12px] leading-relaxed text-fg-muted">
          {summary && (
            <span className="mb-2 block">
              {summary.total ?? 0} sources · {summary.distinctDomains ?? 0} domains
              {summary.paperCount ? ` · ${summary.paperCount} paper` : ""}
            </span>
          )}
        </div>
      )}
      <div className="mt-auto pt-2">
        <Button size="sm" variant="outline" onClick={() => onOpen(slug)} disabled={loading || !exists}>
          Open full research
        </Button>
      </div>
    </Panel>
  );
}

function CardBtn({ children, ...props }) {
  return (
    <button
      {...props}
      className="grid h-6 w-6 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** The "⋯" overflow menu for a slide card. Outside-click closes it; the danger
 *  item (delete) renders crimson so destructive weight reads before the click. */
function CardMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Tooltip label="More actions">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="More actions"
          aria-expanded={open}
          className="grid h-6 w-6 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>
      </Tooltip>
      {open && (
        <div className="absolute right-0 top-7 z-30 min-w-36 rounded-card border border-line bg-panel py-1 shadow-[var(--shadow-float)]">
          {items.map((it, idx) => (
            <button
              key={idx}
              disabled={it.disabled}
              onClick={() => { setOpen(false); it.onClick?.(); }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition disabled:pointer-events-none disabled:opacity-30 ${
                it.danger ? "text-danger hover:bg-hover" : "text-fg-muted hover:bg-hover hover:text-fg"
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionBtn({ children, ...props }) {
  return (
    <button
      {...props}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-fg-muted transition hover:border-line-strong hover:text-fg"
    >
      {children}
    </button>
  );
}

function MenuBtn({ children, ...props }) {
  return (
    <button
      {...props}
      className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-fg-muted transition hover:bg-hover hover:text-fg"
    >
      {children}
    </button>
  );
}

const icon = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};
const EditIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...icon}>
    <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
);
const UpIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...icon}>
    <path d="m6 15 6-6 6 6" />
  </svg>
);
const DownIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...icon}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
const CopyIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...icon}>
    <rect x="9" y="9" width="12" height="12" rx="2.5" />
    <path d="M5 15H4.5A2.5 2.5 0 0 1 2 12.5v-8A2.5 2.5 0 0 1 4.5 2h8A2.5 2.5 0 0 1 15 4.5V5" />
  </svg>
);
const BoltIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...icon}>
    <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5Z" />
  </svg>
);
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...icon}>
    <path d="M3 6h18M8 6V4h8v2m1 0-1 14H8L7 6M10 11v6M14 11v6" />
  </svg>
);
