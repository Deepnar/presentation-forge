import { hex, textStyle, applyTransform } from "./theme.js";
import { fitScale, fitOneLine, lineCount, measure } from "./fit.js";
import { CANVAS } from "./chrome.js";

/**
 * How a theme composes a slide, as opposed to how it colours one.
 *
 * Thirty-eight themes differed only in palette and typeface, because the body
 * of every slide was laid out by the same code: eyebrow pill, headline,
 * standfirst, one column. Two ad-hoc escape hatches (`tokens.editorial`,
 * `tokens.bauhaus`) proved per-theme layout flags work and were never
 * generalised, so a theme could be any colour and only one shape.
 *
 * This is that generalisation. Every axis is an enum whose FIRST value is the
 * behaviour every theme had before it existed, so a theme that declares no
 * `layout` block renders exactly as it did. An unknown axis or value throws:
 * silent fall-through to a default is how `config/models.yaml` came to address
 * six models that were not installed, and a typo here would cost a theme its
 * design without a word.
 *
 * The axes reach the whole product because 67 of the 74 layouts open with the
 * same two calls and lay their content against the same box. Composition is
 * applied there — in the opening mark, the heading block and the content
 * frame — rather than per slide type, so one flag restyles all 75 types.
 *
 * Still the three-layer rule: these are theme tokens. The model never sees
 * them and content can never set one.
 */

const AXES = {
  title: { composition: ["flush-bottom", "centred", "split", "band", "top"] },
  section: { composition: ["flush", "centred", "numeral", "band", "block", "rules"] },
  heading: {
    align: ["left", "centre"],
    opening: ["pill", "rule", "bar", "numeral", "none"],
    rule: ["none", "under"],
  },
  content: { frame: ["full", "inset", "sidebar", "offset"] },
  list: { marker: ["dot", "dash", "square", "arrow", "number", "none"], columns: [1, 2] },
  text: { dropcap: [false, true] },
};

/** The default for every axis is its first value — today's behaviour. */
const DEFAULTS = Object.fromEntries(
  Object.entries(AXES).map(([group, keys]) => [
    group,
    Object.fromEntries(Object.entries(keys).map(([key, values]) => [key, values[0]])),
  ]),
);

/** Validate and merge a theme's `tokens.layout` over the defaults. */
export function resolveLayout(given, themeName = "theme") {
  const out = structuredClone(DEFAULTS);
  for (const [group, keys] of Object.entries(given ?? {})) {
    if (!AXES[group]) {
      throw new Error(`${themeName}: unknown layout group "${group}" (expected ${Object.keys(AXES).join(", ")})`);
    }
    for (const [key, value] of Object.entries(keys ?? {})) {
      const allowed = AXES[group][key];
      if (!allowed) {
        throw new Error(`${themeName}: unknown layout key "${group}.${key}" (expected ${Object.keys(AXES[group]).join(", ")})`);
      }
      if (!allowed.includes(value)) {
        throw new Error(`${themeName}: layout.${group}.${key} = ${JSON.stringify(value)} is not one of ${allowed.map((v) => JSON.stringify(v)).join(", ")}`);
      }
      out[group][key] = value;
    }
  }
  return out;
}

// Resolution is per theme object and every render loads a fresh one, so the
// cache is a weak map rather than a name-keyed one: a theme edited on disk is
// never served from a previous run's entry.
const resolved = new WeakMap();

/** The theme's resolved composition. Throws on a malformed `tokens.layout`. */
export function layoutOf(theme) {
  let l = resolved.get(theme);
  if (!l) {
    l = resolveLayout(theme.tokens?.layout, theme.name ?? "theme");
    resolved.set(theme, l);
  }
  return l;
}

/* ----------------------------------------------------------------- frame */

/**
 * Slide types whose body is a row of four or more peers across the canvas.
 * A sidebar takes a third of the width away, and four cards in what is left
 * break words in the middle of themselves — which the fitter cannot see,
 * because each fragment fits. These keep the full measure; the theme's
 * opening mark and heading treatment still apply, so the deck stays one
 * design rather than two.
 */
const WIDE_TYPES = new Set([
  "cards", "stacked-list", "kpi-dashboard", "data-cards", "team-grid",
  "equation", "before-after",
]);

