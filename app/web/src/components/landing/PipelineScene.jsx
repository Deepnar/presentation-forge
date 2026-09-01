import { useRef } from "react";
import { useSceneProgress, useNarrow, span, entry } from "../../lib/scene.js";
import { PIPELINE_MOCKS } from "./mockups.jsx";

const STEPS = [
  { n: "01", t: "Brief", d: "One question at a time — topic, title, team, theme, density. Everything has a default, so answering nothing still works." },
  { n: "02", t: "Research", d: "Multi-angle search across the web and the literature, with a guard against leaning on one source. The notes stay yours." },
  { n: "03", t: "Outline", d: "A plan in plain language. Reorder it, retitle it, change what kind of slide a point should be." },
  { n: "04", t: "You approve", d: "Nothing reaches the renderer until you say so. The gate is the product, not a step in it.", gate: true },
  { n: "05", t: "Content", d: "Each slide written against your research rather than invented, and kept to what its layout can hold." },
  { n: "06", t: "Render", d: "A deck and a matching report. The model never picks a coordinate, a colour or a typeface." },
  { n: "07", t: "Critique", d: "Every slide rasterised and read back, so a flaw is caught in the image rather than on the projector." },
];

// Each step's panel arrives from a different edge. One shared direction reads
// as a single block twitching; alternating reads as a sequence being built.
const FROM = ["left", "up", "right", "scale", "left", "down", "right"];

/**
 * The pipeline as a pinned scene.
 *
 * The heading lives INSIDE the sticky frame. When it sat in a normal block
 * above, the frame only began below it — so at the top of the section the
 * panel was centred in a box that started off-screen, and the reader got a
 * screen of nothing before the content caught up.
 */
export default function PipelineScene() {
  const ref = useRef(null);
  const p = useSceneProgress(ref);
  // A phone cannot hold the two-column frame AND seven steps in one screen,
  // and the stacked version is different content rather than the same content
  // repositioned — so this is a query, not a measurement.
  const narrow = useNarrow();
  const i = Math.min(STEPS.length - 1, Math.floor(p * STEPS.length * 0.999));
  const Mock = PIPELINE_MOCKS[i];
  const step = STEPS[i];
  // How far into THIS step we are, so the panel finishes arriving rather than
  // snapping the instant the index changes.
  const local = span(p * STEPS.length - i, 0, 0.35);

  const HEAD = (
    <div>
      <div className="eyebrow">How it works</div>
      <h2 className="display-3 mt-3 text-fg">Seven steps, and you own the fourth.</h2>
      <p className="lede mt-4 max-w-md text-[15px]">
        The machine does the volume. The judgement stays with you, at the point where
        changing your mind still costs nothing.
      </p>
    </div>
  );

  // Narrow: every step, in order, each with its own panel. Nothing is hidden
  // behind a scroll position the layout is too small to spend.
  if (narrow) {
    return (
      <section className="px-5 py-20 sm:px-8" data-section="pipeline">
        <div className="mx-auto w-full max-w-2xl">
          {HEAD}
          <ol className="mt-10 space-y-10">
            {STEPS.map((s, k) => {
              const M = PIPELINE_MOCKS[k];
              return (
                <li key={s.n} className="reveal">
                  <div className="flex items-baseline gap-3">
                    <span className={`font-mono text-[10.5px] ${s.gate ? "text-accent" : "text-fg-faint"}`}>{s.n}</span>
                    <span className="text-[15px] font-semibold text-fg">{s.t}</span>
                    {s.gate && (
                      <span className="ml-auto rounded-pill border border-accent-dim bg-accent-tint px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent">
                        you
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-fg-muted">{s.d}</p>
                  <div className="mt-4"><M /></div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>
    );
  }

  return (
    <div ref={ref} data-section="pipeline" style={{ height: `${STEPS.length * 38 + 100}vh` }}>
      {/* Clipping the FRAME is safe — only a clipping ANCESTOR breaks sticky.
          Without it a panel entering from the left is pushed past the right
          edge and the whole document scrolls sideways. */}
      <div className="sticky top-0 flex h-screen items-center overflow-hidden px-5 sm:px-8">
        <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-center">
          <div>
            {HEAD}

            <ol className="mt-7 space-y-1">
              {STEPS.map((s, k) => {
                const on = k === i;
                const done = k < i;
                return (
                  <li
                    key={s.n}
                    className="flex items-baseline gap-3 rounded-lg px-2 py-1.5 transition-colors"
                    style={{
                      background: on ? "var(--color-hover)" : "transparent",
                      transitionDuration: "var(--dur-base)",
                    }}
                  >
                    <span className={`font-mono text-[10.5px] ${on || done ? "text-accent" : "text-fg-faint"}`}>{s.n}</span>
                    <span className={`text-[13.5px] ${on ? "font-semibold text-fg" : done ? "text-fg-muted" : "text-fg-faint"}`}>
                      {s.t}
                    </span>
                    {s.gate && (
                      <span className="ml-auto rounded-pill border border-accent-dim bg-accent-tint px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent">
                        you
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          <div>
            <div
              key={i}
              style={{
                ...entry(local, FROM[i], 56),
                transition: "opacity var(--dur-base) var(--ease-out-quint), transform var(--dur-base) var(--ease-out-quint)",
              }}
            >
              <Mock />
              <p className="mt-4 max-w-lg text-[13.5px] leading-relaxed text-fg-muted">{step.d}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
