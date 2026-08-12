import { hex, textStyle, applyTransform } from "./theme.js";
import { fitScale, fitScaleAll, lineCount, measure } from "./fit.js";
import { CANVAS, reservedTopRight } from "./chrome.js";

/**
 * One renderer per slide type. Each receives a fully resolved context and
 * draws with theme tokens only — no literal colours or font names anywhere in
 * this file. That constraint is what makes 20 themes possible without 20
 * renderers.
 */

const path2 = (ctx) => ctx; // keep signature obvious at call sites

/* ------------------------------------------------------------------ utils */

function content(theme, brand, { full = false } = {}) {
  const m = theme.grid.margin;
  const reserve = full ? 0 : reservedTopRight(brand);
  return {
    x: m.left,
    y: m.top,
    w: CANVAS.w - m.left - m.right,
    right: CANVAS.w - m.right,
    bottom: CANVAS.h - m.bottom,
    titleW: CANVAS.w - m.left - m.right - reserve,
  };
}

function card(slide, theme, { x, y, w, h }) {
  const sh = theme.shape ?? {};
  // A theme may soften its panels (glass needs translucent frost, neumorphism
  // needs to vanish into a plate-painted field). card_fill defaults to the
  // opaque surface, which is exactly what every native theme today gets.
  const fill = sh.card_fill ?? { color: theme.palette.surface };
  const opts = {
    x, y, w, h,
    fill: {
      color: hex(fill.color),
      ...(fill.transparency != null ? { transparency: fill.transparency } : {}),
    },
    line: (sh.border?.width ?? 0) > 0
      ? { color: hex(sh.border.color), width: sh.border.width }
      : { type: "none" },
    rectRadius: sh.radius?.card ?? 0,
  };
  if (theme.shadow?.card) {
    const s = theme.shadow.card;
    opts.shadow = {
      type: s.type ?? "outer",
      blur: s.blur ?? 12,
      offset: s.offset ?? 3,
      angle: s.angle ?? 90,
      color: hex(s.color) ?? "000000",
      opacity: s.opacity ?? 0.1,
    };
  }
  slide.addShape("roundRect", opts);
}

/** Eyebrow (numbered section pill + label) shared by most content slides. */
function eyebrow(slide, ctx) {
  const { theme, deck, data } = ctx;
  if (data.section == null || !deck.sections?.[data.section]) return;

  const label = deck.sections[data.section];
  const num = String(data.section + 1).padStart(2, "0");
  const y = theme.grid.band.eyebrow_y;
  const pillW = 0.62, pillH = 0.32;

  slide.addShape("roundRect", {
    x: ctx.box.x, y, w: pillW, h: pillH,
    fill: { color: hex(theme.palette.accent) },
    line: { type: "none" },
    rectRadius: theme.shape?.radius?.pill ?? 0.16,
  });
  slide.addText(num, {
    x: ctx.box.x, y, w: pillW, h: pillH,
    ...textStyle(theme, "eyebrow", { color: theme.palette.on_accent }),
    align: "center", valign: "middle",
  });
  slide.addText(applyTransform(theme, "eyebrow", label), {
    x: ctx.box.x + pillW + 0.18, y, w: ctx.box.titleW - pillW - 0.18, h: pillH,
    ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
    valign: "middle",
  });
}

/** Headline + optional standfirst. Returns the y where body content may start. */
function heading(slide, ctx) {
  const { theme, data, box } = ctx;
  let y = theme.grid.band.title_y;

  if (data.headline) {
    const st = theme.type.heading;
    const scale = fitScale(data.headline, box.titleW, 1.05, st);
    const size = st.size * scale;
    // The headline may wrap; the standfirst must start after however many lines
    // are actually rendered. Counting at the fitted size (with a small width
    // safety so an underestimated line can never collide) is what keeps a
    // wrapped headline from running into the standfirst below it.
    const fits = lineCount(data.headline, box.titleW, { ...st, size }) === 1 &&
      measure(data.headline, { ...st, size }) <= box.titleW * 0.95;
    const lines = fits ? 1 : 2;
    const h = (size * (st.line ?? 1.2) / 72) * lines;
    slide.addText(data.headline, {
      x: box.x, y, w: box.titleW, h,
      ...textStyle(theme, "heading", { scale }),
      valign: "top",
    });
    y += h + 0.08;
  }

  if (data.standfirst) {
    const st = theme.type.subhead;
    const scale = fitScale(data.standfirst, box.w, 0.85, st);
    slide.addText(data.standfirst, {
      x: box.x, y, w: box.w, h: 0.75,
      ...textStyle(theme, "subhead", { color: theme.palette.ink_muted, scale }),
      valign: "top",
    });
    y += 0.72;
  }

  return Math.max(y, theme.grid.band.body_y);
}