/**
 * Where the frame puts the mark column, the heading column and the body.
 *
 * The inset and offset figures were first set against the specimen deck, whose
 * payloads are hand-written to behave. Real model-written content is longer —
 * a 130-character card body where the specimen has 40 — and at 0.75in of inset
 * that cost eight themes their card text. These are the widest values that a
 * real deck clears, which is the budget that matters.
 */
const FRAMES = {
  full: { inset: 0, offset: 0, sidebar: 0 },
  inset: { inset: 0.55, offset: 0, sidebar: 0 },
  offset: { inset: 0, offset: 1.1, sidebar: 0 },
  sidebar: { inset: 0, offset: 0, sidebar: 3.4 },
};

// A sidebar's body column runs up the right-hand side, where the crest sits
// from 0.26in to 1.08in. Starting it at 1.25 clears the mark and still buys
// about 1.3in of height over the standard body band, which is what pays for
// the narrower measure.
const SIDEBAR_BODY_Y = 1.25;
const SIDEBAR_GUTTER = 0.5;

/**
 * Reshape the content box for the theme's frame.
 *
 * `mark` is where the opening ornament goes, `head` where the headline and
 * standfirst go, and the box itself is the body. In every frame but `sidebar`
 * these are stacked bands of the same column, which is why one box served
 * every layout before frames existed.
 *
 * `frame` overrides the theme's choice, which the full-bleed surfaces use:
 * a title or a divider is a composition in its own right and is not reframed.
 * `type` lets a slide type that needs the whole canvas keep it.
 */
export function frameBox(theme, base, frame = null, type = null) {
  const declared = frame ?? layoutOf(theme).content.frame;
  const chosen = declared === "sidebar" && WIDE_TYPES.has(type) ? "full" : declared;
  const band = theme.grid.band;
  const reserve = base.w - base.titleW; // the crest's horizontal reservation
  const geom = FRAMES[chosen];

  const out = {
    ...base,
    frame: chosen,
    bodyY: band.body_y,
    mark: { x: base.x, y: band.eyebrow_y, w: base.titleW },
    head: { x: base.x, y: band.title_y, w: base.titleW, wide: base.w, budget: 1.05 },
  };

  if (geom.inset) {
    out.x = base.x + geom.inset;
    out.w = base.w - geom.inset * 2;
    out.right = base.right - geom.inset;
    out.titleW = out.w - reserve;
    out.mark = { x: out.x, y: band.eyebrow_y, w: out.titleW };
    out.head = { x: out.x, y: band.title_y, w: out.titleW, wide: out.w, budget: 1.05 };
  }

  if (geom.offset) {
    out.x = base.x + geom.offset;
    out.w = base.w - geom.offset;
    out.titleW = out.w - reserve;
    // The mark keeps the column the body gave up: an opening numeral or bar
    // sits out in the margin, which is the whole point of offsetting.
    out.mark = { x: base.x, y: band.eyebrow_y, w: geom.offset - 0.15 };
    out.head = { x: out.x, y: band.title_y, w: out.titleW, wide: out.w, budget: 1.05 };
  }

  if (geom.sidebar) {
    const colW = geom.sidebar;
    out.x = base.x + colW + SIDEBAR_GUTTER;
    out.w = base.right - out.x;
    out.titleW = out.w - reserve;
    out.bodyY = SIDEBAR_BODY_Y;
    out.mark = { x: base.x, y: band.eyebrow_y, w: colW };
    out.head = { x: base.x, y: band.title_y, w: colW, wide: colW, budget: 2.2 };
  }

  return out;
}

/* --------------------------------------------------------------- opening */

/**
 * The width an opening's label has, from `from` to the right edge of the head.
 *
 * Every opening sized its label as `mark.w` less its own ornament, and on an
 * OFFSET frame the mark is the margin gutter a numeral or a bar sits out in —
 * around 0.6in — so the label came out negative and pptxgenjs wrote it without
 * a word. On every other frame the mark and the head share a right edge, so
 * this is the number those openings always had.
 */
function labelRoom(ctx, from) {
  const head = ctx.box.head;
  return Math.max(0, head.x + head.w - from);
}


