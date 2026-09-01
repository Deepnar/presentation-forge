import { useRef } from "react";
import { useSceneProgress, useTooTall, span, entry } from "../../lib/scene.js";

const CHECKS = [
  {
    q: "Is the box on the slide?",
    a: "A watcher runs inside every render. A negative width is written without complaint, and draws something that is not the shape.",
    from: "left",
    visual: (
      <div className="relative h-24 rounded-lg border border-line bg-sunken">
        <div className="absolute left-3 top-3 h-8 w-24 rounded border border-line-strong bg-panel" />
        <div className="absolute -right-6 bottom-3 h-8 w-28 rounded border border-danger/60 bg-danger/10" />
        <span className="absolute bottom-1 right-1 font-mono text-[9px] text-danger">off-canvas</span>
      </div>
    ),
  },
  {
    q: "Was the field drawn at all?",
    a: "Text that is never drawn is never fitted, so nothing downstream can miss it. Each field is marked and read back.",
    from: "up",
    visual: (
      <div className="h-24 space-y-1.5 rounded-lg border border-line bg-sunken p-3">
        {[["headline", true], ["standfirst", true], ["speaker_note", false]].map(([f, ok]) => (
          <div key={f} className="flex items-center gap-2 font-mono text-[10px]">
            <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-success" : "bg-danger"}`} />
            <span className={ok ? "text-fg-muted" : "text-danger"}>{f}</span>
            <span className="ml-auto text-fg-faint">{ok ? "drawn" : "never drawn"}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    q: "Does the text fit the box?",
    a: "Every theme against every slide type, measured before anything is rendered at all.",
    from: "right",
    visual: (
      <div className="grid h-24 grid-cols-8 gap-1 rounded-lg border border-line bg-sunken p-3">
        {Array.from({ length: 32 }).map((_, i) => (
          <span key={i} className={`rounded-[2px] ${i === 21 ? "bg-amber" : "bg-success/40"}`} />
        ))}
      </div>
    ),
  },
  {
    q: "Did it survive the render?",
    a: "The slide is rasterised and the words read back off the image. A file that parses proves only that it parses.",
    from: "down",
    visual: (
      <div className="flex h-24 items-center gap-2 rounded-lg border border-line bg-sunken p-3">
        <div className="h-full flex-1 rounded border border-line bg-panel" />
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-fg-faint" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m0 0-5-5m5 5-5 5" /></svg>
        <div className="h-full flex-1 space-y-1 rounded border border-line bg-panel p-2">
          <div className="h-1.5 w-full rounded-full bg-line-strong" />
          <div className="h-1.5 w-4/5 rounded-full bg-line-strong" />
          <div className="h-1.5 w-2/3 rounded-full bg-line-strong" />
        </div>
      </div>
    ),
  },
];

/** The four questions the checks ask, in the order they ask them. */
export default function CheckScene() {
  const ref = useRef(null);
  const innerRef = useRef(null);
  const p = useSceneProgress(ref);
  // A pinned frame is one viewport tall; taller content would simply be cut.
  const flow = useTooTall(innerRef);

  return (
    <div ref={ref} data-section="checks" style={flow ? undefined : { height: `${CHECKS.length * 30 + 110}vh` }}>
      <div
        className={
          flow
            ? "px-5 py-20 sm:px-8"
            : // Clipping the FRAME is safe — only a clipping ANCESTOR breaks sticky.
              // Without it a card entering from the left is pushed past the right
              // edge and the whole document scrolls sideways.
              "sticky top-0 flex h-screen items-center overflow-hidden px-5 sm:px-8"
        }
      >
        <div ref={innerRef} className="mx-auto w-full max-w-6xl">
          <div className="reveal max-w-2xl">
            <div className="eyebrow">Why it holds up</div>
            <h2 className="display-3 mt-3 text-fg">A file that opens is not a slide that works.</h2>
            <p className="lede mt-4 text-[15px]">
              A deck can be written successfully with text running off the canvas and one
              invisible colour on another. So the render is not the last step — it is the thing
              that gets inspected.
            </p>
          </div>

          <div className="mt-9 grid gap-3 sm:grid-cols-2">
            {CHECKS.map((c, k) => {
              const start = 0.16 + (k / CHECKS.length) * 0.66;
              const t = flow ? 1 : span(p, start, start + 0.2);
              return (
                <div
                  key={c.q}
                  className="rounded-panel border border-line bg-panel p-5 shadow-[var(--shadow-card)]"
                  style={{
                    ...entry(t, c.from, 64),
                    transition: "opacity var(--dur-base) var(--ease-out-quint), transform var(--dur-base) var(--ease-out-quint)",
                  }}
                >
                  <div className="text-[14px] font-semibold text-fg">{c.q}</div>
                  <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{c.a}</p>
                  <div className="mt-4">{c.visual}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
