import { useEffect, useRef, useState } from "react";
import { SlideImage } from "./parts.jsx";

const NAMES = {
  "metric-comparison": "Metric comparison",
  "pull-quote": "Pull quote",
  "feature-grid": "Feature grid",
  "kpi-dashboard": "KPI dashboard",
  "ranking-list": "Ranking",
  "before-after": "Before / after",
  "big-number": "Big number",
};
const label = (t) => NAMES[t] ?? t[0].toUpperCase() + t.slice(1).replace(/-/g, " ");

/**
 * The slide vocabulary, travelling sideways as the page scrolls down.
 *
 * The rail moved under a horizontal scrollbar before, which meant the reader
 * had to notice it was draggable and then drag it — on a landing page that is
 * the same as not showing it. Here vertical scroll is the only input, and the
 * whole set passes whether or not anyone thinks to interact.
 *
 * The travel distance is measured from the real laid-out width instead of
 * being assumed, so adding a slide type to the deck needs no constant changed
 * here, and a phone (where the cards are narrower) scrubs the right amount.
 */
export default function TypeScroll({ manifest }) {
  const slides = manifest?.showcase?.slides ?? [];
  const wrapRef = useRef(null);
  const trackRef = useRef(null);
  const [x, setX] = useState(0);

  useEffect(() => {
    const wrap = wrapRef.current;
    const track = trackRef.current;
    if (!wrap || !track || !slides.length) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const distance = Math.max(0, track.scrollWidth - window.innerWidth + 48);
      const r = wrap.getBoundingClientRect();
      const travel = r.height - window.innerHeight;
      if (travel <= 0) { setX(0); return; }
      const p = Math.min(1, Math.max(0, -r.top / travel));
      setX(p * distance);
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
  }, [slides.length]);

  if (!slides.length) return null;

  return (
    <div ref={wrapRef} data-section="types" style={{ height: `${Math.max(220, slides.length * 26)}vh` }}>
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden">
        <div
          ref={trackRef}
          className="flex w-max gap-6 px-6 will-change-transform sm:px-8"
          style={{ transform: `translate3d(${-x}px, 0, 0)` }}
        >
          {slides.map((s, i) => (
            <figure key={s.type} className="w-[min(78vw,30rem)] shrink-0">
              <SlideImage
                src={`/api/landing/${s.file}`}
                alt={`A ${label(s.type)} slide, rendered`}
                w={s.w}
                h={s.h}
                dark={s.dark}
                priority={i < 2}
              />
              <figcaption className="mt-3 flex items-baseline gap-2">
                <span className="font-mono text-[11px] text-fg-faint">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[13px] text-fg-muted">{label(s.type)}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