/**
 * The mark that opens a content slide.
 *
 * `pill` needs a section to number and draws nothing without one. The other
 * openings are composition rather than navigation — a rule or a bar belongs to
 * the theme, so it draws whether or not the deck has sections.
 */
export function drawOpening(slide, ctx) {
  const { theme, deck, data } = ctx;
  const { heading: h } = layoutOf(theme);
  const mark = ctx.box.mark;
  const centred = h.align === "centre";
  const label = data.section != null ? deck.sections?.[data.section] : null;
  const num = data.section != null ? String(data.section + 1).padStart(2, "0") : null;

  if (h.opening === "pill") {
    if (!label) return;
    const pillW = 0.62, pillH = 0.32;
    // A centred heading has to centre its pill with it, which means measuring
    // the label: the chip and its text are one group, not two placements.
    const gap = 0.18;
    // The label runs to the right edge of the HEAD column, not of the mark. On
    // an offset frame the mark is the margin gutter a numeral or a bar sits in
    // — 0.63in wide — so `mark.w - pillW - gap` was -0.17in, and pptxgenjs
    // takes a negative width without a word. On every other frame the mark and
    // the head share an edge and this is the number it always was.
    const room = labelRoom(ctx, mark.x + pillW + gap);
    const labelW = centred
      ? Math.min(room, measure(applyTransform(theme, "eyebrow", label), theme.type.eyebrow) + 0.04)
      : room;
    const x0 = centred ? mark.x + (mark.w - (pillW + gap + labelW)) / 2 : mark.x;
    slide.addShape("roundRect", {
      x: x0, y: mark.y, w: pillW, h: pillH,
      fill: { color: hex(theme.palette.accent) },
      line: { type: "none" },
      rectRadius: theme.shape?.radius?.pill ?? 0.16,
    });
    slide.addText(num, {
      x: x0, y: mark.y, w: pillW, h: pillH,
      ...textStyle(theme, "eyebrow", { color: theme.palette.on_accent }),
      align: "center", valign: "middle",
    });
    slide.addText(applyTransform(theme, "eyebrow", label), {
      x: x0 + pillW + gap, y: mark.y, w: labelW, h: pillH,
      ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
      valign: "middle",
    });
    return;
  }

  if (h.opening === "none") {
    if (!label) return;
    slide.addText(applyTransform(theme, "eyebrow", label), {
      x: mark.x, y: mark.y, w: mark.w, h: 0.32,
      ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
      align: centred ? "center" : "left", valign: "middle",
    });
    return;
  }

  if (h.opening === "rule") {
    if (label) {
      slide.addText(applyTransform(theme, "eyebrow", label), {
        x: mark.x, y: mark.y - 0.04, w: mark.w, h: 0.28,
        ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
        align: centred ? "center" : "left", valign: "middle",
      });
    }
    slide.addShape("rect", {
      x: mark.x, y: mark.y + 0.30, w: mark.w, h: 0.015,
      fill: { color: hex(theme.palette.rule ?? theme.palette.ink_muted) },
      line: { type: "none" },
    });
    return;
  }

  if (h.opening === "bar") {
    const barW = 0.9, barH = 0.1;
    const bx = centred ? mark.x + (mark.w - barW) / 2 : mark.x;
    slide.addShape("rect", {
      x: bx, y: mark.y + 0.06, w: barW, h: barH,
      fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
    });
    if (label) {
      slide.addText(applyTransform(theme, "eyebrow", label), {
        x: centred ? mark.x : mark.x + barW + 0.22, y: mark.y,
        w: centred ? mark.w : labelRoom(ctx, mark.x + barW + 0.22), h: 0.32,
        ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
        align: centred ? "center" : "left",
        valign: centred ? "bottom" : "middle",
      });
    }
    return;
  }

  // numeral: the section number set as display type instead of chipped into a
  // pill. Without a section there is no number, and the slide opens bare.
  if (!num) return;
  const numW = Math.min(mark.w, 1.0);
  slide.addText(num, {
    x: mark.x, y: mark.y - 0.10, w: numW, h: 0.56,
    ...textStyle(theme, "display", { color: theme.palette.accent, scale: 0.55 }),
    align: centred ? "center" : "left", valign: "middle",
  });
  if (label && mark.w > numW + 0.6) {
    slide.addText(applyTransform(theme, "eyebrow", label), {
      x: mark.x + numW + 0.12, y: mark.y, w: labelRoom(ctx, mark.x + numW + 0.12), h: 0.36,
      ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
      valign: "middle",
    });
  }
}

