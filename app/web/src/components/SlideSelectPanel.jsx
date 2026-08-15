import { useEffect, useRef, useState } from "react";
import { Button, Spinner, Tooltip } from "./ui.jsx";
import { ChevronDown } from "./icons.jsx";

/**
 * The chat's slide-selection panel — how the user tells the AI WHICH slides
 * they mean. Rendered beside the thread once the deck is ready (~40% width,
 * the chat shifts left): every slide as a scrollable card, click to select
 * one or many, and the selection flows into the next turn's context by index
 * and content excerpt. The enlarged view (openSlide) keeps the panel honest —
 * selection is by looking, not by guessing numbers.
 *
 * The selected set is a Set of slide indices held by the parent (ChatView);
 * this component is the surface, never the store.
 */
export default function SlideSelectPanel({
  slides,        // [{ type, headline, ... }] deck content
  thumbs,        // preview URLs, index-aligned
  types,         // type descriptions for labels
  selected,      // Set<number>
  onToggle,      // (index) => void
  onClear,       // () => void
  openSlide,     // (index) => void — enlarge a slide
  openIndex,     // number | null — the currently enlarged slide
  busy,          // a turn/punch is running
  onPunch,       // () => void — punch up the selected set
  punching,      // bool
  onSwap,        // () => void — swap type of the selected set
  swapping,      // bool
}) {
  const listRef = useRef(null);
  const n = slides.length;

  // Keep the enlarged slide visible as selection moves.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-i="${openIndex}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [openIndex]);

  const label = (t) => types?.[t]?.label ?? t ?? "slide";

  return (
    <div className="flex h-full min-w-0 flex-col border-l border-line bg-base/60">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11.5px] font-semibold text-fg">Slides</div>
          <div className="truncate text-[10.5px] text-fg-faint">
            {n} slide{n === 1 ? "" : "s"}{selected.size > 0 && ` · ${selected.size} selected`}
          </div>
        </div>
        {selected.size > 0 && (
          <button
            onClick={onClear}
            className="rounded px-2 py-1 text-[11px] text-fg-faint transition hover:bg-hover hover:text-fg"
          >
            Clear
          </button>
        )}
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-1.5">
          {slides.map((s, i) => {
            const on = selected.has(i);
            const enlarged = i === openIndex;
            return (
              <button
                key={i}
                data-i={i}
                onClick={() => onToggle(i)}
                onDoubleClick={() => openSlide(i)}
                title={s.headline ?? label(s.type)}
                className={`group relative overflow-hidden rounded-md border text-left transition ${
                  on
                    ? "border-accent ring-1 ring-accent"
                    : "border-line hover:border-line-strong"
                }`}
              >
                {thumbs[i] ? (
                  <img src={thumbs[i]} alt={`Slide ${i + 1}`} className="block w-full" />
                ) : (
                  <div className="grid h-16 w-full place-items-center text-[10px] text-fg-faint">
                    {label(s.type)}
                  </div>
                )}
                <span className="absolute left-1 top-1 rounded bg-sunken/90 px-1 font-mono text-[9.5px] tabular-nums text-fg-muted">
                  {i + 1}
                </span>
                {on && (
                  <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-accent text-[9px] text-white">
                    ✓
                  </span>
                )}
                {enlarged && (
                  <span className="absolute inset-0 border-2 border-accent/60" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 border-t border-line p-2">
        <div className="mb-1.5 px-0.5 text-[10.5px] leading-relaxed text-fg-faint">
          {selected.size === 0
            ? "Select slides, then tell the AI what to do with them — it will know exactly which you mean."
            : `${selected.size} selected — the next message names them by number and content.`}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={onPunch} disabled={selected.size === 0 || busy || punching}>
            {punching ? <Spinner /> : <BoltIcon />}
            Punch up
          </Button>
          <Button size="sm" variant="outline" onClick={onSwap} disabled={selected.size === 0 || busy || swapping}>
            {swapping ? <Spinner /> : <SwapIcon />}
            Swap type
          </Button>
          <button
            onClick={() => openSlide(Math.max(0, openIndex ?? 0))}
            disabled={n === 0}
            className="ml-auto rounded-md p-1.5 text-fg-faint transition hover:bg-hover hover:text-fg disabled:opacity-40"
            title={openIndex != null ? `Slide ${openIndex + 1} enlarged — Esc to close` : "Enlarge a slide"}
          >
            <ExpandIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

const icon = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
const BoltIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...icon}><path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5Z" /></svg>
);
const SwapIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...icon}><path d="M3 12h18M12 3v18M8 8l-4 4 4 4M16 8l4 4-4 4" /></svg>
);
const ExpandIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...icon}><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
);
