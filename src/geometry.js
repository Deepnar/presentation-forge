import { CANVAS } from "./chrome.js";

/**
 * Where a layout actually put its shapes.
 *
 * Every check in the repo answers "does this text fit this box". None of them
 * asks whether the box is on the slide, and three of the five defects the
 * cap-stress pass found were exactly that: a caption block computed to a
 * NEGATIVE height (pptxgenjs takes it without a word, and LibreOffice then
 * draws the title and the body on top of one another), an image sized by a
 * constant that ran the caption under the speaker-note bar, a rule drawn 0.12in
 * above the content start and struck through the standfirst. A fit sweep is
 * clean on all three, because every fragment fits the box it was given — the
 * box is what is wrong.
 *
 * So this records the geometry of every shape a layout emits and reports the
 * ones that cannot be right regardless of what they contain. It wraps the
 * pptxgenjs slide rather than living inside the layouts: 75 layouts cannot each
 * be trusted to remember, and a rule enforced in one place is a rule.
 */

/** Shapes smaller than this are ornaments — rules, ticks, nodes — not boxes. */
const ORNAMENT = 0.02;

/** A slide that judges what is drawn on it and forwards to the real one. */
export function watchGeometry(slide) {
  const found = [];

  const check = (kind, o) => {
    if (!o || typeof o !== "object") return;
    const { x, y, w, h } = footprint(o);
    // A shape positioned by a percentage string, or one pptxgenjs defaults, is
    // not something this can judge — it never sees the resolved number.
    if ([x, y, w, h].some((v) => typeof v !== "number" || !Number.isFinite(v))) return;
    if (w <= 0 || h <= 0) {
      report(found, `${kind} has a ${w <= 0 ? "width" : "height"} of ${round(w <= 0 ? w : h)}in`);
      return; // every other verdict on a degenerate box is noise
    }
    if (w < ORNAMENT && h < ORNAMENT) return;

    // A decorative shape may bleed off the canvas on purpose — the bold
    // geometric themes hang a slab past the corner of a divider, and that is
    // the design. Text and images cannot: whatever crosses the edge is gone.
    // A content shape that ran off the page takes its label with it, so the
    // text box reports and the case is not lost by exempting the slab.
    if (kind === "shape") return;

    const over = [
      x < -0.01 ? `${round(-x)}in off the left edge` : null,
      y < -0.01 ? `${round(-y)}in off the top edge` : null,
      x + w > CANVAS.w + 0.01 ? `${round(x + w - CANVAS.w)}in past the right edge` : null,
      y + h > CANVAS.h + 0.01 ? `${round(y + h - CANVAS.h)}in past the bottom edge` : null,
    ].filter(Boolean);
    if (over.length) report(found, `${kind} sits ${over.join(" and ")}`);
  };

  const wrapped = new Proxy(slide, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function" || !String(prop).startsWith("add")) {
        return typeof value === "function" ? value.bind(target) : value;
      }
      return (...args) => {
        // addText(text, opts) and addShape(kind, opts) both carry the geometry
        // in their last argument; addImage(opts) carries it in its only one.
        check(String(prop).replace(/^add/, "").toLowerCase(), args.at(-1));
        return value.apply(target, args);
      };
    },
  });

  return { slide: wrapped, problems: () => found };
}

/**
 * Record a verdict, and with FORGE_GEOM_TRACE=1 say which draw call made it.
 *
 * The message names the type and the theme; the layouts are four thousand
 * lines and one type can draw thirty shapes, so finding the call without the
 * frames is the slow part of acting on anything this reports.
 */
function report(found, message) {
  found.push(message);
  if (!process.env.FORGE_GEOM_TRACE) return;
  const at = new Error().stack.split("\n").slice(3, 6).map((l) => l.trim()).join(" | ");
  console.error(`  geometry: ${message}\n    ${at}`);
}

/**
 * The space a box really occupies, which for a rotated one is not its own.
 *
 * pptxgenjs rotates about the centre, so a quarter-turn swaps the extents: the
 * matrix axis labels are 1.2in wide and 0.3in tall boxes whose logical left
 * edge sits 0.05in off the canvas and whose rendered footprint is comfortably
 * inside it. Judging the logical box reports 26 slides that are perfectly fine.
 * Only the quarter turns are resolved; any other angle is left alone rather
 * than guessed at.
 */
function footprint({ x, y, w, h, rotate }) {
  const turn = ((Number(rotate) || 0) % 360 + 360) % 360;
  if (turn !== 90 && turn !== 270) return { x, y, w, h };
  if ([x, y, w, h].some((v) => typeof v !== "number")) return { x, y, w, h };
  return { x: x + w / 2 - h / 2, y: y + h / 2 - w / 2, w: h, h: w };
}

const round = (n) => Math.round(n * 100) / 100;
