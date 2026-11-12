// The right-click menu on the slide: what PowerPoint, Slides and Canva put
// under the pointer — clipboard, layering, alignment — so none of it needs
// a toolbar button to be found. Alignment is a row of glyphs, not words.
import { useEffect, useRef } from "react";

const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "") ? "⌘" : "Ctrl+";

// 16px glyphs: a bar for the line being aligned to, blocks for the boxes.
const G = {
  left: <><path d="M2 1v14" /><rect x="4" y="3" width="9" height="4" /><rect x="4" y="9" width="6" height="4" /></>,
  center: <><path d="M8 1v14" /><rect x="3" y="3" width="10" height="4" /><rect x="5" y="9" width="6" height="4" /></>,
  right: <><path d="M14 1v14" /><rect x="3" y="3" width="9" height="4" /><rect x="6" y="9" width="6" height="4" /></>,
  top: <><path d="M1 2h14" /><rect x="3" y="4" width="4" height="9" /><rect x="9" y="4" width="4" height="6" /></>,
  middle: <><path d="M1 8h14" /><rect x="3" y="3" width="4" height="10" /><rect x="9" y="5" width="4" height="6" /></>,
  bottom: <><path d="M1 14h14" /><rect x="3" y="3" width="4" height="9" /><rect x="9" y="6" width="4" height="6" /></>,
  x: <><path d="M1 2v12M15 2v12" /><rect x="3" y="5" width="3" height="6" /><rect x="10" y="5" width="3" height="6" /></>,
  y: <><path d="M2 1h12M2 15h12" /><rect x="5" y="3" width="6" height="3" /><rect x="5" y="10" width="6" height="3" /></>,
};
const ALIGN = [["left", "Align left"], ["center", "Align centre"], ["right", "Align right"], ["top", "Align top"], ["middle", "Align middle"], ["bottom", "Align bottom"]];

function Glyph({ name }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">{G[name]}</svg>
  );
}

export default function StageMenu({ at, count, overflowing, grouped, canPaste, onAction, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const away = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("blur", onClose);
    ref.current?.querySelector("button:not(:disabled)")?.focus();
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  // Kept on screen: a click near the right or bottom edge opens the menu
  // up or left of the pointer instead of off the window.
  const left = Math.min(at.x, (typeof window !== "undefined" ? window.innerWidth : 1e4) - 240);
  const top = Math.min(at.y, (typeof window !== "undefined" ? window.innerHeight : 1e4) - (count ? 330 : 100));
  const run = (type, arg) => { onAction(type, arg); onClose(); };
  const item = (label, type, hint, disabled = false) => (
    <button type="button" role="menuitem" data-stage-action={type} disabled={disabled} onClick={() => run(type)}
      className="flex w-full items-center justify-between gap-6 rounded px-2.5 py-1.5 text-left text-[13px] hover:bg-raised focus:bg-raised focus:outline-none disabled:opacity-40">
      <span>{label}</span>{hint && <span className="text-[12px] text-fg-muted">{hint}</span>}
    </button>
  );
  const rule = <div role="separator" className="my-1 h-px bg-line" />;
  const glyph = (name, label, type) => (
    <button key={name} type="button" role="menuitem" title={label} aria-label={label} data-stage-action={`${type}:${name}`} onClick={() => run(type, name)}
      className="grid h-8 w-8 place-items-center rounded hover:bg-raised focus:bg-raised focus:outline-none">
      <Glyph name={name} />
    </button>
  );

  return (
    <div ref={ref} role="menu" aria-label="Slide actions" data-stage-menu
      style={{ position: "fixed", left, top, zIndex: 60 }}
      className="w-56 rounded-card border border-line bg-panel p-1 text-fg shadow-[var(--shadow-float)]"
      onContextMenu={(e) => e.preventDefault()}>
      {count > 0 ? (
        <>
          {item("Cut", "cut", `${MOD}X`)}
          {item("Copy", "copy", `${MOD}C`)}
          {item("Paste", "paste", `${MOD}V`, !canPaste)}
          {item("Duplicate", "duplicate", `${MOD}D`)}
          {item("Delete", "delete", "Del")}
          {overflowing && <>{rule}{item("Shrink text to fit", "shrink")}</>}
          {(count >= 2 || grouped) && rule}
          {count >= 2 && item("Group", "group", `${MOD}G`)}
          {grouped && item("Ungroup", "ungroup", `${MOD}Shift+G`)}
          {rule}
          {item("Bring to front", "front")}
          {item("Send to back", "back")}
          {rule}
          <div role="group" aria-label="Align" className="flex flex-wrap px-1">
            {ALIGN.map(([name, label]) => glyph(name, label, "align"))}
            {count >= 3 && glyph("x", "Distribute across", "distribute")}
            {count >= 3 && glyph("y", "Distribute down", "distribute")}
          </div>
        </>
      ) : (
        <>
          {item("Paste", "paste", `${MOD}V`, !canPaste)}
          {item("Select all", "selectAll", `${MOD}A`)}
        </>
      )}
    </div>
  );
}
