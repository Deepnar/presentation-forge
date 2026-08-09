import { useEffect, useCallback, useRef } from "react";
import { Kbd } from "./ui.jsx";

/**
 * Full-screen slide viewer.
 *
 * Keyboard is the primary interface here — reviewing a deck means stepping
 * through it, and reaching for the mouse between every slide makes the review
 * pass tedious enough that it stops happening.
 *
 *   ← →  previous / next      Home End  first / last      Esc  close
 */
export default function Lightbox({ slides, thumbs, types, index, onIndex, onClose }) {
  const scrollerRef = useRef(null);
  const total = slides.length;

  const clamp = useCallback((i) => Math.max(0, Math.min(total - 1, i)), [total]);

  /** Absolute jump — filmstrip clicks and Home/End. */
  const go = useCallback((next) => onIndex(clamp(next)), [onIndex, clamp]);

  /**
   * Relative move, via the functional updater.
   *
   * Reading `index` from the closure loses keystrokes: several keydowns can
   * fire before React re-renders, so each one computes from the same stale
   * value and a held arrow key silently skips slides.
   */
  const step = useCallback(
    (delta) => onIndex((prev) => clamp(prev + delta)),
    [onIndex, clamp],
  );

  useEffect(() => {
    const onKey = (e) => {
      switch (e.key) {
        case "Escape": onClose(); break;
        case "ArrowRight":
        case "PageDown":
        case " ": e.preventDefault(); step(1); break;
        case "ArrowLeft":
        case "PageUp": e.preventDefault(); step(-1); break;
        case "Home": e.preventDefault(); go(0); break;
        case "End": e.preventDefault(); go(total - 1); break;
        default: break;
      }
    };
    window.addEventListener("keydown", onKey);
    // The grid behind must not scroll while the viewer is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [total, go, step, onClose]);

  // Keep the active filmstrip cell in view as the selection moves.
  useEffect(() => {
    scrollerRef.current
      ?.querySelector(`[data-i="${index}"]`)
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [index]);

  // Prefetch neighbours so stepping through does not flash.
  useEffect(() => {
    [index + 1, index - 1].forEach((i) => {
      if (slides[i]) new Image().src = slides[i];
    });
  }, [index, slides]);

  return (
    <div className="fade-in fixed inset-0 z-50 flex flex-col bg-sunken/95 backdrop-blur-sm">
      <header className="flex shrink-0 items-center gap-4 border-b border-line px-5 py-3">
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-sm tabular-nums text-fg">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="text-xs text-fg-faint">/ {total}</span>
        </div>
        {types?.[index] && (
          <span className="rounded bg-raised px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
            {types[index]}
          </span>
        )}

        <div className="ml-auto flex items-center gap-3 text-[11px] text-fg-faint">
          <span className="hidden items-center gap-1.5 sm:flex">
            <Kbd>←</Kbd><Kbd>→</Kbd> navigate
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            <Kbd>Esc</Kbd> close
          </span>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-fg-muted transition hover:bg-hover hover:text-fg"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-6">
        <NavButton side="left" disabled={index === 0} onClick={() => step(-1)} />
        <img
          key={slides[index]}
          src={slides[index]}
          alt={`Slide ${index + 1}`}
          className="fade-in max-h-full max-w-full rounded-lg shadow-2xl"
        />
        <NavButton side="right" disabled={index === total - 1} onClick={() => step(1)} />
      </div>

      <div
        ref={scrollerRef}
        className="flex shrink-0 gap-2 overflow-x-auto border-t border-line px-4 py-3"
      >
        {slides.map((_, i) => (
          <button
            key={i}
            data-i={i}
            onClick={() => go(i)}
            className={`relative shrink-0 overflow-hidden rounded transition ${
              i === index
                ? "ring-2 ring-accent"
                : "opacity-45 hover:opacity-80"
            }`}
            style={{ width: 104 }}
            aria-label={`Slide ${i + 1}`}
          >
            <img src={thumbs?.[i] ?? slides[i]} alt="" className="block w-full" />
          </button>
        ))}
      </div>
    </div>
  );
}

function NavButton({ side, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Previous slide" : "Next slide"}
      className={`absolute ${side === "left" ? "left-3" : "right-3"} top-1/2 z-10 -translate-y-1/2 rounded-full border border-line bg-panel/80 p-3 text-fg-muted backdrop-blur transition hover:border-line-strong hover:text-fg disabled:pointer-events-none disabled:opacity-0`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d={side === "left" ? "M15 18 9 12l6-6" : "m9 18 6-6-6-6"} />
      </svg>
    </button>
  );
}
