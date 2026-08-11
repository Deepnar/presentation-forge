import { useEffect, useState } from "react";
import { api } from "../api.js";

/**
 * README viewer. Plain text in a pre — no markdown dependency, no dead links,
 * and only two states (loading / error). Esc or backdrop closes.
 */
export default function DocsModal({ onClose }) {
  const [text, setText] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.docs().then(setText).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-sunken/95 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-card border border-line bg-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <span className="text-[13px] font-semibold text-fg">Documentation</span>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg"
            aria-label="Close docs"
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!text && !error && <div className="skeleton h-48 rounded-lg" />}
          {error && <div className="text-xs leading-relaxed text-amber">{error}</div>}
          {text && (
            <pre className="whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-fg-muted">{text}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
