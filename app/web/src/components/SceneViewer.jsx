// SceneViewer — read-only V2 scene viewer. Thin React shell over
// packages/editor/scene-dom.js (the single viewer implementation;
// the headless smoke page drives the same module). React owns no
// viewer logic: it mounts one viewer per deck, mirrors snapshots,
// and forwards UI events to the viewer api. Scenes are never
// mutated here — selection is an id, geometry comes from the DOM.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createViewer } from "../../../../packages/editor/scene-dom.js";
import { sceneToSvg } from "../../../../packages/editor/scene-svg.js";
import { ensureDeckFonts } from "../fonts.js";
import { createLiveDeckLoader } from "../lib/liveDeck.js";
import mechPlain from "../scenes/mech-warm-humanist-plain.json";
import mechChromed from "../scenes/mech-warm-humanist-chromed.json";
import sourceOfTruth from "../scenes/source-of-truth-warm-humanist-plain.json";
import decision from "../scenes/decision-warm-humanist-plain.json";

const DECKS = [mechPlain, mechChromed, sourceOfTruth, decision];

function Thumb({ scene, active, onPick }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-current={active ? "true" : undefined}
      style={{
        display: "block", width: "100%", padding: 0, cursor: "pointer",
        border: active ? "2px solid #e0705a" : "1px solid #444",
        borderRadius: 6, overflow: "hidden", background: "#fff",
      }}
      dangerouslySetInnerHTML={{ __html: sceneToSvg(scene, { wrapText: true }) }}
    />
  );
}

function useInspector(viewer, snap) {
  if (!viewer?.api || !snap || !Array.isArray(snap.selectedIds)) return [];
  return snap.selectedIds.map((id) => viewer.api.inspect(id)).filter(Boolean);
}

