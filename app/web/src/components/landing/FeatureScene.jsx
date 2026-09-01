import { useRef } from "react";
import { useSceneProgress, useTooTall, span, entry } from "../../lib/scene.js";

const FEATURES = [
  { t: "It interviews you", d: "The briefing is a conversation, not a form. Say the topic and it works out the rest, asking only where your answer changes the deck.", from: "left" },
  { t: "Sources you can open", d: "Research keeps what it read. Every claim traces back to a note, and the notes stay in the project to check or replace.", from: "up" },
  { t: "Edit any slide", d: "Change a headline, swap a slide's type, reorder the argument. Re-render and the layout re-fits itself around the new text.", from: "right" },
  { t: "Speaker notes", d: "A script per slide from the same material, so what you say and what is on the screen do not drift apart.", from: "down" },
  { t: "A report, not just slides", d: "The companion document comes out of the same content — structured, paginated, contents page numbered correctly.", from: "left" },
  { t: "Your marks, not ours", d: "Institution, department, guide and crest are per account and applied by locked code, never the model's idea.", from: "scale" },
  { t: "Runs on your machine", d: "Local models are a first-class backend, not a fallback. Nothing has to leave the laptop if you would rather it did not.", from: "right" },
  { t: "Real files out", d: "A .pptx and a .docx you can open, edit and hand in. No viewer, no lock-in, no export step that loses the formatting.", from: "up" },
];

/**
 * The eight things around the deck, assembling as the scene is scrolled.
 *
 * Each card has its own entry vector and its own slice of the scroll, so the
 * grid builds itself rather than fading in as one plate. The slices overlap by
 * design — a strict sequence makes the reader wait for each card, and the
 * whole point is that scrolling alone shows the set.
 */
export default function FeatureScene() {
  const ref = useRef(null);
  const innerRef = useRef(null);
  const p = useSceneProgress(ref);
  // A pinned frame is one viewport tall; taller content would simply be cut.
  const flow = useTooTall(innerRef);

  return (
    <div ref={ref} data-section="features" style={flow ? undefined : { height: `${FEATURES.length * 20 + 110}vh` }}>
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
            <div className="eyebrow">What you actually get</div>
            <h2 className="display-3 mt-3 text-fg">A deck is the output. It is not the whole product.</h2>
            <p className="lede mt-4 text-[15px]">
              Everything around the slides — the interview, the sources, the editing, the script,
              the report — is the part that makes the output yours.
            </p>
          </div>

          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, k) => {
              const start = 0.14 + (k / FEATURES.length) * 0.7;
              const t = flow ? 1 : span(p, start, start + 0.16);
              return (
                <div
                  key={f.t}
                  className="rounded-panel border border-line bg-panel p-5 shadow-[var(--shadow-card)]"
                  style={{
                    ...entry(t, f.from, 60),
                    transition: "opacity var(--dur-base) var(--ease-out-quint), transform var(--dur-base) var(--ease-out-quint)",
                  }}
                >
                  <div className="text-[14px] font-semibold text-fg">{f.t}</div>
                  <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{f.d}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