/* ---------------------------------------------------------------- layouts */

export const layouts = {
  title(slide, ctx) {
    const { theme, deck, identity } = ctx;
    const s = theme.surfaces.title;
    slide.background = { color: hex(s.bg) };

    const m = theme.grid.margin;
    const w = CANVAS.w - m.left - m.right;
    const st = theme.type.display;
    // Two lines of display type is the design intent; only shrink past that.
    const scale = fitScale(deck.title, w, (st.size / 72) * (st.line ?? 1.12) * 2, st);

    slide.addText(deck.title, {
      x: m.left, y: 2.15, w, h: 2.5,
      ...textStyle(theme, "display", { color: s.ink, scale }),
      valign: "bottom",
    });

    let y = 4.85;
    if (deck.subtitle) {
      slide.addText(deck.subtitle, {
        x: m.left, y, w, h: 0.5,
        ...textStyle(theme, "subhead", { color: s.muted, italic: true }),
      });
      y += 0.5;
    }

    const team = identity.team ?? {};
    const names = (team.members ?? [])
      .map((mm) => (mm.roll ? `${mm.name} (${mm.roll})` : mm.name))
      .join(" · ");
    const line = [team.label, names].filter(Boolean).join(" — ");
    if (line) {
      slide.addText(line, {
        x: m.left, y, w, h: 0.4,
        ...textStyle(theme, "caption", { color: s.muted }),
      });
      y += 0.42;
    }

    const guide = identity.guide?.name;
    if (guide) {
      const role = identity.guide?.designation;
      slide.addText(`Guide: ${guide}${role ? ` · ${role}` : ""}`, {
        x: m.left, y, w, h: 0.35,
        ...textStyle(theme, "caption", { color: s.muted }),
      });
    }

    const sub = [identity.academic?.subject, identity.academic?.year]
      .filter(Boolean).join("  ·  ");
    if (sub) {
      slide.addText(sub, {
        x: m.left, y: CANVAS.h - m.bottom - 0.42, w, h: 0.35,
        ...textStyle(theme, "caption", { color: s.accent ?? s.muted }),
      });
    }
  },

  section(slide, ctx) {
    const { theme, data, deck } = ctx;
    const s = theme.surfaces.section;
    slide.background = { color: hex(s.bg) };
    const m = theme.grid.margin;
    const w = CANVAS.w - m.left - m.right;

    let y = 2.85;
    if (data.section != null && deck.sections?.[data.section]) {
      slide.addText(String(data.section + 1).padStart(2, "0"), {
        x: m.left, y, w, h: 0.34,
        ...textStyle(theme, "eyebrow", { color: s.muted }),
      });
      y += 0.38;
    }

    slide.addText(data.headline ?? "", {
      x: m.left, y, w, h: 1.15,
      ...textStyle(theme, "display", { color: s.ink, scale: 0.8 }),
      valign: "top",
    });
    y += 1.1;

    if (data.standfirst) {
      slide.addText(data.standfirst, {
        x: m.left, y, w: w * 0.66, h: 0.9,
        ...textStyle(theme, "subhead", { color: s.muted }),
        valign: "top",
      });
    }
  },

  bullets(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);

    const avail = box.bottom - y - 0.2;
    const st = theme.type.body;
    const scale = fitScaleAll(data.bullets, box.w - 0.4, avail / data.bullets.length, st);

    slide.addText(
      data.bullets.map((b) => ({ text: b, options: { breakLine: true, bullet: { characterCode: "2022" } } })),
      {
        x: box.x, y, w: box.w, h: avail,
        ...textStyle(theme, "body", { scale }),
        paraSpaceAfter: 10,
        valign: "top",
      },
    );
  },

  /**
   * Deck agenda: numbered topics in a vertical list, each title bold with an
   * optional description beneath. The whole list shares one horizontal fit for
   * titles and one for descriptions so siblings stay uniform — the row budget
   * reserves the real rendered line count, so a wrapped desc never meets the
   * title of the row below it.
   */
  agenda(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);

    const n = data.items.length;
    const gut = 0.28;
    const rowH = (box.bottom - y - 0.1 - gut * (n - 1)) / n;
    const numW = 0.62;
    const tw = box.w - numW - 0.25;
    const titleScale = fitScaleAll(data.items.map((i) => i.title), tw, rowH * 0.5, theme.type.subhead);
    const descScale = fitScaleAll(
      data.items.map((i) => i.desc).filter(Boolean), tw, rowH * 0.45, theme.type.caption,
    );

    data.items.forEach((item, i) => {
      const ry = y + i * (rowH + gut);
      slide.addText(String(i + 1).padStart(2, "0"), {
        x: box.x, y: ry, w: numW, h: rowH,
        ...textStyle(theme, "eyebrow", { color: theme.palette.accent }),
        align: "left", valign: "top",
      });
      slide.addText(item.title, {
        x: box.x + numW + 0.25, y: ry, w: tw, h: rowH * 0.5,
        ...textStyle(theme, "subhead", { bold: true, scale: titleScale }),
        valign: "top",
      });
      if (item.desc) {
        slide.addText(item.desc, {
          x: box.x + numW + 0.25, y: ry + rowH * 0.52, w: tw, h: rowH * 0.45,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: descScale }),
          valign: "top",
        });
      }
    });
  },

  /**
   * The one number that matters: a hero value on the stat type, its label, and
   * a body anchored to the bottom of the content box. The value's 2.1in budget
   * guarantees one rendered line; the label sits at a fixed offset under it,
   * and the bottom block reserves its own measured height so a long body can
   * never collide with the label or the chrome footer.
   */
  "big-number"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);

    const valueScale = fitScale(data.value, box.w, 2.1, theme.type.stat, { min: 0.7 });
    slide.addText(data.value, {
      x: box.x, y, w: box.w, h: 2.1,
      ...textStyle(theme, "stat", { color: theme.palette.accent, scale: valueScale }),
      valign: "top",
    });

    const labelScale = fitScale(data.label, box.w, 0.5, theme.type.subhead, { min: 0.7 });
    slide.addText(data.label, {
      x: box.x, y: y + 2.15, w: box.w, h: 0.5,
      ...textStyle(theme, "subhead", { bold: true, scale: labelScale }),
      valign: "top",
    });

    // The caption is pinned to the content-box bottom — never to a value
    // derived from the body's own estimated height, which is what pushed it
    // onto the chrome footer. The body gets the fixed budget between the label
    // and the caption and is fit-scaled to it, so however long it is, it can
    // only get smaller, never collide.
    const subH = 0.4;
    const bodyTop = y + 2.6;
    const subY = data.sub ? box.bottom - subH - 0.12 : box.bottom - 0.15;
    const bodyBudget = Math.max(0.5, subY - bodyTop);
    if (data.body) {
      slide.addText(data.body, {
        x: box.x, y: bodyTop, w: box.w, h: bodyBudget,
        ...textStyle(theme, "body", {
          scale: fitScale(data.body, box.w, bodyBudget, theme.type.body, { min: 0.7 }),
          color: theme.palette.ink_muted,
        }),
        valign: "top",
      });
    }
    if (data.sub) {
      slide.addText(data.sub, {
        x: box.x, y: subY, w: box.w, h: subH,
        ...textStyle(theme, "caption", { color: theme.palette.ink_muted }),
        valign: "middle",
      });
    }
  },

  /** Pro/con analysis — two labelled columns with bulleted points. */
  "pros-cons"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);

    const gut = theme.grid.gutter;
    const cw = (box.w - gut) / 2;
    const pad = 0.28;
    const ch = box.bottom - y - 0.1;
    const all = [...data.pros, ...data.cons];
    const scale = fitScaleAll(all, cw - pad * 2, ch - 1.1, theme.type.body);

    const header = (x, text, color, glyph) => {
      slide.addText(glyph, {
        x, y: y + 0.02, w: 0.5, h: 0.45,
        ...textStyle(theme, "subhead", { bold: true, color }),
        align: "left", valign: "middle",
      });
      slide.addText(text, {
        x: x + 0.42, y, w: cw - 0.42, h: 0.5,
        ...textStyle(theme, "eyebrow", { color }),
        align: "left", valign: "middle",
      });
    };
    header(box.x, "PROS", theme.palette.accent, "+");
    header(box.x + cw + gut, "CONS", theme.palette.ink_muted, "−");

    const points = (list, x) => slide.addText(
      list.map((p) => ({ text: p, options: { breakLine: true, bullet: { characterCode: "2022" } } })),
      {
        x: x + pad, y: y + 0.65, w: cw - pad * 2, h: ch - 0.7,
        ...textStyle(theme, "body", { scale }),
        paraSpaceAfter: 8, valign: "top",
      },
    );
    points(data.pros, box.x);
    points(data.cons, box.x + cw + gut);
  },

  /**
   * Few emphasised milestones on a vertical rail. The date rides inside an
   * accent node on the left rail; the title and body sit to its right. Title
   * and body fit-share the row height so a long body can never run into the
   * node above it.
   */
  milestone(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);

    const n = data.milestones.length;
    const gut = 0.35;
    const rowH = (box.bottom - y - 0.1 - gut * (n - 1)) / n;
    const railW = 1.5;
    const nodeW = 1.1, nodeH = 0.62;
    const rx = box.x + 0.32;
    const tw = box.w - railW;
    const titleScale = fitScaleAll(data.milestones.map((m) => m.title), tw, rowH * 0.45, theme.type.subhead);
    const bodyScale = fitScaleAll(
      data.milestones.map((m) => m.body).filter(Boolean), tw, rowH * 0.5, theme.type.body,
    );

    // The rail runs from the first node's centre to the last one's.
    slide.addShape("rect", {
      x: rx, y: y + rowH / 2, w: 0.03, h: box.bottom - y - rowH,
      fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
    });

    data.milestones.forEach((m, i) => {
      const ry = y + i * (rowH + gut);
      const cy = ry + rowH / 2;
      const whenScale = fitScale(m.when, nodeW - 0.1, nodeH, theme.type.eyebrow);
      slide.addShape("ellipse", {
        x: rx - nodeW / 2 + 0.1, y: cy - nodeH / 2, w: nodeW, h: nodeH,
        fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
      });
      slide.addText(m.when, {
        x: rx - nodeW / 2 + 0.1, y: cy - nodeH / 2, w: nodeW, h: nodeH,
        ...textStyle(theme, "eyebrow", { color: theme.palette.on_accent, scale: whenScale }),
        align: "center", valign: "middle",
      });
      slide.addText(m.title, {
        x: box.x + railW, y: ry, w: tw, h: rowH * 0.45,
        ...textStyle(theme, "subhead", { bold: true, scale: titleScale }),
        valign: "top",
      });
      if (m.body) {
        slide.addText(m.body, {
          x: box.x + railW, y: ry + rowH * 0.45 + 0.04, w: tw, h: rowH * 0.5,
          ...textStyle(theme, "body", { scale: bodyScale, color: theme.palette.ink_muted }),
          valign: "top",
        });
      }
    });
  },

  /**
   * A key-point panel — lighter than callout, more visual than a bullet: a
   * surface panel with a thick accent left bar, an optional eyebrow label and
   * the body centred inside.
   */
  emphasis(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);

    const ph = 1.9;
    const py = Math.max(y, 3.0);
    slide.addShape("roundRect", {
      x: box.x, y: py, w: box.w, h: ph,
      fill: { color: hex(theme.palette.surface) },
      line: { type: "none" },
      rectRadius: theme.shape?.radius?.card ?? 0.12,
    });
    slide.addShape("rect", {
      x: box.x, y: py, w: 0.08, h: ph,
      fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
    });

    const pad = 0.45;
    const label = data.label ?? "Key point";
    slide.addText(label, {
      x: box.x + pad, y: py + 0.32, w: box.w - pad * 2, h: 0.4,
      ...textStyle(theme, "eyebrow", { color: theme.palette.accent }),
      valign: "middle",
    });
    slide.addText(data.body, {
      x: box.x + pad, y: py + 0.8, w: box.w - pad * 2, h: ph - 0.95,
      ...textStyle(theme, "body", { scale: fitScale(data.body, box.w - pad * 2, ph - 0.95, theme.type.body) }),
      align: "center", valign: "middle",
    });
  },

  /** One term, its definition, and an optional example in a caption bar. */
  definition(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);

    const termScale = fitScale(data.term, box.w, 0.9, theme.type.heading, { min: 0.6 });
    slide.addText(data.term, {
      x: box.x, y, w: box.w, h: 0.9,
      ...textStyle(theme, "heading", { color: theme.palette.accent, scale: termScale }),
      valign: "top",
    });

    const example = data.example;
    const budget = (example ? box.bottom - 1.25 : box.bottom) - y - 1.0;
    slide.addText(data.definition, {
      x: box.x, y: y + 1.05, w: box.w, h: Math.max(0.6, budget),
      ...textStyle(theme, "body", { scale: fitScale(data.definition, box.w, budget, theme.type.body) }),
      valign: "top",
    });

    if (example) {
      const ey = box.bottom - 1.05;
      slide.addShape("rect", {
        x: box.x, y: ey + 0.06, w: 0.05, h: 0.62,
        fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
      });
      slide.addText(example, {
        x: box.x + 0.22, y: ey, w: box.w - 0.22, h: 0.75,
        ...textStyle(theme, "caption", { color: theme.palette.ink_muted, italic: true }),
        valign: "middle",
      });
    }
  },

  cards(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);

    const n = data.cards.length;
    const gut = theme.grid.gutter;
    const cw = (box.w - gut * (n - 1)) / n;
    const ch = box.bottom - y - 0.15;
    const pad = theme.shape?.card_pad ?? 0.28;
    const bodyScale = fitScaleAll(
      data.cards.map((c) => c.body), cw - pad * 2, ch - 1.35, theme.type.body,
    );

    data.cards.forEach((c, i) => {
      const x = box.x + i * (cw + gut);
      card(slide, theme, { x, y, w: cw, h: ch });

      let ty = y + pad;
      // The title must stay on ONE line — a wrapped title renders its second
      // line below the 0.42in box, straight into the body. Shrink it until it
      // fits the line instead; the body box below assumes a single title line.
      const titleScale = fitScale(c.title, cw - pad * 2, 0.42, theme.type.subhead, { min: 0.55 });
      slide.addText(c.title, {
        x: x + pad, y: ty, w: cw - pad * 2, h: 0.42,
        ...textStyle(theme, "subhead", { bold: true, scale: titleScale }),
        valign: "top",
      });
      ty += 0.44;

      if (c.kicker) {
        slide.addText(c.kicker, {
          x: x + pad, y: ty, w: cw - pad * 2, h: 0.3,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted }),
        });
        ty += 0.34;
      }

      slide.addText(c.body, {
        x: x + pad, y: ty + 0.1, w: cw - pad * 2, h: ch - (ty - y) - pad - 0.1,
        ...textStyle(theme, "body", { scale: bodyScale }),
        valign: "top",
      });
    });
  },

  compare(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);

    const hasVerdict = Boolean(data.verdict);
    const verdictH = hasVerdict ? 1.0 : 0;
    const gut = theme.grid.gutter;
    const cw = (box.w - gut) / 2;
    const ch = box.bottom - y - verdictH - (hasVerdict ? 0.24 : 0) - 0.1;
    const pad = theme.shape?.card_pad ?? 0.28;

    [data.left, data.right].forEach((side, i) => {
      const x = box.x + i * (cw + gut);
      card(slide, theme, { x, y, w: cw, h: ch });

      let ty = y + pad;
      // Same one-line rule as cards: a wrapped side title would collide with
      // the body beneath it, so shrink to fit a single line, never below the
      // theme's intended 0.6 heading scale.
      const titleScale = Math.min(
        0.6,
        fitScale(side.title, cw - pad * 2, 0.45, theme.type.heading, { min: 0.55 }),
      );
      slide.addText(side.title, {
        x: x + pad, y: ty, w: cw - pad * 2, h: 0.45,
        ...textStyle(theme, "heading", { scale: titleScale }),
        valign: "top",
      });
      ty += 0.48;

      if (side.kicker) {
        slide.addText(side.kicker, {
          x: x + pad, y: ty, w: cw - pad * 2, h: 0.3,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted }),
        });
        ty += 0.36;
      }

      slide.addText(side.body, {
        x: x + pad, y: ty + 0.06, w: cw - pad * 2, h: ch - (ty - y) - pad,
        ...textStyle(theme, "body", {
          scale: fitScaleAll([data.left.body, data.right.body], cw - pad * 2, ch - (ty - y) - pad, theme.type.body),
        }),
        valign: "top",
      });
    });

    if (hasVerdict) {
      const vy = y + ch + 0.24;
      slide.addShape("roundRect", {
        x: box.x, y: vy, w: box.w, h: verdictH,
        fill: { color: hex(theme.palette.ink) },
        line: { type: "none" },
        rectRadius: theme.shape?.radius?.card ?? 0.12,
      });
      slide.addText(
        [
          { text: `${data.label ?? "The framework"}: `, options: { color: hex(theme.palette.accent_alt ?? theme.palette.accent), bold: true } },
          { text: data.verdict, options: { color: hex(theme.palette.surface) } },
        ],
        {
          x: box.x + 0.34, y: vy, w: box.w - 0.68, h: verdictH,
          ...textStyle(theme, "body"),
          valign: "middle",
        },
      );
    }
  },

  stats(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);

    const n = data.stats.length;
    const gut = theme.grid.gutter;
    const cw = (box.w - gut * (n - 1)) / n;
    const accents = [theme.palette.accent, theme.palette.accent_alt ?? theme.palette.accent, theme.palette.ink];

    data.stats.forEach((s, i) => {
      const x = box.x + i * (cw + gut);
      // Value and label are stacked at fixed offsets (y, y+1.2, y+1.68); a
      // wrapped value would overflow its box into the label. Shrink to one
      // line rather than letting it collide.
      const valueScale = fitScale(s.value, cw, 0.75, theme.type.stat, { min: 0.6 });
      slide.addText(s.value, {
        x, y, w: cw, h: 1.15,
        ...textStyle(theme, "stat", { color: accents[i % accents.length], scale: valueScale }),
        valign: "top",
      });
      const labelScale = fitScale(s.label, cw, 0.45, theme.type.subhead, { min: 0.7 });
      slide.addText(s.label, {
        x, y: y + 1.2, w: cw, h: 0.45,
        ...textStyle(theme, "subhead", { bold: true, scale: labelScale }),
        valign: "top",
      });
      if (s.sub) {
        slide.addText(s.sub, {
          x, y: y + 1.68, w: cw, h: 0.5,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted }),
          valign: "top",
        });
      }
    });
  },

  quote(slide, ctx) {
    const { theme, data } = ctx;
    slide.background = { color: hex(theme.palette.surface) };
    const m = theme.grid.margin;
    const w = (CANVAS.w - m.left - m.right) * 0.82;
    const st = theme.type.heading;
    const scale = fitScale(data.quote, w, 2.6, st);

    slide.addShape("rect", {
      x: m.left, y: 2.3, w: 0.06, h: 2.4,
      fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
    });
    slide.addText(`“${data.quote}”`, {
      x: m.left + 0.34, y: 2.3, w, h: 2.4,
      ...textStyle(theme, "heading", { scale, italic: true }),
      valign: "middle",
    });
    if (data.attribution) {
      slide.addText(`— ${data.attribution}`, {
        x: m.left + 0.34, y: 4.85, w, h: 0.4,
        ...textStyle(theme, "caption", { color: theme.palette.ink_muted }),
      });
    }
  },

  callout(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const h = 1.5;

    slide.addShape("roundRect", {
      x: box.x, y: Math.max(y, 3.0), w: box.w, h,
      fill: { color: hex(theme.palette.ink) },
      line: { type: "none" },
      rectRadius: theme.shape?.radius?.card ?? 0.12,
    });
    slide.addText(
      [
        { text: `${data.label ?? "The framework"}: `, options: { color: hex(theme.palette.accent_alt ?? theme.palette.accent), bold: true } },
        { text: data.body, options: { color: hex(theme.palette.surface) } },
      ],
      {
        x: box.x + 0.36, y: Math.max(y, 3.0), w: box.w - 0.72, h,
        ...textStyle(theme, "subhead"),
        valign: "middle",
      },
    );
  },

  table(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);

    const head = data.columns.map((c) => ({
      text: c,
      options: {
        bold: true,
        color: hex(theme.palette.on_accent),
        fill: { color: hex(theme.palette.accent) },
        fontFace: theme.type.caption.family,
        fontSize: theme.type.caption.size + 1,
      },
    }));
    const body = data.rows.map((r, ri) =>
      r.map((cell) => ({
        text: cell,
        options: {
          color: hex(theme.palette.ink),
          fill: { color: hex(ri % 2 ? theme.palette.bg : theme.palette.surface) },
          fontFace: theme.type.body.family,
          fontSize: Math.max(9, theme.type.body.size - 2),
        },
      })),
    );

    slide.addTable([head, ...body], {
      x: box.x, y, w: box.w,
      border: { type: "solid", pt: 0.5, color: hex(theme.palette.rule) },
      rowH: 0.34,
      valign: "middle",
      margin: 0.08,
      autoPage: false,
    });
  },

  chart(slide, ctx) {
    const { theme, data, box, pres } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);

    const c = data.chart;
    const hasAside = Array.isArray(data.aside) && data.aside.length > 0;
    const cw = hasAside ? box.w * 0.63 : box.w;
    const ch = box.bottom - y - 0.1;

    const series = c.series.map((s) => ({ name: s.name, labels: c.categories, values: s.values }));

    // One series means one colour — varying hue across bars of a single series
    // encodes a distinction that does not exist, and drags in low-contrast
    // palette entries that were never meant to sit on the background.
    const ramp = [theme.palette.accent, theme.palette.accent_alt ?? theme.palette.ink, theme.palette.ink_muted, theme.palette.rule];
    const isCircular = c.kind === "pie" || c.kind === "doughnut";
    const colors = (series.length === 1 && !isCircular ? [theme.palette.accent] : ramp).map((x) => hex(x));

    const kindMap = { bar: "bar", hbar: "bar", line: "line", pie: "pie", doughnut: "doughnut", area: "area" };
    slide.addChart(kindMap[c.kind] ?? "bar", series, {
      x: box.x, y, w: cw, h: ch,
      barDir: c.kind === "hbar" ? "bar" : "col",
      chartColors: colors,
      varyColors: isCircular,
      showLegend: series.length > 1,
      legendPos: "b",
      legendFontFace: theme.type.caption.family,
      legendFontSize: theme.type.caption.size,
      catAxisLabelFontFace: theme.type.caption.family,
      catAxisLabelFontSize: theme.type.caption.size,
      valAxisLabelFontFace: theme.type.caption.family,
      valAxisLabelFontSize: theme.type.caption.size,
      catAxisLabelColor: hex(theme.palette.ink_muted),
      valAxisLabelColor: hex(theme.palette.ink_muted),
      valGridLine: { color: hex(theme.palette.rule), style: "solid", size: 0.5 },
      catGridLine: { style: "none" },
      showValue: c.kind === "pie" || c.kind === "doughnut",
      dataLabelFontFace: theme.type.caption.family,
      dataLabelFontSize: theme.type.caption.size,
    });

    if (hasAside) {
      const ax = box.x + cw + theme.grid.gutter;
      const aw = box.w - cw - theme.grid.gutter;
      let ay = y + 0.1;
      for (const note of data.aside) {
        slide.addShape("rect", {
          x: ax, y: ay + 0.06, w: 0.04, h: 0.42,
          fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
        });
        slide.addText(note, {
          x: ax + 0.18, y: ay, w: aw - 0.18, h: 0.9,
          ...textStyle(theme, "body", { scale: 0.9 }),
          valign: "top",
        });
        ay += 1.0;
      }
    }
  },

  flow(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);

    const n = data.steps.length;
    const ttb = data.direction === "ttb";
    const gut = 0.42;

    if (ttb) {
      const sh = (box.bottom - y - gut * (n - 1)) / n;
      data.steps.forEach((s, i) => {
        const sy = y + i * (sh + gut);
        card(slide, theme, { x: box.x, y: sy, w: box.w, h: sh });
        slide.addText(s.title, {
          x: box.x + 0.3, y: sy + 0.1, w: box.w - 0.6, h: 0.4,
          ...textStyle(theme, "subhead", { bold: true }), valign: "middle",
        });
        if (s.body) {
          slide.addText(s.body, {
            x: box.x + 0.3, y: sy + 0.48, w: box.w - 0.6, h: sh - 0.56,
            ...textStyle(theme, "body", { scale: 0.9, color: theme.palette.ink_muted }), valign: "top",
          });
        }
        if (i < n - 1) {
          slide.addShape("triangle", {
            x: box.x + box.w / 2 - 0.11, y: sy + sh + 0.08, w: 0.22, h: 0.22,
            fill: { color: hex(theme.palette.accent) }, line: { type: "none" }, rotate: 180,
          });
        }
      });
    } else {
      const arrow = 0.34;
      const sw = (box.w - (gut + arrow) * (n - 1)) / n;
      const sh = Math.min(2.3, box.bottom - y - 0.2);
      data.steps.forEach((s, i) => {
        const sx = box.x + i * (sw + gut + arrow);
        card(slide, theme, { x: sx, y, w: sw, h: sh });
        slide.addShape("ellipse", {
          x: sx + 0.26, y: y + 0.26, w: 0.4, h: 0.4,
          fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
        });
        slide.addText(String(i + 1), {
          x: sx + 0.26, y: y + 0.26, w: 0.4, h: 0.4,
          ...textStyle(theme, "eyebrow", { color: theme.palette.on_accent }),
          align: "center", valign: "middle",
        });
        slide.addText(s.title, {
          x: sx + 0.26, y: y + 0.78, w: sw - 0.52, h: 0.5,
          // Narrow ltr step cards are ~1.2in at six steps. fitScale's height
          // logic returns a scale where two lines fit the 0.5in budget, which
          // still breaks a long word mid-word; shrink by measured width with a
          // pessimistic safety factor instead, so words never split.
          ...textStyle(theme, "subhead", {
            bold: true,
            scale: Math.min(1, Math.max(0.42, ((sw - 0.52) / measure(s.title, theme.type.subhead)) * 0.9)),
          }),
          valign: "top",
        });
        if (s.body) {
          slide.addText(s.body, {
            x: sx + 0.26, y: y + 1.28, w: sw - 0.52, h: sh - 1.5,
            ...textStyle(theme, "body", {
              scale: fitScaleAll(data.steps.map((x) => x.body).filter(Boolean), sw - 0.52, sh - 1.5, theme.type.body, { min: 0.42 }),
              color: theme.palette.ink_muted,
            }),
            valign: "top",
          });
        }
        if (i < n - 1) {
          slide.addShape("triangle", {
            x: sx + sw + gut / 2, y: y + sh / 2 - 0.12, w: 0.24, h: 0.24,
            fill: { color: hex(theme.palette.accent) }, line: { type: "none" }, rotate: 90,
          });
        }
      });
    }
  },

  image(slide, ctx) {
    const { theme, data, box, resolveAsset } = ctx;
    const src = resolveAsset(data.image);
    if (!src) return;
    const capH = data.caption ? 0.5 : 0;
    slide.addImage({
      path: src,
      x: box.x, y: box.y, w: box.w, h: box.bottom - box.y - capH,
      sizing: { type: data.fit ?? "cover", w: box.w, h: box.bottom - box.y - capH },
    });
    if (data.caption) {
      slide.addText(data.caption, {
        x: box.x, y: box.bottom - capH + 0.06, w: box.w, h: 0.4,
        ...textStyle(theme, "caption", { color: theme.palette.ink_muted, italic: true }),
      });
    }
  },

  "image-text"(slide, ctx) {
    const { theme, data, box, resolveAsset } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);

    const gut = theme.grid.gutter;
    const iw = box.w * 0.46;
    const tw = box.w - iw - gut;
    const h = box.bottom - y - 0.1;
    const imgLeft = data.side === "left";
    const ix = imgLeft ? box.x : box.x + tw + gut;
    const tx = imgLeft ? box.x + iw + gut : box.x;

    const src = resolveAsset(data.image);
    if (src) {
      slide.addImage({
        path: src, x: ix, y, w: iw, h,
        sizing: { type: "cover", w: iw, h },
        rounding: false,
      });
    }
    slide.addText(
      data.body.map((b) => ({ text: b, options: { breakLine: true } })),
      {
        x: tx, y, w: tw, h,
        ...textStyle(theme, "body", { scale: fitScaleAll(data.body, tw, h / data.body.length, theme.type.body) }),
        paraSpaceAfter: 10, valign: "top",
      },
    );
  },

  timeline(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);

    const n = data.events.length;
    const railY = y + 0.55;
    slide.addShape("rect", {
      x: box.x, y: railY, w: box.w, h: 0.03,
      fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
    });

    const step = box.w / n;
    data.events.forEach((e, i) => {
      const cx = box.x + step * i + step / 2;
      slide.addShape("ellipse", {
        x: cx - 0.1, y: railY - 0.085, w: 0.2, h: 0.2,
        fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
      });
      slide.addText(e.when, {
        x: cx - step / 2 + 0.1, y: railY - 0.62, w: step - 0.2, h: 0.4,
        ...textStyle(theme, "eyebrow", { color: theme.palette.accent }), align: "center",
      });
      slide.addText(e.what, {
        x: cx - step / 2 + 0.1, y: railY + 0.26, w: step - 0.2, h: box.bottom - railY - 0.4,
        ...textStyle(theme, "body", { scale: 0.85 }), align: "center", valign: "top",
      });
    });
  },

  references(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    slide.addText(
      data.items.map((r, i) => ({ text: `[${i + 1}] ${r}`, options: { breakLine: true } })),
      {
        x: box.x, y, w: box.w, h: box.bottom - y,
        ...textStyle(theme, "caption", { color: theme.palette.ink_muted }),
        paraSpaceAfter: 6, valign: "top",
      },
    );
  },
};

export { content };
