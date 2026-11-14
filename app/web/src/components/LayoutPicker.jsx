// Other ways to lay out the current slide, drawn as thumbnails. The
// server compiles them from the slide's intent with the person's work
// carried across; picking one replaces the slide in one undoable step.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { sceneToSvg } from "../../../../packages/editor/scene-svg.js";

const WHY = {
  detached: "This slide is your own, so it has no other layouts.",
  "no-intent": "This slide was not made from the deck's content, so it has no other layouts.",
  fixed: "This kind of slide has one layout.",
};

// `at` is the opening button's rect (the toolbar scrolls sideways and
// would clip a child). `load` returns { options, reason }.
export default function LayoutPicker({ at, load, onPick, onClose }) {
  const ref = useRef(null);
  const [state, setState] = useState({ busy: true, options: [], reason: null, error: null });
  useEffect(() => {
    let live = true;
    load().then((out) => { if (live) setState({ busy: false, options: out.options ?? [], reason: out.reason ?? null, error: null }); })
      .catch((err) => { if (live) setState({ busy: false, options: [], reason: null, error: err.message }); });
    return () => { live = false; };
  }, [load]);
  useEffect(() => {
    const away = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", key, true); };
  }, [onClose]);
  useEffect(() => { if (!state.busy) ref.current?.querySelector("button[data-layout-option]:not([aria-pressed=true])")?.focus(); }, [state.busy]);
  const width = 360;
  const left = Math.max(8, Math.min(at?.left ?? 8, (typeof window !== "undefined" ? window.innerWidth : 1e4) - width - 8));
  const only = !state.busy && !state.error && state.options.length <= 1;
  return createPortal(
    <div ref={ref} role="dialog" aria-label="Slide layout" data-layout-picker
      style={{ position: "fixed", left, top: (at?.bottom ?? 48) + 4, width, zIndex: 60 }}
      className="max-h-[70vh] overflow-y-auto rounded-card border border-line bg-panel p-2 text-fg shadow-[var(--shadow-float)]">
      {state.busy && <div className="p-2 text-[12.5px] text-fg-muted">Laying out…</div>}
      {state.error && <div role="alert" className="p-2 text-[12.5px] text-danger">{state.error}</div>}
      {only && <div className="p-2 text-[12.5px] text-fg-muted">{WHY[state.reason] ?? "No other layout fits this slide's content."}</div>}
      {!state.busy && state.options.length > 1 && (
        <div className="grid grid-cols-2 gap-2">
          {state.options.map((o) => (
            <button key={o.key} type="button" data-layout-option={o.key} aria-pressed={o.current ? "true" : "false"}
              onClick={() => { if (!o.current) onPick(o); onClose(); }}
              className={`flex flex-col gap-1 rounded-md p-1 text-left text-[12px] transition hover:bg-raised focus:bg-raised focus:outline-none ${o.current ? "ring-2 ring-accent" : ""}`}>
              <span aria-hidden="true" className="block overflow-hidden rounded border border-line bg-white [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: sceneToSvg(o.scene) }} />
              <span className={o.current ? "text-fg" : "text-fg-muted"}>{o.label}{o.current ? " · current" : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
