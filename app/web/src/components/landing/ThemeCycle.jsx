import { useEffect, useRef, useState } from "react";
import { SlideImage } from "./parts.jsx";

/**
 * One slide, every theme, advanced by scrolling.
 *
 * Sticky rather than a pinned GSAP timeline. A pin rewrites the document with
 * spacer elements and takes ownership of the scroll; `position: sticky` is the
 * browser doing the same job natively, so it survives a resize, a zoom, a
 * touch fling and reduced motion without a second code path. All this listener
 * does is turn scroll position into an index.
 *
 * There is deliberately nothing to click. Reaching the end of the section
 * means having seen every theme, rather than having thought to interact.
 */
export default function ThemeCycle({ manifest }) {
  const themes = manifest?.themes ?? [];
  const wrapRef = useRef(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !themes.length) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const r = wrap.getBoundingClientRect();
      const travel = r.height - window.innerHeight;
      if (travel <= 0) return;
      const p = Math.min(1, Math.max(0, -r.top / travel));
      // The last theme gets the tail of the scroll rather than a single
      // instant at p === 1, which is otherwise unreachable on a trackpad.
      setActive(Math.min(themes.length - 1, Math.floor(p * themes.length * 0.999)));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [themes.length]);

  if (!themes.length) return null;
  const current = themes[active];

  return (
    <div ref={wrapRef} data-section="themes" style={{ height: `${themes.length * 42 + 60}vh` }}>
      <div className="sticky top-0 flex h-screen flex-col justify-center px-5 sm:px-8">
        <div className="mx-auto w-full max-w-5xl">
          <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
            {themes.map((t, i) => {
              const s = t.slides.find((x) => x.type === "stats") ?? t.slides[0];
              const on = i === active;
              return (
                <div
                  key={t.name}
                  aria-hidden={!on}
                  className="absolute inset-0 transition-opacity"
                  style={{
                    opacity: on ? 1 : 0,
                    transitionDuration: "var(--dur-base)",
                    transitionTimingFunction: "var(--ease-out-quint)",
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

          <div className="mt-6 flex items-baseline justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[15px] font-medium text-fg">{current.label}</div>
              <div className="truncate text-[12.5px] text-fg-faint">
                Same words, same slide. Only the theme changed.
              </div>
            </div>
            <div className="shrink-0 font-mono text-[12px] text-fg-faint">
              {String(active + 1).padStart(2, "0")} / {String(themes.length).padStart(2, "0")}
            </div>
          </div>

          {/* A rail rather than dots: twelve dots at this size is noise, and the
              rail also shows how far through the section the reader is. */}
          <div className="mt-3 h-px w-full bg-line">
            <div
              className="h-px bg-accent transition-[width]"
              style={{
                width: `${((active + 1) / themes.length) * 100}%`,
                transitionDuration: "var(--dur-base)",
                transitionTimingFunction: "var(--ease-out-quint)",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
