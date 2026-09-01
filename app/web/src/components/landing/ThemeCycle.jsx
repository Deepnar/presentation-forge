import { useRef } from "react";
import { useSceneProgress } from "../../lib/scene.js";
import { SlideImage } from "./parts.jsx";

/**
 * One slide, every theme, advanced by scrolling.
 *
 * This is the product's central claim made checkable — the content was written
 * once, and the theme decided every colour, typeface and coordinate. Saying
 * that in a paragraph is a claim; watching the words stay put while everything
 * around them changes is a demonstration.
 *
 * The heading is INSIDE the sticky frame. It used to sit in a block above,
 * which meant the frame started below the fold: at the top of the section the
 * slide was centred in a box that had barely entered the viewport, and the
 * reader got most of a screen of nothing before it caught up.
 *
 * Nothing here is clickable on purpose. Reaching the end of the section means
 * having seen every theme, not having thought to interact.
 */
export default function ThemeCycle({ manifest, themeCount, onBrowseThemes }) {
  const themes = manifest?.themes ?? [];
  const ref = useRef(null);
  const p = useSceneProgress(ref, [themes.length]);
  if (!themes.length) return null;

  const active = Math.min(themes.length - 1, Math.floor(p * themes.length * 0.999));
  const current = themes[active];

  return (
    <div ref={ref} data-section="themes" style={{ height: `${themes.length * 18 + 90}vh` }}>
      <div className="sticky top-0 flex h-screen items-center overflow-hidden px-5 sm:px-8">
        <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-center">
          <div className="reveal">
            <div className="eyebrow">One deck, every theme</div>
            <h2 className="display-3 mt-3 text-fg">The words are yours. The design is not your problem.</h2>
            <p className="lede mt-4 text-[15px]">
              A theme owns every colour, typeface and coordinate. The writing never touches them,
              so swapping one for another re-lays nothing out.
            </p>

            <div className="mt-7 flex items-baseline justify-between gap-3">
              <div className="min-w-0 text-[15px] font-medium text-fg">{current.label}</div>
              <div className="shrink-0 font-mono text-[11.5px] text-fg-faint">
                {String(active + 1).padStart(2, "0")} / {String(themes.length).padStart(2, "0")}
              </div>
            </div>
            {/* A rail, not dots: twelve dots at this size is noise, and the rail
                also says how much of the section is left. */}
            <div className="mt-2 h-px w-full bg-line">
              <div
                className="h-px bg-accent"
                style={{
                  width: `${((active + 1) / themes.length) * 100}%`,
                  transition: "width var(--dur-base) var(--ease-out-quint)",
                }}
              />
            </div>
            <div className="mt-2 text-[12px] text-fg-faint">Same words, same slide. Only the theme changed.</div>
            {/* The twelve here are the ones worth flaunting; the full gallery
                is a page of its own rather than thirty-four more cards at the
                bottom of this one. */}
            <button
              onClick={() => onBrowseThemes?.()}
              className="press mt-5 inline-flex items-center gap-1.5 rounded-pill border border-line-strong bg-panel px-4 py-2 text-[13px] font-medium text-fg transition-colors hover:bg-hover"
            >
              {themeCount ? `See all ${themeCount} themes` : "See every theme"}
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m0 0-5-5m5 5-5 5" /></svg>
            </button>
          </div>

          <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
            {themes.map((t, i) => {
              const s = t.slides.find((x) => x.type === "stats") ?? t.slides[0];
              const on = i === active;
              return (
                <div
                  key={t.name}
                  aria-hidden={!on}
                  className="absolute inset-0"
                  style={{
                    opacity: on ? 1 : 0,
                    transform: on ? "scale(1)" : "scale(0.985)",
                    transition: "opacity var(--dur-base) var(--ease-out-quint), transform var(--dur-base) var(--ease-out-quint)",
                  }}
                >
                  <SlideImage
                    src={`/api/landing/${s.file}`}
                    alt={`The same slide rendered in the ${t.label} theme`}
                    w={s.w}
                    h={s.h}
                    dark={s.dark}
                    priority={i === 0}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
