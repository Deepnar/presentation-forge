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
  if (!viewer || !snap || !Array.isArray(snap.selectedIds)) return [];
  return snap.selectedIds.map((id) => viewer.inspect(id)).filter(Boolean);
}

export default function SceneViewer({ initial = {} }) {
  const initialDeck = DECKS.some((d) => d.name === initial.deck) ? initial.deck : DECKS[0].name;
  const [deckName, setDeckName] = useState(initialDeck);
  const deck = useMemo(() => DECKS.find((d) => d.name === deckName) ?? DECKS[0], [deckName]);
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
      <aside style={{ width: 172, overflowY: "auto", padding: 12, borderRight: "1px solid #333" }} aria-label="Slides">
        <div style={{ marginBottom: 8, fontSize: 12, opacity: 0.7 }}>
          {(snap?.slideIndex ?? 0) + 1} / {snap?.slideCount ?? deck.scenes.length}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {deck.scenes.map((s, i) => (
            <Thumb key={s.id} scene={s} active={i === snap?.slideIndex} onPick={() => api?.goTo(i)} />
          ))}
        </div>
      </aside>
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #333", flexWrap: "wrap" }}>
          <select aria-label="Deck" value={deckName} onChange={(e) => setDeckName(e.target.value)}>
            {DECKS.map((d) => <option key={d.name} value={d.name}>{d.name} ({d.theme}, {d.variant})</option>)}
          </select>
          <button type="button" onClick={() => api?.prev()}>← Prev</button>
          <button type="button" onClick={() => api?.next()}>Next →</button>
          <button type="button" onClick={() => api?.zoomOut()} aria-label="Zoom out">−</button>
          <span aria-live="polite" style={{ minWidth: 56, textAlign: "center" }}>{Math.round((snap?.zoom ?? 1) * 100)}%</span>
          <button type="button" onClick={() => api?.zoomIn()} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => api?.resetZoom()}>Fit</button>
          <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.8 }}>
            {snap?.slideId ?? ""}{(snap?.selectedIds?.length ?? 0) > 0 ? ` · ${snap.selectedIds.length} selected` : ""}
          </span>
        </div>
        {inspected.length > 0 && (
          <div
            data-inspector
            aria-label="Selection inspector"
            style={{
              padding: "6px 12px", borderBottom: "1px solid #333", fontSize: 11,
              fontFamily: "ui-monospace, monospace", background: "#242220",
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
        <div
          ref={scrollRef}
          style={{ flex: 1, overflow: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 24 }}
        >
          <div
            ref={mountRef}
            tabIndex={0}
            role="application"
            aria-label={`Slide ${snap?.slideId ?? ""}`}
            style={{
              width: slideW, height: slideH, flexShrink: 0,
              transform: `scale(${scale})`, transformOrigin: "top center",
              background: "#fff", borderRadius: 4, overflow: "hidden",
              outline: "none",
            }}
          />
        </div>
        {/* Selection rings render as overlay boxes from scene-dom
        (data-overlay); the state attribute below is the DOM contract
        tests assert, not a visual. */}
        <style>{`aside[aria-label="Slides"] svg { width: 100% !important; height: auto !important; display: block; }`}</style>
      </main>
    </div>
  );
}
