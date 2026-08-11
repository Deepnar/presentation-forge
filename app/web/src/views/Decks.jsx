import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Button, Panel, Empty, Spinner, SlideSkeleton } from "../components/ui.jsx";
import Lightbox from "../components/Lightbox.jsx";
import SlideEditor from "../components/SlideEditor.jsx";
import { moveSlide, duplicateSlide, deleteSlide, setPresenter } from "../lib/slides.js";
import NewDeck from "./NewDeck.jsx";
import Outline from "./Outline.jsx";

export default function Decks({ onDeckChange, refreshToken }) {
  const [decks, setDecks] = useState(null);
  const [open, setOpen] = useState(null);
  const [phase, setPhase] = useState("list"); // "list" | "new" | "outline"
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    api.decks().then((r) => setDecks(r.decks)).catch(() => setDecks([]));
  }, []);

  const openDeck = (slug) => {
    setOpen(slug);
    onDeckChange?.(slug);
  };

  if (open) {
    return (
      <DeckDetail
        slug={open}
        refreshToken={refreshToken}
        onBack={() => {
          setOpen(null);
          onDeckChange?.(null);
        }}
      />
    );
  }

  if (phase === "new") {
    return (
      <NewDeck
        onPlanned={(slug, plan, theme) => {
          setDraft({ slug, plan, theme });
          setPhase("outline");
        }}
        onBack={() => setPhase("list")}
      />
    );
  }

  if (phase === "outline") {
    return (
      <Outline
        slug={draft.slug}
        plan={draft.plan}
        initialTheme={draft.theme}
        onDone={(slug) => {
          setPhase("list");
          openDeck(slug);
        }}
        onBack={() => setPhase("new")}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-9">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.7rem] font-semibold tracking-tight">Decks</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Each deck is a folder under <code className="text-fg-faint">decks/</code> holding
            a <code className="text-fg-faint">deck.yaml</code>.
          </p>
        </div>
        <Button variant="primary" onClick={() => setPhase("new")}>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New deck
        </Button>
      </header>

      {decks === null && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-[7.5rem] rounded-card" />)}
        </div>
      )}

      {decks?.length === 0 && (
        <Empty
          title="No decks yet"
          hint="Start with a brief — the outline review gate keeps the model's structure from reaching the renderer until you approve it."
          action={<Button variant="primary" onClick={() => setPhase("new")}>New deck</Button>}
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {decks?.map((d) => (
          <button
            key={d.slug}
            onClick={() => openDeck(d.slug)}
            className="group rounded-card border border-line bg-panel p-4 text-left transition hover:border-line-strong hover:bg-raised"
          >
            <div className="line-clamp-2 text-[15px] font-medium leading-snug text-fg">
              {d.title}
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-fg-faint">
              <span className="tabular-nums">{d.slides} slides</span>
              {d.theme && (
                <>
                  <span className="text-line-strong">·</span>
                  <span className="font-mono">{d.theme}</span>
                </>
              )}
            </div>
            <div className="mt-3 border-t border-line pt-2.5 text-[10.5px] text-fg-faint">
              {new Date(d.updated).toLocaleString()}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function DeckDetail({ slug, onBack, refreshToken }) {
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
  const renderTimer = useRef(null);

  useEffect(() => {
    // refreshToken bumps after a chat turn, so a deck edited in the right rail
    // shows its new slides here without a manual reload.
    api.deck(slug).then((r) => {
      const stamp = Date.now();
      setData({
        ...r,
        slides: r.slides.map((s) => `${s}?t=${stamp}`),
        thumbs: r.thumbs.map((s) => `${s}?t=${stamp}`),
      });
      setTheme(r.deck.theme ?? "");
      setStyle(r.deck.style ?? "");
    });
    api.themes().then((r) => setThemes(r.themes)).catch(() => {});
    api.styles().then((r) => setStyles(r.styles)).catch(() => {});
    // Team members for the presenter picker; the deck's own meta snapshot wins.
    api.identity().then((r) => setIdentity(r.identity ?? {})).catch(() => {});
  }, [slug, refreshToken]);

  const members = (data?.meta?.team?.members?.length
    ? data.meta.team.members
    : identity?.team?.members) ?? [];

  /**
   * Persist a deck mutation directly to deck.yaml (never through a model), then
   * re-render. The grid updates optimistically so the change is visible
   * immediately; the rasterised preview catches up within a beat.
   */
  function commitDeck(nextDeck) {
    setData((d) => (d ? { ...d, deck: nextDeck } : d));
    api.saveDeck(slug, nextDeck, data?.meta)
      .then(() => {
        clearTimeout(renderTimer.current);
        setSyncing(true);
        renderTimer.current = setTimeout(runRender, 450);
      })
      .catch((err) => setProblems([err.message, ...(err.errors ?? [])]));
  }

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

  if (!data) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-9">
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

  return (
    <div className="mx-auto max-w-6xl px-8 py-9">
      <button
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-fg-faint transition hover:text-fg"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18 9 12l6-6" />
        </svg>
        All decks
      </button>

      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <h1 className="text-[1.7rem] font-semibold leading-tight tracking-tight">
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
              className="appearance-none rounded-lg border border-line bg-sunken py-2 pl-3 pr-8 text-sm text-fg outline-none transition hover:border-line-strong focus:border-accent"
            >
              <option value="">from deck.yaml</option>
              {themes.map((t) => (
                <option key={t.name} value={t.name}>{t.label}</option>
              ))}
            </select>
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>

          <div className="relative">
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              title="Style — a cross-cutting density/layout variant on top of the theme"
              className="appearance-none rounded-lg border border-line bg-sunken py-2 pl-3 pr-8 text-sm text-fg outline-none transition hover:border-line-strong focus:border-accent"
            >
              <option value="">theme default</option>
              {styles.map((s) => (
                <option key={s.name} value={s.name}>{s.label}</option>
              ))}
            </select>
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>

          <Button variant="primary" onClick={rerender} disabled={busy}>
            {busy && <Spinner />}
            {busy ? "Rendering" : "Render"}
          </Button>

          <a
            href={`/api/decks/${slug}/download/deck.pptx`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-sm text-fg-muted transition hover:border-line-strong hover:text-fg"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" />
            </svg>
            .pptx
          </a>
        </div>
      </header>

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

      {data.slides.length === 0 ? (
        <div className="mt-7">
          <Empty
            title="Not rendered yet"
            hint="Render turns deck.yaml into a .pptx, then rasterises it so you can check the result before opening PowerPoint."
            action={<Button variant="primary" onClick={rerender} disabled={busy}>Render now</Button>}
          />
        </div>
      ) : (
        <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {slides.map((slide, i) => {
            const src = data.slides[i];
            return (
              <div key={i} className="rounded-card border border-line bg-panel p-2">
                <button
                  onClick={() => setZoom(i)}
                  className="block w-full text-left"
                  title="View full size"
                >
                  <div className="slide-frame overflow-hidden rounded-lg ring-accent transition group-hover:ring-2">
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
                  <select
                    value={slide?.presenter ?? ""}
                    onChange={(e) => onPresenter(i, e.target.value)}
                    title="Who presents this slide"
                    className="ml-auto max-w-[7rem] appearance-none rounded border border-line bg-sunken px-1.5 py-0.5 text-[10.5px] text-fg-muted outline-none transition hover:border-line-strong focus:border-accent"
                  >
                    <option value="">auto</option>
                    {members.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
                  </select>
                </div>

                <div className="mt-1 flex items-center justify-between">
                  <div className="flex items-center gap-0.5">
                    <CardBtn onClick={() => setEditing(i)} title="Edit content"><EditIcon /></CardBtn>
                    <CardBtn onClick={() => onMove(i, -1)} disabled={i === 0} title="Move left"><UpIcon /></CardBtn>
                    <CardBtn onClick={() => onMove(i, 1)} disabled={i === slides.length - 1} title="Move right"><DownIcon /></CardBtn>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <CardBtn onClick={() => onDuplicate(i)} title="Duplicate"><CopyIcon /></CardBtn>
                    <CardBtn onClick={() => onDelete(i)} disabled={slides.length <= 1} title="Delete"><TrashIcon /></CardBtn>
                  </div>
                </div>
              </div>
            );
          })}
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
    </div>
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
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...icon}>
    <path d="M3 6h18M8 6V4h8v2m1 0-1 14H8L7 6M10 11v6M14 11v6" />
  </svg>
);
