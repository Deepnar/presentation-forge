// SceneViewer — read-only V2 scene viewer. Thin React shell over
// packages/editor/scene-dom.js (the single viewer implementation;
// the headless smoke page drives the same module). React owns no
// viewer logic: it mounts one viewer per deck, mirrors snapshots,
// and forwards UI events to the viewer api. Scenes are never
// mutated here — selection is an id, geometry comes from the DOM.
import { useEffect, useMemo, useRef, useState } from "react";
import { createViewer } from "../../../packages/editor/scene-dom.js";
import { sceneToSvg } from "../../../packages/editor/scene-svg.js";
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

function selectedInfo(root, snap) {
  if (!snap || !snap.selectedId || !root?.querySelector) return null;
  const node = root.querySelector(`[data-el="${snap.selectedId}"]`);
  if (!node) return { id: snap.selectedId, locked: false };
  return { id: snap.selectedId, locked: node.getAttribute("data-locked") === "true" };
}

export default function SceneViewer() {
  const [deckName, setDeckName] = useState(DECKS[0].name);
  const deck = useMemo(() => DECKS.find((d) => d.name === deckName) ?? DECKS[0], [deckName]);
  const mountRef = useRef(null);
  const scrollRef = useRef(null);
  const viewerRef = useRef(null);
  const [snap, setSnap] = useState(null);
  const [mountError, setMountError] = useState(null);

  useEffect(() => {
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
    setSnap(viewer.api.goTo(0));
    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
        const box = scrollRef.current?.getBoundingClientRect();
        if (box) viewer.api.refit(box.width, box.height);
      })
      : null;
    ro?.observe?.(scrollRef.current);
    const onKey = (ev) => {
      if (ev.key === "ArrowRight") viewer.api.next();
      else if (ev.key === "ArrowLeft") viewer.api.prev();
      else if (ev.key === "Home") viewer.api.goTo(0);
      else if (ev.key === "End") viewer.api.goTo(viewer.scenes.length - 1);
      else if (ev.key === "Escape") viewer.api.clearSelection();
      else if (ev.key === "+" || ev.key === "=") viewer.api.zoomIn();
      else if (ev.key === "-") viewer.api.zoomOut();
      else if (ev.key === "0") viewer.api.resetZoom();
      else return;
      ev.preventDefault();
    };
    root.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("keydown", onKey);
      ro?.disconnect?.();
      off();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [deck]);

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
  const info = selectedInfo(mountRef.current, snap);
  const slideW = 13.333 * 96;
  const slideH = 7.5 * 96;

  return (
    <div style={{ display: "flex", height: "100vh", background: "#1c1a18", color: "#eee", fontFamily: "system-ui, sans-serif" }}>
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
            {snap?.slideId ?? ""}{info ? ` · selected ${info.id}${info.locked ? " (locked)" : ""}` : ""}
          </span>
        </div>
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
        <style>{`[data-selected] { outline: 3px solid #e0705a !important; outline-offset: -3px; }`}</style>
      </main>
    </div>
  );
}
