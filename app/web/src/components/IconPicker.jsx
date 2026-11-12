// A small grid of icons to drop on the slide — the emoji generated cards
// already use, grouped so the right one is a glance away, not a search.
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const GROUPS = [
  ["Marks", ["✅", "❌", "⚠️", "❓", "❗", "⭐", "📌", "🔖", "🏁", "🎯"]],
  ["Ideas & work", ["💡", "🧠", "🔑", "🔒", "⚙️", "🛠️", "🧩", "🚀", "📝", "🔗"]],
  ["Data & time", ["📈", "📉", "📊", "🧮", "🕒", "📅", "⏳", "🔢", "💰", "🏷️"]],
  ["Science & world", ["🔬", "🧪", "🧬", "⚡", "🔋", "🌍", "🌱", "💧", "🔥", "☀️"]],
  ["People", ["👥", "🙋", "🤝", "🎓", "🏫", "🏢", "💬", "📣", "❤️", "👍"]],
];

// `at` is the opening button's rect: the picker is placed against the
// window, because the toolbar scrolls sideways and would clip it.
export default function IconPicker({ at, onPick, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const away = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", key, true);
    ref.current?.querySelector("button")?.focus();
    return () => { document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", key, true); };
  }, [onClose]);
  // Rendered into the body: an ancestor's transform (the page transition)
  // would otherwise make "fixed" relative to it.
  return createPortal(
    <div ref={ref} role="dialog" aria-label="Insert an icon" data-icon-picker
      style={{ position: "fixed", left: Math.max(8, Math.min((at?.left ?? 8), (typeof window !== "undefined" ? window.innerWidth : 1e4) - 308)), top: (at?.bottom ?? 48) + 4, zIndex: 60 }}
      className="w-[300px] rounded-card border border-line bg-panel p-2 text-fg shadow-[var(--shadow-float)]">
      {GROUPS.map(([label, glyphs]) => (
        <div key={label} className="mb-1.5 last:mb-0">
          <div className="px-1 pb-0.5 text-[11px] text-fg-faint">{label}</div>
          <div className="grid grid-cols-10 gap-0.5">
            {glyphs.map((g) => (
              <button key={g} type="button" title={g} aria-label={`Insert ${g}`} data-icon={g}
                onClick={() => { onPick(g); onClose(); }}
                className="grid h-7 w-7 place-items-center rounded text-[18px] leading-none hover:bg-raised focus:bg-raised focus:outline-none">
                {g}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}