// V2-5E shape-style panel: fill color, stroke color (or none), and
// stroke width for one selected shape. Local draft state commits
// explicitly (Apply, blur, or Enter) as a single element.setStyle —
// a color picker's drag never spams history. Remounted per
// element+revision (see key at the call site), so undo/redo and
// reselection always refresh values. Genuine no-ops commit nothing.
function StylePanel({ element, onCommit }) {
  const shape = element.shape ?? {};
  const [fill, setFill] = useState(`#${shape.fill ?? "FFFFFF"}`);
  const [stroke, setStroke] = useState(shape.stroke ? `#${shape.stroke}` : "");
  const [noStroke, setNoStroke] = useState(shape.stroke === undefined);
  const [width, setWidth] = useState(String(shape.strokeWidth ?? 1));
  const [error, setError] = useState(null);
  function commit() {
    const patch = {};
    const bare = (v) => v.replace(/^#/, "");
    if (bare(fill).toUpperCase() !== String(shape.fill ?? "FFFFFF").toUpperCase()) {
      if (!/^[0-9A-Fa-f]{6}$/.test(bare(fill))) {
        setError("fill must be a 6-digit hex color");
        return;
      }
      patch.fill = bare(fill).toUpperCase();
    }
    if (noStroke) {
      if (shape.stroke !== undefined) patch.stroke = null;
    } else if (stroke) {
      if (!/^[0-9A-Fa-f]{6}$/.test(bare(stroke))) {
        setError("stroke must be a 6-digit hex color or none");
        return;
      }
      if (bare(stroke).toUpperCase() !== String(shape.stroke ?? "").toUpperCase()) {
        patch.stroke = bare(stroke).toUpperCase();
      }
    }
    const n = Number(width);
    if (!Number.isFinite(n) || n < 0 || n > 24) {
      setError("stroke width must be a number from 0 to 24");
      return;
    }
    if (n !== (shape.strokeWidth ?? 1)) patch.strokeWidth = n;
    if (Object.keys(patch).length === 0) {
      setError(null);
      return;
    }
    setError(null);
    onCommit?.(patch);
  }
  const commitOnEnter = (e) => {
    if (e.key === "Enter") commit();
  };
  return (
    <div data-style-panel={element.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 12px", fontSize: 12, flexWrap: "wrap" }}>
      <span style={{ opacity: 0.8 }}>Style {element.id}</span>
      <label>Fill <input aria-label="Shape fill" type="color" value={/^#[0-9A-Fa-f]{6}$/.test(fill) ? fill : "#ffffff"} onChange={(e) => setFill(e.target.value)} onBlur={commit} /></label>
      <label>No stroke <input aria-label="Remove stroke" type="checkbox" checked={noStroke} onChange={(e) => setNoStroke(e.target.checked)} onBlur={commit} /></label>
      {!noStroke && (
        <label>Stroke <input aria-label="Shape stroke" type="color" value={/^#[0-9A-Fa-f]{6}$/.test(stroke) ? stroke : "#000000"} onChange={(e) => { setStroke(e.target.value); }} onBlur={commit} /></label>
      )}
      <label>Width <input aria-label="Stroke width" value={width} inputMode="decimal" style={{ width: 44 }} onChange={(e) => setWidth(e.target.value)} onBlur={commit} onKeyDown={commitOnEnter} /></label>
      <button type="button" onClick={commit}>Apply style</button>
      {error && <span role="alert" style={{ color: "#f0a090" }}>{error}</span>}
    </div>
  );
}

export default function SceneViewer({ initial = {} }) {
  const initialDeck = DECKS.some((d) => d.name === initial.deck) ? initial.deck : DECKS[0].name;
  const [deckName, setDeckName] = useState(initialDeck);
  const fixture = useMemo(() => DECKS.find((d) => d.name === deckName) ?? DECKS[0], [deckName]);
  // Live decks compile on the server and swap in on ready: the
  // displayed fixture stays mounted and interactive while a
  // request is in flight, so loading never flashes stale fonts
  // or tears down the stage. A swap remounts the viewer, which
  // clears selection by construction.
  const loaderRef = useRef(null);
  if (!loaderRef.current) {
    loaderRef.current = createLiveDeckLoader({
      compile: async ({ intent, theme, variant, signal }) => {
        const res = await fetch("/api/v2/scenes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intent, theme, variant }),
          signal,
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.ok) {
          const detail = Array.isArray(body?.errors) && body.errors.length > 0 ? `: ${body.errors[0]}` : "";
          throw new Error(`${body?.error ?? `request failed (${res.status})`}${detail}`);
        }
        return body;
      },
    });
  }
  const [liveSnap, setLiveSnap] = useState(() => loaderRef.current.snapshot());
  const [liveDeck, setLiveDeck] = useState(null);
  const [liveOpen, setLiveOpen] = useState(false);
  const [liveCatalog, setLiveCatalog] = useState({ examples: [], themes: [] });
  const [liveForm, setLiveForm] = useState({ example: "", theme: "", variant: "plain" });
  useLayoutEffect(() => loaderRef.current.subscribe((s) => {
    setLiveSnap(s);
    if (s.status === "ready" && s.deck) {
      // A new live deck discards any unsaved edits: without
      // persistence there is nowhere to keep them, so the reset
      // is explicit navigation, never silent loss mid-session.
      // An open text draft commits first (pending-edit policy);
      // the swap waits for a successful commit.
      const pending = adapterRef.current;
      const swap = () => {
        exitEdit();
        setEditedScenes(null);
        setLiveDeck({
          name: `live:${s.deck.deck.name}:${s.deck.deck.theme}:${s.deck.deck.variant}`,
          theme: s.deck.deck.theme,
          variant: s.deck.deck.variant,
          scenes: s.deck.scenes,
        });
      };
      if (pending?.hasPendingEdit?.()) {
        pending.commitPendingEdit().then((r) => {
          if (r.ok) swap();
        });
      } else {
        swap();
      }
    }
    // Loading and error keep the displayed deck untouched: the
    // previous scenes stay mounted until a newer compile lands.
  }), []);
  // Opening the Live panel loads its catalogs; the fixture-only
  // paths (smoke, eval) never fetch.
  useLayoutEffect(() => {
    if (!liveOpen) return undefined;
    let cancelled = false;
    Promise.all([
      fetch("/api/v2/examples").then((r) => r.json().catch(() => null)),
      fetch("/api/v2/themes").then((r) => r.json().catch(() => null)),
    ]).then(([ex, th]) => {
      if (cancelled) return;
      const examples = Array.isArray(ex?.examples) ? ex.examples : [];
      const themes = Array.isArray(th?.themes) ? th.themes : [];
      setLiveCatalog({ examples, themes });
      setLiveForm((f) => ({
        example: f.example || examples[0]?.id || "",
        theme: f.theme || examples[0]?.theme || themes[0] || "",
        variant: f.variant || "plain",
      }));
    }).catch(() => {
      if (!cancelled) setLiveCatalog({ examples: [], themes: [] });
    });
    return () => {
      cancelled = true;
    };
  }, [liveOpen]);
  function pickFixture(name) {
    guardedNav(() => {
      exitEdit();
      setEditedScenes(null);
      loaderRef.current.abort();
      setLiveDeck(null);
      setDeckName(name);
    });
  }
  // V2-5D pending-edit policy: filmstrip, deck, and zoom navigation
  // commit an open text draft first and proceed only on success.
  // The error stays visible with the draft preserved.
  function guardedNav(fn) {
    const adapter = adapterRef.current;
    if (editOn && adapter?.hasPendingEdit?.()) {
      adapter.commitPendingEdit().then((r) => {
        if (r.ok) fn();
      });
      return;
    }
    fn();
  }
  // V2-5C editing: an engine document over the displayed scenes
  // plus the interaction adapter. Toggling off keeps the edited
  // scenes on screen read-only (nothing is silently discarded);
  // only explicit deck navigation resets to fixtures — there is
  // no persistence yet, and the status line says so.
  const docRef = useRef(null);
  const adapterRef = useRef(null);
  const [editOn, setEditOn] = useState(false);
  const [editedScenes, setEditedScenes] = useState(null);
  const [editStatus, setEditStatus] = useState({ rev: 0, error: null, preparing: false });
  // V2-5D inline text state, mirrored from the adapter's onTextEdit
  // callback (the adapter owns the session; React only displays).
  const [textState, setTextState] = useState({ editing: false, elementId: null, conflict: null, overflow: null });
  function exitEdit() {
    // Pending-edit policy: leaving edit mode commits the draft
    // first; a failed commit keeps edit mode open with the error.
    const adapter = adapterRef.current;
    if (adapter?.hasPendingEdit?.()) {
      adapter.commitPendingEdit().then((r) => {
        if (r.ok) exitEdit();
      });
      return;
    }
    try {
      adapterRef.current?.detach();
    } catch { /* teardown only */ }
    adapterRef.current = null;
    docRef.current = null;
    setEditOn(false);
    setTextState({ editing: false, elementId: null, conflict: null, overflow: null });
    setEditStatus({ rev: 0, error: null, preparing: false });
  }
  async function enterEdit() {
    if (editOn || !viewerRef.current) return;
    setEditStatus({ rev: 0, error: null, preparing: true });
    try {
      const { createDocument } = await import("../../../../packages/model/engine.ts");
      const { attachEditor } = await import("../../../../packages/editor/scene-edit.js");
      const source = editedScenes ?? deck.scenes;
      const doc = await createDocument(structuredClone(source));
      const adapter = attachEditor(viewerRef.current, doc, {
        root: mountRef.current,
        onError: (r) => setEditStatus((s) => ({ ...s, error: `${r.code}: ${r.message}` })),
        onSync: (scenes) => {
          setEditedScenes(scenes);
          setEditStatus({ rev: doc.snapshot().revision, error: null, preparing: false });
        },
        onTextEdit: (e) => {
          setTextState({
            editing: e.editing,
            elementId: e.elementId ?? null,
            conflict: e.conflict ?? null,
            error: e.error ?? null,
            overflow: e.overflow ?? null,
          });
          if (e.committed) setEditStatus({ rev: doc.snapshot().revision, error: null, preparing: false });
        },
      });
      docRef.current = doc;
      adapterRef.current = adapter;
      setEditStatus({ rev: 0, error: null, preparing: false });
      setEditOn(true);
    } catch (err) {
      setEditStatus({ rev: 0, error: String(err?.message ?? err), preparing: false });
    }
  }
  // The displayed deck is the live compile when one is ready,
  // else the chosen fixture. Identity change remounts everything
  // downstream (fonts, viewer, selection).
  const deck = liveDeck ?? fixture;
  const mountRef = useRef(null);
  const scrollRef = useRef(null);
  const viewerRef = useRef(null);
  const [snap, setSnap] = useState(null);
  const [mountError, setMountError] = useState(null);
  // Font readiness gates the entire mount: the viewer (stage +
  // filmstrip) renders only after scene faces resolve, so neither
  // users nor screenshots ever see system-substitution flashes,
  // and evaluation never races them. Scenes are never recompiled
  // or mutated for fonts. A failed load still mounts and reports
  // via data-missing-fonts instead of hanging.
  const [fonts, setFonts] = useState({ settled: false, ready: false, missing: [] });
  useLayoutEffect(() => {
    let cancelled = false;
    setFonts({ settled: false, ready: false, missing: [] });
    ensureDeckFonts(deck.scenes).then((r) => {
      if (!cancelled) setFonts({ settled: true, ready: r.ready, missing: r.missing });
    });
    return () => {
      cancelled = true;
    };
  }, [deck]);

  // The mount runs only after scene faces settle (see above):
  // layout effect, not passive, so the mounted SVG exists before
  // paint (and before headless --dump-dom serializes), with final
  // faces — never a substitution flash.
  useLayoutEffect(() => {
    if (!fonts.settled) return undefined;
    const root = mountRef.current;
    if (!root) return undefined;
    let viewer;
    try {
      viewer = createViewer(root, deck.scenes);
    } catch (err) {
      setMountError(err?.message ?? String(err));
      return undefined;
    }
    setMountError(null);
    viewerRef.current = viewer;
    const off = viewer.onChange(setSnap);
    const startSlide = Number.isFinite(Number(initial.slide)) ? Number(initial.slide) : 0;
    const startZoom = Number.isFinite(Number(initial.zoom)) ? Number(initial.zoom) : 1;
    viewer.api.setZoom(startZoom);
    viewer.api.goTo(startSlide);
    if (typeof initial.select === "string" && initial.select) viewer.api.select(initial.select);
    // Eager initial fit: ResizeObserver covers later resizes, but
    // the first paint must not wait for an observation round-trip.
    const box = scrollRef.current?.getBoundingClientRect();
    if (box && box.width > 0 && box.height > 0) viewer.api.refit(box.width, box.height);
    setSnap(viewer.api.snapshot());
    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
        const box = scrollRef.current?.getBoundingClientRect();
        if (box) viewer.api.refit(box.width, box.height);
      })
      : null;
    ro?.observe?.(scrollRef.current);
    // Keyboard lives in scene-dom (one behavior for every shell);
    // only teardown here.
    return () => {
      ro?.disconnect?.();
      off();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [deck, fonts.settled]);

  if (DECKS.length === 0) {
    return <div style={{ padding: 24 }}>No scene fixtures available.</div>;
  }
  if (mountError) {
    return (
      <div role="alert" style={{ padding: 24 }}>
        <h2>Scene failed to load</h2>
        <pre>{mountError}</pre>
      </div>
    );
  }

  const api = viewerRef.current?.api;
  const scale = snap ? snap.fit * snap.zoom : 1;
  const inspected = useInspector(viewerRef.current, snap);
  const slideW = 13.333 * 96;
  const slideH = 7.5 * 96;
  // Filmstrip follows engine edits while editing; fixtures otherwise.
  const shownScenes = editedScenes ?? deck.scenes;
  // V2-5E style target: the single selected unlocked shape on the
  // current slide, read from engine scenes while editing. Text and
  // multi selections get no style panel (explicit scope, not a
  // half-wired toolbar).
  const styledShape = editOn && snap?.selectedIds?.length === 1 && snap.slideIndex < shownScenes.length
    ? (shownScenes[snap.slideIndex]?.elements.find((e) => e.id === snap.selectedIds[0] && e.kind === "shape" && !e.locked) ?? null)
    : null;

  return (
    <div style={{ display: "flex", height: "100vh", background: "#1c1a18", color: "#eee", fontFamily: "system-ui, sans-serif" }}>
      <div
        aria-live="polite"
        data-viewer-state={JSON.stringify({
          slideId: snap?.slideId ?? null,
          slideIndex: snap?.slideIndex ?? 0,
          slideCount: snap?.slideCount ?? 0,
          zoom: snap?.zoom ?? 1,
          selectedId: snap?.selectedId ?? null,
          selectedIds: snap?.selectedIds ?? [],
        })}
        data-fonts-ready={fonts.settled ? (fonts.ready ? "true" : "false") : "pending"}
        data-missing-fonts={fonts.missing.join(",")}
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
      />
      {editOn && (
        <div
          data-edit-state={JSON.stringify({ rev: editStatus.rev, error: editStatus.error, preparing: editStatus.preparing })}
          data-editing="true"
          style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
        />
      )}
      <aside style={{ width: 172, overflowY: "auto", padding: 12, borderRight: "1px solid #333" }} aria-label="Slides">
        <div style={{ marginBottom: 8, fontSize: 12, opacity: 0.7 }}>
          {(snap?.slideIndex ?? 0) + 1} / {snap?.slideCount ?? deck.scenes.length}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {shownScenes.map((s, i) => (
            <Thumb key={s.id} scene={s} active={i === snap?.slideIndex} onPick={() => api && guardedNav(() => api.goTo(i))} />
          ))}
        </div>
      </aside>
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #333", flexWrap: "wrap" }}>
          <select aria-label="Deck" value={liveDeck ? liveDeck.name : deckName} onChange={(e) => pickFixture(e.target.value)}>
            {DECKS.map((d) => <option key={d.name} value={d.name}>{d.name} ({d.theme}, {d.variant})</option>)}
            {liveDeck && <option value={liveDeck.name}>{liveDeck.name} (live)</option>}
          </select>
          <button type="button" onClick={() => api && guardedNav(() => api.prev())}>← Prev</button>
          <button type="button" onClick={() => api && guardedNav(() => api.next())}>Next →</button>
          <button type="button" onClick={() => api?.zoomOut()} aria-label="Zoom out">−</button>
          <span aria-live="polite" style={{ minWidth: 56, textAlign: "center" }}>{Math.round((snap?.zoom ?? 1) * 100)}%</span>
          <button type="button" onClick={() => api?.zoomIn()} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => api?.resetZoom()}>Fit</button>
          <button type="button" onClick={() => setLiveOpen((v) => !v)} aria-expanded={liveOpen}>Live</button>
          <button
            type="button"
            title={editOn ? "Leave edit mode (unsaved edits stay visible until you switch decks)" : "Edit this deck: drag, nudge, delete with undo"}
            onClick={() => (editOn ? exitEdit() : enterEdit())}
          >
            {editStatus.preparing ? "Preparing…" : editOn ? "Done" : "Edit"}
          </button>
          {editOn && (
            <>
              <button type="button" aria-label="Undo" disabled={textState.editing} title={textState.editing ? "Commit or cancel the text edit first" : "Undo"} onClick={() => adapterRef.current?.undo()}>↩ Undo</button>
              <button type="button" aria-label="Redo" disabled={textState.editing} title={textState.editing ? "Commit or cancel the text edit first" : "Redo"} onClick={() => adapterRef.current?.redo()}>↪ Redo</button>
              <button type="button" disabled={textState.editing} title={textState.editing ? "Commit or cancel the text edit first" : "Add an editable text box at the slide center"} onClick={() => adapterRef.current?.addTextElement()}>+ Text</button>
              <button type="button" disabled={textState.editing} title={textState.editing ? "Commit or cancel the text edit first" : "Add a rectangle"} onClick={() => adapterRef.current?.addShapeElement("rect")}>+ Rect</button>
              <button type="button" disabled={textState.editing} title={textState.editing ? "Commit or cancel the text edit first" : "Add a rounded rectangle"} onClick={() => adapterRef.current?.addShapeElement("roundRect")}>+ Round</button>
              <button type="button" disabled={textState.editing} title={textState.editing ? "Commit or cancel the text edit first" : "Add an ellipse"} onClick={() => adapterRef.current?.addShapeElement("ellipse")}>+ Ellipse</button>
            </>
          )}
          {editOn && textState.editing && (
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>
              <span style={{ opacity: 0.85 }}>editing text… Ctrl+Enter commits, Esc cancels</span>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { const a = adapterRef.current; if (a?.editingId?.()) a.commitTextEdit(); }}>Commit</button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => adapterRef.current?.cancelTextEdit()}>Cancel</button>
            </span>
          )}
          <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.8 }}>
            {snap?.slideId ?? ""}{(snap?.selectedIds?.length ?? 0) > 0 ? ` · ${snap.selectedIds.length} selected` : ""}
            {liveSnap.status === "loading" ? " · compiling…" : ""}
            {editOn ? ` · editing rev ${editStatus.rev}` : ""}
            {editedScenes && !editOn ? " · unsaved edits (read-only)" : ""}
          </span>
        </div>
        {editStatus.error && (
          <div role="alert" data-edit-error style={{ padding: "6px 12px", borderBottom: "1px solid #333", fontSize: 12, color: "#f0a090", background: "#242220" }}>
            Edit failed: {editStatus.error}
          </div>
        )}
        {textState.conflict && (
          <div role="alert" data-text-conflict style={{ padding: "6px 12px", borderBottom: "1px solid #333", fontSize: 12, color: "#f0c090", background: "#242220" }}>
            {textState.conflict}{" "}
            <button type="button" onClick={() => adapterRef.current?.commitTextEdit({ force: true })}>Overwrite with my draft</button>{" "}
            <button type="button" onClick={() => adapterRef.current?.cancelTextEdit()}>Discard draft</button>
          </div>
        )}
        {textState.overflow && (
          <div role="status" data-text-overflow style={{ padding: "6px 12px", borderBottom: "1px solid #333", fontSize: 12, color: "#e8d090", background: "#242220" }}>
            {textState.overflow}
          </div>
        )}
        {textState.editing && (
          <div data-text-editing={textState.elementId ?? "true"} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }} />
        )}
        {liveOpen && (
          <div
            data-live-panel
            aria-label="Live compilation"
            style={{
              display: "flex", gap: 8, alignItems: "center", padding: "6px 12px",
              borderBottom: "1px solid #333", fontSize: 12, flexWrap: "wrap", background: "#242220",
            }}
          >
            <select
              aria-label="Live example"
              value={liveForm.example}
              onChange={(e) => {
                const ex = liveCatalog.examples.find((x) => x.id === e.target.value);
                setLiveForm((f) => ({ ...f, example: e.target.value, theme: ex?.theme ?? f.theme, variant: ex?.variant ?? f.variant }));
              }}
            >
              {liveCatalog.examples.length === 0 && <option value="">(no examples — is the API running?)</option>}
              {liveCatalog.examples.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
            <select aria-label="Live theme" value={liveForm.theme} onChange={(e) => setLiveForm((f) => ({ ...f, theme: e.target.value }))}>
              {liveCatalog.themes.map((t) => <option key={t} value={t}>{t}</option>)}
              {liveForm.theme && !liveCatalog.themes.includes(liveForm.theme) && <option value={liveForm.theme}>{liveForm.theme}</option>}
            </select>
            <select aria-label="Live variant" value={liveForm.variant} onChange={(e) => setLiveForm((f) => ({ ...f, variant: e.target.value }))}>
              <option value="plain">plain</option>
              <option value="chromed">chromed</option>
            </select>
            <button
              type="button"
              disabled={liveSnap.status === "loading" || !liveForm.example}
              onClick={() => {
                const ex = liveCatalog.examples.find((x) => x.id === liveForm.example);
                if (!ex?.intent) return;
                loaderRef.current.load({ intent: ex.intent, theme: liveForm.theme, variant: liveForm.variant });
              }}
            >
              {liveSnap.status === "loading" ? "Compiling…" : "Compile live"}
            </button>
            <span aria-live="polite" role={liveSnap.status === "error" ? "alert" : undefined} style={{ opacity: 0.85 }}>
              {liveSnap.status === "error" ? `Error: ${liveSnap.error}` : liveDeck ? `Live: ${liveDeck.name}` : ""}
            </span>
          </div>
        )}
        {/* Inspector reserve: the wrapper always holds one line of
        space (transparent border when empty) so selecting never
        reflows the stage — the V2-5D double-click shift is fixed by
        layout, with the 600ms selection hold as backstop for
        multi-line inspectors. */}
        <div
          data-inspector-wrap
          style={{ minHeight: 30, boxSizing: "border-box", background: "#242220", borderBottom: (inspected.length > 0 || styledShape) ? "1px solid #333" : "1px solid transparent" }}
        >
        {inspected.length > 0 && (
          <div
            data-inspector
            aria-label="Selection inspector"
            style={{
              padding: "6px 12px", fontSize: 11,
              fontFamily: "ui-monospace, monospace",
              maxHeight: 88, overflowY: "auto",
            }}
          >
            {inspected.map((r) => (
              <div key={r.id} data-inspected={r.id}>
                {r.id} · {r.kind} · {r.w}×{r.h} @ {r.x},{r.y}
                {r.locked ? " · locked" : ""}{r.semanticRef ? ` · ref ${r.semanticRef}` : ""} · {r.provenance ?? "scene"}
              </div>
            ))}
          </div>
        )}
        {styledShape && (
          <StylePanel
            key={`${snap.slideId}:${styledShape.id}:${editStatus.rev}`}
            element={styledShape}
            onCommit={(patch) => adapterRef.current?.setElementStyle(styledShape.id, patch)}
          />
        )}
        </div>
        <div
          ref={scrollRef}
          data-scroll-container
          style={{ flex: 1, overflow: "auto", display: "flex", alignItems: "flex-start", justifyContent: "flex-start", padding: 24 }}
        >
          {/* Zoom-pan spacer: the layout footprint tracks the scaled
          slide, so zoomed slides scroll instead of overflowing
          paint-only. Scene coordinates are untouched — the mount
          keeps SVG px and top-left origin, and overlay boxes ride
          the same transform. margin auto centers at fit. */}
          <div style={{ width: slideW * scale, height: slideH * scale, flexShrink: 0, margin: "0 auto" }}>
            <div
              ref={mountRef}
              tabIndex={0}
              role="application"
              aria-label={`Slide ${snap?.slideId ?? ""}`}
              style={{
                width: slideW, height: slideH, flexShrink: 0,
                transform: `scale(${scale})`, transformOrigin: "top left",
                background: "#fff", borderRadius: 4, overflow: "hidden",
                outline: "none",
              }}
            />
          </div>
        </div>
        {/* Selection rings render as overlay boxes from scene-dom
        (data-overlay); the state attribute below is the DOM contract
        tests assert, not a visual. */}
        <style>{`aside[aria-label="Slides"] svg { width: 100% !important; height: auto !important; display: block; }`}</style>
      </main>
    </div>
  );
}