/* --------------------------------------------------------------- heading */

/**
 * Two lines of the theme's own subhead, plus the gap before the body.
 *
 * A standfirst is a subtitle — two lines is the design intent, and the header
 * band between `title_y` and `body_y` has only 0.17in to 0.29in left once a
 * cap-length headline has taken its two lines, so a third line is paid for by
 * the body on every theme. Deriving it from the theme means a display-heavy
 * theme with a 16pt subhead gets the room its own type needs rather than a
 * constant measured on none of them.
 */
function standfirstH(theme) {
  const st = theme.type.subhead;
  return (st.size * (st.line ?? 1.4) * 2) / 72 + 0.12;
}

/** Headline + optional standfirst. Returns the y where body content starts. */
export function drawHeading(slide, ctx) {
  const { theme, data, box } = ctx;
  const { heading: h } = layoutOf(theme);
  const head = box.head;
  // Only emit an alignment when the theme asks for one: pptxgenjs writes an
  // explicit algn attribute for "left", which is already the default, and a
  // theme that never centres should produce the file it always produced.
  const align = h.align === "centre" ? { align: "center" } : {};
  let y = head.y;

  if (data.headline) {
    const st = theme.type.heading;
    // The height fit alone lets a single word wider than the column break in
    // the middle of itself, which a narrow frame makes routine and no test can
    // see. Fitting the longest word to the measure as well turns that into a
    // shrink, and into a reported floor hit when even that is not enough.
    // fitOneLine's default safety margin is the point: `measure` estimates at
    // 0.55em where real text averages nearer 0.60, so a word fitted to the
    // nominal column width still breaks.
    const longest = String(data.headline).split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), "");
    const scale = Math.min(
      fitScale(data.headline, head.w, head.budget, st),
      fitOneLine(longest, head.w, st),
    );
    const size = st.size * scale;
    // The headline may wrap; the standfirst must start after however many
    // lines are actually rendered. A standard frame budgets two lines, which
    // is what the fit height allows; a sidebar column is tall and narrow, so
    // there the real line count decides.
    const raw = lineCount(data.headline, head.w, { ...st, size });
    const snug = raw === 1 && measure(data.headline, { ...st, size }) <= head.w * 0.95;
    const maxLines = Math.max(2, Math.floor(head.budget / ((size * (st.line ?? 1.2)) / 72)));
    const lines = snug ? 1 : Math.min(maxLines, Math.max(2, raw));
    const hgt = (size * (st.line ?? 1.2) / 72) * lines;
    slide.addText(data.headline, {
      x: head.x, y, w: head.w, h: hgt,
      ...textStyle(theme, "heading", { scale }),
      ...align, valign: "top",
    });
    y += hgt + 0.08;
  }

  // The rule underlines the heading, so with no heading there is nothing to
  // underline: a headline-less slide drew a full-width hairline across an empty
  // band and read as a broken slide. `headline` is optional on several types
  // and a model omits it freely, so this is a real payload, not a stress case.
  if (h.rule === "under" && data.headline) {
    slide.addShape("rect", {
      x: head.x, y: y - 0.02, w: head.wide, h: 0.015,
      fill: { color: hex(theme.palette.rule ?? theme.palette.ink_muted) },
      line: { type: "none" },
    });
    y += 0.16;
  }

  if (data.standfirst) {
    const st = theme.type.subhead;
    // One number for the block, not three. It was fitted against 0.85in, drawn
    // into 0.75in and advanced 0.72in, so a standfirst the fitter passed at
    // three lines — which the 220-char cap permits — was drawn 0.19in ON TOP of
    // the body's first line, on every standard-frame theme in the gallery. The
    // advance is the honest number: it is the room the block actually takes
    // before the body starts, so it is the room the text has to fit in.
    const sfH = box.frame === "sidebar" ? 1.6 : standfirstH(theme);
    const scale = fitScale(data.standfirst, head.wide, sfH, st);
    slide.addText(data.standfirst, {
      x: head.x, y, w: head.wide, h: sfH,
      ...textStyle(theme, "subhead", { color: theme.palette.ink_muted, scale }),
      ...align, valign: "top",
    });
    y += sfH;
  }

  // A sidebar's heading lives beside the body, not above it, so the body
  // column starts where the frame put it however tall the headline grew.
  return box.frame === "sidebar" ? box.bodyY : Math.max(y, box.bodyY);
}

