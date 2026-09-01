import { useRef, useState, useEffect } from "react";
import { useSceneProgress, span } from "../../lib/scene.js";
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
 * The rail used to sit under a horizontal scrollbar, which meant a reader had
 * to notice it was draggable and then drag it — on a landing page that is the
 * same as not showing it. Vertical scroll is the only input now.
 *
 * Travel is measured from the real laid-out width rather than assumed, so
 * adding a slide type to the deck changes no constant here, and a narrow
 * viewport (where the cards are smaller) scrubs the right amount.
 */
export default function TypeScroll({ manifest, typeCount }) {
  const slides = manifest?.showcase?.slides ?? [];
  const ref = useRef(null);
  const trackRef = useRef(null);
  const p = useSceneProgress(ref, [slides.length]);
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => setDistance(Math.max(0, track.scrollWidth - window.innerWidth + 64));
    measure();
    window.addEventListener("resize", measure);
    // The cards are images; their width is known from the attributes, but a
    // late font swap still nudges the captions.
    const t = setTimeout(measure, 600);
    return () => { window.removeEventListener("resize", measure); clearTimeout(t); };
  }, [slides.length]);

  if (!slides.length) return null;

  // The rail waits for the heading to land, then takes the rest of the budget.
  const x = span(p, 0.12, 1) * distance;

  return (
    <div ref={ref} data-section="types" style={{ height: `${Math.max(200, slides.length * 14)}vh` }}>
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden">
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <div className="reveal max-w-2xl">
            <div className="eyebrow">The vocabulary</div>
            <h2 className="display-3 mt-3 text-fg">
              {typeCount ? `${typeCount} ways to say it.` : "A slide type for the point you are making."}
            </h2>
            <p className="lede mt-4 text-[15px]">
              A comparison is not a list, and a timeline is not a table. Each type is a layout
              written by hand and checked against every theme.
            </p>
          </div>
        </div>

        <div
          ref={trackRef}
          className="mt-8 flex w-max gap-6 px-6 will-change-transform sm:px-8"
          style={{ transform: `translate3d(${-x}px, 0, 0)` }}
        >
          {slides.map((s, i) => (
            <figure key={s.type} className="w-[min(76vw,26rem)] shrink-0">
              <SlideImage
                src={`/api/landing/${s.file}`}
                alt={`A ${label(s.type)} slide, rendered`}
                w={s.w}
                h={s.h}
                dark={s.dark}
                priority={i < 2}
              />
              <figcaption className="mt-3 flex items-baseline gap-2">
                <span className="font-mono text-[11px] text-fg-faint">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-[13px] text-fg-muted">{label(s.type)}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