/* ----------------------------------------------------------------- lists */

const MARKERS = {
  dot: { bullet: { characterCode: "2022" } },
  dash: { bullet: { characterCode: "2013" } },
  square: { bullet: { characterCode: "25AA" } },
  arrow: { bullet: { characterCode: "2192" } },
  none: { bullet: false },
};

/**
 * The bullet option one list item carries, per the theme's marker.
 *
 * `index` matters only for the numbered marker: pptxgenjs writes
 * `startAt="1"` on every paragraph it numbers, which restarts the count at
 * each item, so a four-point list renders "1. 1. 1. 1.". Passing the running
 * position as `startAt` is the fix. See docs/TRAPS.md.
 */
export function bulletOptions(theme, index = 0) {
  const marker = layoutOf(theme).list.marker;
  if (marker === "number") return { bullet: { type: "number", startAt: index + 1 } };
  return MARKERS[marker];
}

/** How many columns a long bullet list runs in. */
export function listColumns(theme) {
  return layoutOf(theme).list.columns;
}

/** Whether a definition sets its first letter as a display initial. */
export function hasDropcap(theme) {
  return layoutOf(theme).text.dropcap;
}

/* ----------------------------------------------------- divider surfaces */

/**
 * The background graphic a divider paints, by composition. Shared by `section`
 * and `chapter`: both paint the section surface, so a theme whose dividers
 * carry a hard geometric block must carry it on both or the deck looks like
 * two themes. Returns the ink colour text drawn inside the field must use —
 * a band inverts the surface, and its headline has to invert with it.
 */
export function sectionField(slide, theme, s, band) {
  const comp = layoutOf(theme).section.composition;

  if (comp === "block") {
    // The constructivist signature: a hard primary circle breaking the right
    // edge, countered by a triangle at the top-left. Flat fills only.
    slide.addShape("ellipse", {
      x: 8.6, y: 3.4, w: 5.6, h: 5.6,
      fill: { color: hex(s.accent ?? theme.palette.accent) }, line: { type: "none" },
    });
    slide.addShape("triangle", {
      x: -0.6, y: -0.6, w: 3.2, h: 2.4,
      fill: { color: hex(s.ink) }, line: { type: "none" },
    });
    return s.ink;
  }

  if (comp === "band" && band) {
    // The band is the surface inverted, so the pairing inside it is the
    // theme's own ink-on-surface — already a contract-checked contrast, which
    // an invented colour would not be.
    slide.addShape("rect", {
      x: 0, y: band.y, w: CANVAS.w, h: band.h,
      fill: { color: hex(s.ink) }, line: { type: "none" },
    });
    return s.bg;
  }

  if (comp === "rules" && band) {
    for (const y of [band.y, band.y + band.h]) {
      slide.addShape("rect", {
        x: 0, y, w: CANVAS.w, h: 0.02,
        fill: { color: hex(s.muted) }, line: { type: "none" },
      });
    }
    return s.ink;
  }

  return s.ink;
}

/**
 * A divider's composition, split into the two independent things it decides:
 * where the type sits, and what is painted behind it.
 */
export function sectionStyle(theme) {
  const comp = layoutOf(theme).section.composition;
  const place = comp === "numeral" ? "numeral"
    : ["centred", "band", "rules"].includes(comp) ? "centred"
    : "flush";
  const field = ["block", "band", "rules"].includes(comp) ? comp : "none";
  return { place, field };
}

/** Where a title slide's type sits, and what field sits behind it. */
export function titlePlacement(theme) {
  return layoutOf(theme).title.composition;
}
