import { hex, textStyle, applyTransform } from "./theme.js";
import { fitScale, fitScaleAll, fitOneLine, lineCount, measure, floorOf } from "./fit.js";
import { CANVAS, reservedTopRight } from "./chrome.js";
import { chartSeries, ensureContrast } from "./chartpalette.js";
import {
  frameBox, drawOpening, drawHeading, bulletOptions, listColumns, hasDropcap,
  sectionField, sectionStyle, titlePlacement,
} from "./composition.js";

/**
 * One renderer per slide type. Each receives a fully resolved context and
 * draws with theme tokens only — no literal colours or font names anywhere in
 * this file. That constraint is what makes 20 themes possible without 20
 * renderers.
 */

const path2 = (ctx) => ctx; // keep signature obvious at call sites

/* ------------------------------------------------------------------ utils */

/**
 * The vertical box, in inches, that stacked titles/labels need for their real
 * rendered lines at the theme's nominal size. The stacked layouts used to
 * reserve a fixed one-line guess and shrink the text into it — the classic
 * small-font pattern (a long card title rendered at ~8pt to stay on one line).
 * Sizing the box to the content's own line count gives the text its lines at a
 * readable size, and the fitter's floor still guards the genuinely-too-long.
 */
function linesBox(theme, token, texts, width) {
  const st = theme.type[token];
  const lineH = (st.size * (st.line ?? 1.3)) / 72;
  const lines = Math.max(
    1,
    ...texts.filter(Boolean).map((t) => lineCount(String(t), width, { ...st, size: st.size })),
  );
  return Math.round((lines * lineH + 0.06) * 100) / 100;
}

function content(theme, brand, { full = false, note = 0, identity, type = null } = {}) {
  const m = theme.grid.margin;
  const reserve = full ? 0 : reservedTopRight(brand, identity);
  // A speaker-note bar reserves height at the bottom of the content box; the
  // bar itself is drawn by render.js in the space this frees.
  const bottom = CANVAS.h - m.bottom - note;
  const base = {
    x: m.left,
    y: m.top,
    w: CANVAS.w - m.left - m.right,
    right: CANVAS.w - m.right,
    bottom,
    titleW: CANVAS.w - m.left - m.right - reserve,
  };
  // The theme's frame decides where the mark, the heading and the body sit
  // within those margins. Full-bleed surfaces keep the plain column.
  return frameBox(theme, base, full ? "full" : null, type);
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

/**
 * The mark that opens a content slide — a numbered section pill by default,
 * or whatever else the theme's composition calls for. Shared by most content
 * slides, which is why one theme token restyles all of them at once.
 */
function eyebrow(slide, ctx) {
  drawOpening(slide, ctx);
}

/**
 * Headline + optional standfirst, in the column the theme's frame gives them.
 * Returns the y where body content may start — which in a sidebar frame is the
 * top of the body column rather than the bottom of the headline.
 */
function heading(slide, ctx) {
  return drawHeading(slide, ctx);
}

/**
 * Paint a full-bleed surface.
 *
 * The renderer places a plate as the slide background BEFORE the layout runs,
 * because pptxgenjs numbers a background image's relationship without counting
 * chart relationships: a background assigned after `addChart` is written as a
 * second rId1, the reader resolves the blip to the chart part, and the slide
 * loses its background and rasterises white. So a layout paints only when
 * there is no plate under it. See docs/TRAPS.md.
 */
function paint(slide, ctx, color) {
  if (ctx.plate) return;
  slide.background = { color: hex(color) };
}

/* ---------------------------------------------------------------- layouts */

export const layouts = {
  title(slide, ctx) {
    const { theme, deck, identity } = ctx;
    const s = theme.surfaces.title;
    paint(slide, ctx, s.bg);

    const m = theme.grid.margin;
    const comp = titlePlacement(theme);
    const st = theme.type.display;

    // A split field or a band borrows the SECTION surface rather than mixing a
    // new colour: bg-on-ink there is a pairing the theme contract already
    // holds, and an invented one is how a title slide ends up at 1.2:1 with
    // nobody noticing. Both also start below 1.5in, which is where the locked
    // banner chrome stops.
    let x = m.left;
    let w = CANVAS.w - m.left - m.right;
    let titleY = 1.95, titleH = 2.5, valign = "bottom", metaY = 4.65;
    let ink = s.ink;
    const align = comp === "centred" || comp === "band" ? { align: "center" } : {};

    if (comp === "split") {
      const fx = CANVAS.w * 0.63;
      slide.addShape("rect", {
        x: fx, y: 1.5, w: CANVAS.w - fx, h: CANVAS.h - 1.5,
        fill: { color: hex(theme.surfaces.section.bg) }, line: { type: "none" },
      });
      w = fx - m.left - 0.55;
    } else if (comp === "band") {
      slide.addShape("rect", {
        x: 0, y: 1.85, w: CANVAS.w, h: 2.5,
        fill: { color: hex(theme.surfaces.section.bg) }, line: { type: "none" },
      });
      ink = theme.surfaces.section.ink;
      titleY = 1.95; titleH = 2.3; valign = "middle"; metaY = 4.7;
    } else if (comp === "centred") {
      titleY = 1.9; titleH = 2.6; metaY = 4.75;
    } else if (comp === "top") {
      titleY = 1.85; titleH = 2.4; valign = "top"; metaY = 5.25;
    }

    // Two lines of display type is the design intent; only shrink past that.
    const scale = fitScale(deck.title, w, (st.size / 72) * (st.line ?? 1.12) * 2, st);
    slide.addText(deck.title, {
      x, y: titleY, w, h: titleH,
      ...textStyle(theme, "display", { color: ink, scale }),
      ...align, valign,
    });

    let y = metaY;
    if (deck.subtitle) {
      slide.addText(deck.subtitle, {
        x, y, w, h: 0.5,
        ...textStyle(theme, "subhead", { color: s.muted, italic: true }),
        ...align,
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
        x, y, w, h: 0.4,
        ...textStyle(theme, "caption", { color: s.muted }),
        ...align,
      });
      y += 0.42;
    }

    const guide = identity.guide?.name;
    if (guide) {
      const role = identity.guide?.designation;
      slide.addText(`Guide: ${guide}${role ? ` · ${role}` : ""}`, {
        x, y, w, h: 0.35,
        ...textStyle(theme, "caption", { color: s.muted }),
        ...align,
      });
    }

    const sub = [identity.academic?.subject, identity.academic?.year]
      .filter(Boolean).join("  ·  ");
    if (sub) {
      slide.addText(sub, {
        x, y: CANVAS.h - m.bottom - 0.42, w, h: 0.35,
        ...textStyle(theme, "caption", { color: s.accent ?? s.muted }),
        ...align,
      });
    }
  },

  section(slide, ctx) {
    const { theme, data, deck } = ctx;
    const s = theme.surfaces.section;
    paint(slide, ctx, s.bg);
    const m = theme.grid.margin;
    const w = CANVAS.w - m.left - m.right;
    const { place, field } = sectionStyle(theme);
    const num = data.section != null && deck.sections?.[data.section]
      ? String(data.section + 1).padStart(2, "0")
      : null;

    // The number as the graphic: a display figure holding a column of its own,
    // the headline set beside it. There is no stack to enclose, so no field.
    if (place === "numeral") {
      sectionField(slide, theme, s, null);
      const colW = 2.9;
      const tx = m.left + colW + 0.6;
      const tw = CANVAS.w - m.right - tx;
      if (num) {
        slide.addText(num, {
          x: m.left, y: 2.35, w: colW, h: 2.3,
          ...textStyle(theme, "display", { color: s.muted, scale: 2.4 }),
          valign: "middle",
        });
      }
      const hs = fitScale(data.headline ?? "", tw, 1.9, theme.type.display, { min: 0.5 });
      slide.addText(data.headline ?? "", {
        x: tx, y: 2.35, w: tw, h: 1.9,
        ...textStyle(theme, "display", { color: s.ink, scale: Math.min(hs, 0.8) }),
        valign: "middle",
      });
      if (data.standfirst) {
        slide.addText(data.standfirst, {
          x: tx, y: 4.4, w: tw, h: 0.9,
          ...textStyle(theme, "subhead", { color: s.muted }),
          valign: "top",
        });
      }
      return;
    }

    const centred = place === "centred";
    const align = centred ? { align: "center" } : {};
    // The stack is measured before anything is painted, so a band or a pair of
    // rules can enclose the headline rather than guess where it landed.
    const top = centred ? 2.55 : 2.85;
    const numY = top;
    const ruleY = top + (num ? 0.38 : 0);
    const headY = ruleY + 0.30;
    const band = { y: headY - 0.2, h: 1.55 };
    const ink = sectionField(slide, theme, s, band);

    if (num) {
      slide.addText(num, {
        x: m.left, y: numY, w, h: 0.34,
        ...textStyle(theme, "eyebrow", { color: s.muted }),
        ...align,
      });
    }

    // The accent rule is the decorative element a plain section surface draws —
    // a short bar in the surface's light tint under the number, so a section
    // break reads as designed rather than as a bare text block. A theme whose
    // divider already carries a band or a pair of rules has its decoration,
    // and the bar would land on the field's edge.
    if (field !== "band" && field !== "rules") {
      slide.addShape("rect", {
        x: centred ? (CANVAS.w - 1.0) / 2 : m.left, y: ruleY + 0.06, w: 1.0, h: 0.05,
        fill: { color: hex(s.muted) }, line: { type: "none" },
      });
    }

    slide.addText(data.headline ?? "", {
      x: m.left, y: headY, w, h: 1.15,
      ...textStyle(theme, "display", { color: ink, scale: 0.8 }),
      ...align, valign: "top",
    });

    if (data.standfirst) {
      // A band ends 0.2in under the headline box; the standfirst clears it so
      // it stays on the surface, in the surface's muted ink.
      const sfY = field === "band" ? band.y + band.h + 0.18 : headY + 1.1;
      slide.addText(data.standfirst, {
        x: m.left, y: sfY, w: centred ? w : w * 0.66, h: 0.9,
        ...textStyle(theme, "subhead", { color: s.muted }),
        ...align, valign: "top",
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

    // A magazine-style column split: when the theme sets two columns and there
    // are enough bullets to justify it, the list runs in two instead of one
    // long stack. One-column themes never reach this.
    if (listColumns(theme) === 2 && data.bullets.length >= 4) {
      const colGut = 0.45;
      const cw = (box.w - colGut) / 2;
      const half = Math.ceil(data.bullets.length / 2);
      const left = data.bullets.slice(0, half);
      const right = data.bullets.slice(half);
      const colScale = fitScaleAll(data.bullets, cw - 0.35, avail / Math.max(left.length, right.length), st);
      for (const [i, col] of [left, right].entries()) {
        const rx = box.x + i * (cw + colGut);
        const from = i === 0 ? 0 : half;
        slide.addText(
          col.map((b, j) => ({ text: b, options: { breakLine: true, ...bulletOptions(theme, from + j) } })),
          {
            x: rx, y, w: cw, h: avail,
            ...textStyle(theme, "body", { scale: colScale }),
            paraSpaceAfter: 10,
            valign: "top",
          },
        );
      }
      return;
    }

    slide.addText(
      data.bullets.map((b, i) => ({ text: b, options: { breakLine: true, ...bulletOptions(theme, i) } })),
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
      list.map((p, i) => ({ text: p, options: { breakLine: true, ...bulletOptions(theme, i) } })),
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

    // The drop cap: the definition's first letter renders as a large display
    // initial and the body's first line indents past it. Themes that do not
    // ask for one never see it.
    const dropcap = hasDropcap(theme) && data.definition?.length > 0;
    const capW = dropcap ? 0.85 : 0;

    slide.addText(data.term, {
      x: box.x, y, w: box.w - capW, h: 0.9,
      ...textStyle(theme, "heading", { color: theme.palette.accent, scale: termScale }),
      valign: "top",
    });

    const example = data.example;
    const budget = (example ? box.bottom - 1.25 : box.bottom) - y - 1.0;
    const defX = box.x + capW;
    const defW = box.w - capW;

    if (dropcap) {
      const cap = String(data.definition).trim()[0];
      const capStyle = theme.type.display;
      // The cap spans roughly three body lines; the body indents past its
      // width so the first lines wrap around it like a printed magazine.
      slide.addText(cap, {
        x: box.x, y: y + 1.0, w: 0.85, h: 1.35,
        ...textStyle(theme, "display", {
          color: theme.palette.accent,
          scale: Math.min(1, fitScale(cap, 0.85, 1.35, capStyle)),
        }),
        valign: "top",
      });
    }

    const bodyScale = fitScale(data.definition, defW, budget, theme.type.body);
    slide.addText(data.definition, {
      x: defX, y: y + 1.05, w: defW, h: Math.max(0.6, budget),
      ...textStyle(theme, "body", { scale: bodyScale }),
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
    // The title box holds the lines the longest title really needs — a
    // one-line rule shrank long titles to ~8pt, the exact small-font the floor
    // now forbids. The body starts after the title, sized to the remainder.
    const titleH = linesBox(theme, "subhead", data.cards.map((c) => c.title), cw - pad * 2);
    const stackH = titleH + 0.04 + (data.cards.some((c) => c.kicker) ? 0.34 : 0);
    const bodyBudget = Math.max(0.4, ch - pad - stackH);
    const bodyScale = fitScaleAll(
      data.cards.map((c) => c.body), cw - pad * 2, bodyBudget, theme.type.body,
    );
    const titleScale = fitScaleAll(
      data.cards.map((c) => c.title), cw - pad * 2, titleH, theme.type.subhead,
    );

    data.cards.forEach((c, i) => {
      const x = box.x + i * (cw + gut);
      card(slide, theme, { x, y, w: cw, h: ch });

      let ty = y + pad;
      slide.addText(c.title, {
        x: x + pad, y: ty, w: cw - pad * 2, h: titleH,
        ...textStyle(theme, "subhead", { bold: true, scale: titleScale }),
        valign: "top",
      });
      ty += titleH + 0.04;

      if (c.kicker) {
        slide.addText(c.kicker, {
          x: x + pad, y: ty, w: cw - pad * 2, h: 0.3,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted }),
        });
        ty += 0.34;
      }

      slide.addText(c.body, {
        x: x + pad, y: ty + 0.08, w: cw - pad * 2, h: ch - (ty - y) - pad,
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
    const accents = [theme.palette.accent, theme.palette.accent_alt ?? theme.palette.accent];

    const sub = theme.type.subhead;
    const valueH = (theme.type.stat.size * (theme.type.stat.line ?? 1.0)) / 72;
    const cap = theme.type.caption;
    const capH = (cap.size * (cap.line ?? 1.3)) / 72;

    // Measure each column at its fitted size first, so the sub sits below the
    // label's REAL rendered lines (a wrapped label used to meet its sub), and
    // the whole block is tall enough to centre in the content box instead of
    // piling its columns in the top half of the slide. The label is measured
    // against a ~10% narrower width than the column actually gives it — the
    // fitter's wrap heuristic runs optimistic for long labels, and an
    // underestimated line count is what lets a 3-line label meet its sub.
    const cols = data.stats.map((s) => {
      const valueScale = fitOneLine(s.value, cw, theme.type.stat, { min: 0.6 });
      const labelW = cw * 0.9;
      const labelScale = fitScale(s.label, labelW, 1.2, sub, { min: 0.7 });
      const labelLines = lineCount(s.label, labelW, { ...sub, size: sub.size * labelScale });
      const labelH = labelLines * ((sub.size * labelScale * (sub.line ?? 1.4)) / 72) + 0.05;
      const subH = s.sub ? capH : 0;
      return { s, valueScale, labelScale, labelLines, labelH, height: valueH + 0.18 + labelH + (s.sub ? 0.08 + capH : 0) };
    });

    const blockH = Math.max(...cols.map((c) => c.height));
    const startY = Math.max(y + 0.1, (box.bottom - blockH) / 2);

    cols.forEach((col, i) => {
      const x = box.x + i * (cw + gut);
      slide.addText(col.s.value, {
        x, y: startY, w: cw, h: valueH + 0.1,
        ...textStyle(theme, "stat", { color: accents[i % accents.length], scale: col.valueScale }),
        valign: "top",
      });
      const ly = startY + valueH + 0.18;
      slide.addText(col.s.label, {
        x, y: ly, w: cw, h: col.labelH,
        ...textStyle(theme, "subhead", { bold: true, scale: col.labelScale }),
        valign: "top",
      });
      if (col.s.sub) {
        slide.addText(col.s.sub, {
          x, y: ly + col.labelH + 0.08, w: cw, h: capH + 0.1,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted }),
          valign: "top",
        });
      }
    });
  },

  quote(slide, ctx) {
    const { theme, data } = ctx;
    paint(slide, ctx, theme.palette.surface);
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

    // pptxgenjs scatters read the x coordinates from a synthetic first "X-Axis"
    // series (its values are the x positions); every real series supplies the
    // y values. All other kinds share the category/value shape.
    // A plated theme puts a native panel behind the chart. Two reasons, and the
    // second is not cosmetic: LibreOffice drops a slide's background image on
    // any slide carrying a chart, so the plate is present and correct in the
    // .pptx — it opens right in PowerPoint — and absent from the preview the
    // app rasterises. Every chart slide in a plate theme therefore previewed as
    // a bare white page. The panel restores the surface the rest of the deck
    // sits on, and matches what the other content layouts already draw.
    if (theme.plate?.enabled) {
      card(slide, theme, { x: box.x, y, w: hasAside ? box.w : cw, h: ch });
    }

    const raw = c.series.map((s) => ({ name: s.name, labels: c.categories, values: s.values }));
    const series = c.kind === "scatter"
      ? [
          { name: "X-Axis", values: c.categories.map((cat, i) => Number(cat) || i + 1) },
          ...raw.map(({ name, values }) => ({ name, values })),
        ]
      : raw;

    // One series means one colour — varying hue across bars of a single series
    // encodes a distinction that does not exist.
    //
    // Everything else reads the theme's categorical chart palette. It used to
    // improvise a ramp from ink_muted and rule, which are secondary text and a
    // hairline: the third series came out washed out, the fourth sat almost on
    // the background, and a monochrome theme drew several identical black
    // series plus a white one that was invisible.
    const isCircular = c.kind === "pie" || c.kind === "doughnut";
    const count = isCircular ? Math.max(c.categories.length, 1) : Math.max(c.series.length, 1);
    const colors = (c.series.length === 1 && !isCircular
      ? [ensureContrast(theme.palette.accent, theme.palette.bg)]
      : chartSeries(theme, count)).map((x) => hex(x));

    const kindMap = {
      bar: "bar", hbar: "bar", line: "line", pie: "pie", doughnut: "doughnut", area: "area",
      scatter: "scatter", radar: "radar", "stacked-bar": "bar",
    };
    slide.addChart(kindMap[c.kind] ?? "bar", series, {
      x: box.x, y, w: cw, h: ch,
      barDir: c.kind === "hbar" ? "bar" : "col",
      barGrouping: c.kind === "stacked-bar" ? "stacked" : undefined,
      chartColors: colors,
      varyColors: isCircular,
      showLegend: c.series.length > 1,
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
      // A vertical flow renders as a NUMBERED SPINE — a number chip on a
      // central rail with the title flowing right — not a stack of full-width
      // cards. At six steps the old cards were ~0.5in thin stripes, the body
      // was dropped, and the bottom quarter of the slide was empty. A spine
      // gives the title the real width, so the rows read as a deliberate flow
      // at any step count. Bodies need ~0.72in per row (title + two lines), so
      // like the old cards they render only while the rows have room — a tiny
      // unreadable body is worse than none, and the count is the model's.
      const chip = 0.5;
      const railX = box.x + 0.34;
      const textX = railX + 0.85;
      const textW = box.right - textX - 0.15;
      const gutT = 0.14;
      const rowH = (box.bottom - y - gutT * (n - 1)) / n;
      // Bodies render once the row is tall enough for a title plus ONE line at
      // the body's floor — the spine layout spans the full width, so a line is
      // cheap and a 6-step flow with short bodies fills the slide. The old
      // full-width cards needed ~0.75in per row (a whole body across a narrow
      // card), which is why they dropped bodies at five steps. A body that
      // needs TWO lines at the floor cannot fit a six-step row — it drops
      // (title-only step) rather than shrinking below the readable floor.
      const canBody = rowH >= 0.55;
      const bodyBudget = Math.max(0.26, rowH - 0.32);
      const oneLineBody = (s) => s.body && lineCount(s.body, textW, theme.type.body) <= 1;
      const renderedBodies = data.steps.filter(oneLineBody).map((s) => s.body);
      const titleScale = fitScaleAll(data.steps.map((s) => s.title), textW, canBody ? 0.32 : rowH, theme.type.subhead, { min: 0.6 });
      const bodyScale = canBody
        ? fitScaleAll(renderedBodies, textW, bodyBudget, theme.type.body)
        : 1;
      data.steps.forEach((s, i) => {
        const ry = y + i * (rowH + gutT);
        const cyRow = ry + rowH / 2;
        if (i < n - 1) {
          slide.addShape("rect", {
            x: railX - 0.012, y: cyRow + chip / 2, w: 0.024, h: rowH + gutT - chip,
            fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
          });
          slide.addShape("triangle", {
            x: railX - 0.09, y: ry + rowH + gutT / 2 - 0.09, w: 0.18, h: 0.18,
            fill: { color: hex(theme.palette.accent) }, line: { type: "none" }, rotate: 180,
          });
        }
        slide.addShape("ellipse", {
          x: railX - chip / 2, y: cyRow - chip / 2, w: chip, h: chip,
          fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
        });
        slide.addText(String(i + 1), {
          x: railX - chip / 2, y: cyRow - chip / 2, w: chip, h: chip,
          ...textStyle(theme, "eyebrow", { color: theme.palette.on_accent }),
          align: "center", valign: "middle",
        });
        slide.addText(s.title, {
          x: textX, y: ry, w: textW, h: canBody ? 0.32 : rowH,
          ...textStyle(theme, "subhead", { bold: true, scale: titleScale }),
          valign: canBody ? "top" : "middle",
        });
        if (oneLineBody(s) && canBody) {
          slide.addText(s.body, {
            x: textX, y: ry + 0.3, w: textW, h: bodyBudget,
            ...textStyle(theme, "body", { scale: bodyScale, color: theme.palette.ink_muted }),
            valign: "top",
          });
        }
      });
    } else {
      // Horizontal flow as a MILESTONE RAIL: number chips sit on a baseline
      // that runs across the slide, each step's title floats above its chip
      // and the body fills the zone below the rail. The old single row of
      // narrow cards hugged the heading, dropped bodies at five steps and
      // left the lower half of the slide empty; the rail spans the full
      // content height so every step renders title AND body, and the deck's
      // step count never decides whether a sentence survives.
      const n = data.steps.length;
      const colW = box.w / n;
      const railY = Math.min(box.bottom - 1.1, y + (box.bottom - y) * 0.38);
      const titleZone = Math.max(0.7, railY - y - 0.22);
      const bodyTop = railY + 0.48;
      const bodyH = box.bottom - bodyTop - 0.1;

      const titleScale = fitScaleAll(data.steps.map((s) => s.title), colW - 0.3, titleZone, theme.type.subhead, { min: 0.72 });
      const bodyScale = fitScaleAll(data.steps.map((s) => s.body).filter(Boolean), colW - 0.3, bodyH, theme.type.body, { min: 0.72 });

      // The baseline the chips ride on.
      slide.addShape("rect", {
        x: box.x, y: railY - 0.015, w: box.w, h: 0.03,
        fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
      });

      data.steps.forEach((s, i) => {
        const cx = box.x + colW * i + colW / 2;
        slide.addShape("ellipse", {
          x: cx - 0.24, y: railY - 0.24, w: 0.48, h: 0.48,
          fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
        });
        slide.addText(String(i + 1), {
          x: cx - 0.24, y: railY - 0.24, w: 0.48, h: 0.48,
          ...textStyle(theme, "eyebrow", { color: theme.palette.on_accent }),
          align: "center", valign: "middle",
        });
        // A small chevron on the rail to the next chip.
        if (i < n - 1) {
          slide.addShape("triangle", {
            x: cx + 0.34, y: railY - 0.1, w: 0.2, h: 0.2,
            fill: { color: hex(theme.palette.accent) }, line: { type: "none" }, rotate: 90,
          });
        }
        slide.addText(s.title, {
          x: cx - colW / 2 + 0.15, y, w: colW - 0.3, h: titleZone,
          ...textStyle(theme, "subhead", { bold: true, scale: titleScale }),
          align: "center", valign: "top",
        });
        if (s.body) {
          slide.addText(s.body, {
            x: cx - colW / 2 + 0.15, y: bodyTop, w: colW - 0.3, h: bodyH,
            ...textStyle(theme, "body", { color: theme.palette.ink_muted, scale: bodyScale }),
            align: "center", valign: "top",
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
    const step = box.w / n;
    // The band is "when" above the rail, "what" below. It used to hug the
    // heading at `y + 0.55`, leaving the lower half of the slide empty; the
    // rail is now vertically centred so the "what" zone below balances the
    // "when" zone above. Body lines are counted at the fitted size so the
    // block height is the real rendered one, never a one-line guess.
    const whenSt = theme.type.eyebrow;
    const bodyLines = Math.max(
      1,
      ...data.events.map((e) => lineCount(e.what, step - 0.2, { ...theme.type.body, size: theme.type.body.size * 0.85 })),
    );
    const bodyH = bodyLines * ((theme.type.body.size * 0.85 * (theme.type.body.line ?? 1.3)) / 72);
    const blockH = 0.42 + 0.03 + 0.24 + bodyH;
    const railY = y + Math.max(0, (box.bottom - y - blockH) / 2) + 0.42;
    slide.addShape("rect", {
      x: box.x, y: railY, w: box.w, h: 0.03,
      fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
    });

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

  /**
   * A lighter section divider: the section surface, a centred headline and an
   * optional standfirst. No section number — chapter is for sub-parts within a
   * major section, so numbering would duplicate the section eyebrow.
   */
  chapter(slide, ctx) {
    const { theme, data } = ctx;
    const s = theme.surfaces.section;
    paint(slide, ctx, s.bg);
    // A chapter paints the same surface as a section, so it carries the same
    // field — a theme whose dividers are banded must band both or the deck
    // reads as two themes.
    const ink = sectionField(slide, theme, s, { y: 2.2, h: 2.1 });
    const m = theme.grid.margin;
    const w = CANVAS.w - m.left - m.right;
    const scale = fitScale(data.headline, w, 1.8, theme.type.display, { min: 0.55 });
    slide.addText(data.headline, {
      x: m.left, y: 2.35, w, h: 1.8,
      ...textStyle(theme, "display", { color: ink, scale }),
      align: "center", valign: "middle",
    });
    if (data.standfirst) {
      const sfScale = fitScale(data.standfirst, w * 0.66, 0.9, theme.type.subhead, { min: 0.7 });
      slide.addText(data.standfirst, {
        x: (CANVAS.w - w * 0.66) / 2, y: 4.35, w: w * 0.66, h: 0.9,
        ...textStyle(theme, "subhead", { color: s.muted, scale: sfScale }),
        align: "center", valign: "top",
      });
    }
  },

  /**
   * The final slide: a centred display headline on the title surface, an
   * optional body, and an optional call-to-action pill at the bottom centre.
   */
  closing(slide, ctx) {
    const { theme, data } = ctx;
    const s = theme.surfaces.title;
    paint(slide, ctx, s.bg);
    const m = theme.grid.margin;
    const w = CANVAS.w - m.left - m.right;
    const scale = fitScale(data.headline, w, 2.2, theme.type.display, { min: 0.55 });
    slide.addText(data.headline, {
      x: m.left, y: 1.85, w, h: 2.2,
      ...textStyle(theme, "display", { color: s.ink, scale }),
      align: "center", valign: "middle",
    });
    let y = 4.35;
    if (data.body) {
      const bScale = fitScale(data.body, w * 0.72, 1.2, theme.type.body, { min: 0.75 });
      slide.addText(data.body, {
        x: (CANVAS.w - w * 0.72) / 2, y, w: w * 0.72, h: 1.2,
        ...textStyle(theme, "body", { color: s.muted, scale: bScale }),
        align: "center", valign: "top",
      });
      y += 1.4;
    }
    if (data.cta) {
      const ctaW = Math.min(3.4, measure(data.cta, theme.type.subhead) + 1.3);
      const cx = (CANVAS.w - ctaW) / 2;
      const cy = Math.max(y + 0.35, 5.75);
      slide.addShape("roundRect", {
        x: cx, y: cy, w: ctaW, h: 0.6,
        fill: { color: hex(s.accent ?? theme.palette.accent) },
        line: { type: "none" },
        rectRadius: theme.shape?.radius?.pill ?? 0.3,
      });
      slide.addText(data.cta, {
        x: cx, y: cy, w: ctaW, h: 0.6,
        ...textStyle(theme, "subhead", { color: theme.palette.on_accent }),
        align: "center", valign: "middle",
      });
    }
  },

  /**
   * Ordered steps with a number circle to the left of each item. Sequence is
   * the whole point, so the circles carry the accent and the text shares one
   * horizontal fit to keep sibling rows uniform.
   */
  "numbered-list"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.items.length;
    const rowH = (box.bottom - y - 0.1) / n;
    const cw = 0.5;
    const tw = box.w - cw - 0.35;
    const scale = fitScaleAll(data.items, tw, rowH * 0.85, theme.type.body);
    data.items.forEach((it, i) => {
      const ry = y + i * rowH;
      const cy = ry + rowH / 2;
      slide.addShape("ellipse", {
        x: box.x, y: cy - 0.25, w: cw, h: 0.5,
        fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
      });
      slide.addText(String(i + 1), {
        x: box.x, y: cy - 0.25, w: cw, h: 0.5,
        ...textStyle(theme, "eyebrow", { color: theme.palette.on_accent }),
        align: "center", valign: "middle",
      });
      slide.addText(it, {
        x: box.x + cw + 0.35, y: ry, w: tw, h: rowH,
        ...textStyle(theme, "body", { scale }),
        valign: "middle",
      });
    });
  },

  /**
   * Requirement/verification list: each row is a checkbox square — accent-filled
   * with a tick when checked, outlined when not — and the item text. Checked
   * rows read as done (full ink), unchecked as pending (muted).
   */
  checklist(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.items.length;
    const rowH = (box.bottom - y - 0.1) / n;
    const cw = 0.45;
    const tw = box.w - cw - 0.35;
    // The text box is the full row (valign middle); a 15% tighter budget was
    // pure over-reservation once the fitter measured in real inches.
    const scale = fitScaleAll(data.items.map((i) => i.text), tw, rowH, theme.type.body);
    data.items.forEach((it, i) => {
      const ry = y + i * rowH;
      const cy = ry + rowH / 2;
      const s = 0.34;
      slide.addShape("roundRect", {
        x: box.x, y: cy - s / 2, w: s, h: s,
        fill: { color: hex(it.checked ? theme.palette.accent : theme.palette.surface) },
        line: it.checked ? { type: "none" } : { color: hex(theme.palette.rule), width: 1.5 },
        rectRadius: 0.06,
      });
      if (it.checked) {
        slide.addText("✓", {
          x: box.x, y: cy - s / 2, w: s, h: s,
          ...textStyle(theme, "body", { color: theme.palette.on_accent, scale: 0.8 }),
          align: "center", valign: "middle",
        });
      }
      slide.addText(it.text, {
        x: box.x + cw + 0.35, y: ry, w: tw, h: rowH,
        ...textStyle(theme, "body", { scale, color: it.checked ? theme.palette.ink : theme.palette.ink_muted }),
        valign: "middle",
      });
    });
  },

  /**
   * A grid of capability cards: icon, bold title, muted body. Column count is
   * ceil(sqrt(n)) clamped to three, so 2..6 items form a near-square grid.
   */
  "feature-grid"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.items.length;
    const cols = Math.min(3, Math.max(2, Math.ceil(Math.sqrt(n))));
    const rows = Math.ceil(n / cols);
    const gut = theme.grid.gutter;
    const cw = (box.w - gut * (cols - 1)) / cols;
    const ch = (box.bottom - y - 0.1 - gut * (rows - 1)) / rows;
    const pad = theme.shape?.card_pad ?? 0.28;
    const titleScale = fitScaleAll(data.items.map((i) => i.title), cw - pad * 2, 0.4, theme.type.subhead, { min: 0.6 });
    const bodyScale = fitScaleAll(
      data.items.map((i) => i.body).filter(Boolean), cw - pad * 2, ch - 1.25, theme.type.body,
    );
    data.items.forEach((it, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = box.x + c * (cw + gut);
      const ry = y + r * (ch + gut);
      card(slide, theme, { x, y: ry, w: cw, h: ch });
      let ty = ry + pad;
      if (it.icon) {
        slide.addText(it.icon, {
          x: x + pad, y: ty, w: cw - pad * 2, h: 0.42,
          fontSize: Math.round(theme.type.heading.size * 0.85),
          align: "left", valign: "top",
        });
        ty += 0.48;
      }
      slide.addText(it.title, {
        x: x + pad, y: ty, w: cw - pad * 2, h: 0.4,
        ...textStyle(theme, "subhead", { bold: true, scale: titleScale }),
        valign: "top",
      });
      ty += 0.44;
      if (it.body) {
        slide.addText(it.body, {
          x: x + pad, y: ty, w: cw - pad * 2, h: ch - (ty - ry) - pad,
          ...textStyle(theme, "body", { scale: bodyScale, color: theme.palette.ink_muted }),
          valign: "top",
        });
      }
    });
  },

  /**
   * Dense label/value pairs in a three- or four-column grid. The label is the
   * eyebrow, the value is bold subhead; a divider sits under the heading.
   */
  "grid-items"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    slide.addShape("rect", {
      x: box.x, y: y - 0.12, w: box.w, h: 0.03,
      fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
    });
    const n = data.items.length;
    const cols = n >= 8 ? 4 : 3;
    const rows = Math.ceil(n / cols);
    const gut = theme.grid.gutter;
    const cw = (box.w - gut * (cols - 1)) / cols;
    const ch = (box.bottom - y - 0.1 - gut * (rows - 1)) / rows;
    const valueScale = fitScaleAll(data.items.map((i) => i.value), cw, ch * 0.5, theme.type.subhead, { min: 0.6 });
    data.items.forEach((it, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = box.x + c * (cw + gut);
      const ry = y + r * (ch + gut);
      slide.addText(it.label, {
        x, y: ry, w: cw, h: ch * 0.42,
        ...textStyle(theme, "eyebrow", { color: theme.palette.accent }),
        valign: "top",
      });
      slide.addText(it.value, {
        x, y: ry + ch * 0.45, w: cw, h: ch * 0.5,
        ...textStyle(theme, "subhead", { bold: true, scale: valueScale }),
        valign: "top",
      });
    });
  },

  /**
   * Items with a large icon/character prefix and the text to the right — more
   * visual than numbered-list, so the prefixes sit larger and without circles.
   */
  "icon-list"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.items.length;
    const rowH = (box.bottom - y - 0.1) / n;
    const iw = 0.7;
    const tw = box.w - iw - 0.3;
    const scale = fitScaleAll(data.items.map((i) => i.text), tw, rowH * 0.85, theme.type.body);
    data.items.forEach((it, i) => {
      const ry = y + i * rowH;
      slide.addText(it.icon ?? "•", {
        x: box.x, y: ry, w: iw, h: rowH,
        fontSize: Math.round(theme.type.heading.size * 0.9),
        align: "left", valign: "middle",
      });
      slide.addText(it.text, {
        x: box.x + iw + 0.3, y: ry, w: tw, h: rowH,
        ...textStyle(theme, "body", { scale }),
        valign: "middle",
      });
    });
  },

  /**
   * Left-to-right cards connected by a thin accent line: tag pill, bold title,
   * muted body. The connectors draw first so the cards overlap their ends.
   */
  "stacked-list"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.items.length;
    const gut = 0.32;
    const cw = (box.w - gut * (n - 1)) / n;
    const ch = Math.min(3.2, box.bottom - y - 0.2);
    const pad = theme.shape?.card_pad ?? 0.28;
    const titleScale = fitScaleAll(data.items.map((i) => i.title), cw - pad * 2, 0.4, theme.type.subhead, { min: 0.6 });
    const bodyScale = fitScaleAll(
      data.items.map((i) => i.body).filter(Boolean), cw - pad * 2, ch - 1.5, theme.type.body,
    );
    for (let i = 0; i < n - 1; i++) {
      slide.addShape("rect", {
        x: box.x + i * (cw + gut) + cw, y: y + ch / 2 - 0.02, w: gut, h: 0.04,
        fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
      });
    }
    data.items.forEach((it, i) => {
      const x = box.x + i * (cw + gut);
      card(slide, theme, { x, y, w: cw, h: ch });
      let ty = y + pad;
      if (it.tag) {
        const tw2 = Math.min(cw - pad * 2, measure(it.tag, theme.type.caption) + 0.42);
        slide.addShape("roundRect", {
          x: x + pad, y: ty, w: tw2, h: 0.32,
          fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
          rectRadius: theme.shape?.radius?.pill ?? 0.16,
        });
        slide.addText(it.tag, {
          x: x + pad, y: ty, w: tw2, h: 0.32,
          ...textStyle(theme, "caption", { color: theme.palette.on_accent, scale: 0.85 }),
          align: "center", valign: "middle",
        });
        ty += 0.42;
      }
      slide.addText(it.title, {
        x: x + pad, y: ty, w: cw - pad * 2, h: 0.4,
        ...textStyle(theme, "subhead", { bold: true, scale: titleScale }),
        valign: "top",
      });
      ty += 0.44;
      if (it.body) {
        slide.addText(it.body, {
          x: x + pad, y: ty, w: cw - pad * 2, h: ch - (ty - y) - pad,
          ...textStyle(theme, "body", { scale: bodyScale, color: theme.palette.ink_muted }),
          valign: "top",
        });
      }
    });
  },

  /**
   * Side-by-side KPI cards with a trend indicator: an accent triangle rotated
   * by direction, or a dash for flat, plus the change figure.
   */
  "kpi-dashboard"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.kpis.length;
    const gut = theme.grid.gutter;
    const cw = (box.w - gut * (n - 1)) / n;
    const ch = box.bottom - y - 0.1;
    const pad = theme.shape?.card_pad ?? 0.28;
    const valueScale = fitOneLine(
      data.kpis.map((k) => k.value).reduce((a, b) => (b.length > a.length ? b : a)),
      cw - pad * 2,
      theme.type.stat,
    );
    const labelH = linesBox(theme, "caption", data.kpis.map((k) => k.label), cw - pad * 2);
    const labelScale = fitScaleAll(data.kpis.map((k) => k.label), cw - pad * 2, labelH, theme.type.caption);
    data.kpis.forEach((k, i) => {
      const x = box.x + i * (cw + gut);
      card(slide, theme, { x, y, w: cw, h: ch });
      slide.addText(k.label, {
        x: x + pad, y: y + pad, w: cw - pad * 2, h: labelH,
        ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: labelScale }),
        valign: "top",
      });
      slide.addText(k.value, {
        x: x + pad, y: y + pad + labelH + 0.06, w: cw - pad * 2, h: 0.7,
        ...textStyle(theme, "stat", { color: theme.palette.accent, scale: valueScale }),
        valign: "top",
      });
      const ty = y + ch - 0.6;
      if (k.trend === "flat") {
        slide.addShape("rect", {
          x: x + pad, y: ty + 0.13, w: 0.26, h: 0.06,
          fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
        });
      } else {
        slide.addShape("triangle", {
          x: x + pad, y: ty, w: 0.22, h: 0.22,
          fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
          rotate: k.trend === "down" ? 180 : 0,
        });
      }
      if (k.change) {
        slide.addText(k.change, {
          x: x + pad + 0.34, y: ty, w: cw - pad * 2 - 0.34, h: 0.24,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted }),
          valign: "middle",
        });
      }
    });
  },

  /**
   * Cards carrying a hero value, a bold label and a body — stats with context.
   * The value stays on one line by shrinking; the body fits the card remainder.
   */
  "data-cards"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.cards.length;
    const gut = theme.grid.gutter;
    const cw = (box.w - gut * (n - 1)) / n;
    const ch = box.bottom - y - 0.1;
    const pad = theme.shape?.card_pad ?? 0.28;
    const valueScale = fitOneLine(
      data.cards.map((x) => x.value).reduce((a, b) => (b.length > a.length ? b : a)),
      cw - pad * 2,
      theme.type.stat,
    );
    // The label box holds the real lines of the longest label, so a wrapped
    // label never collides with the body below it.
    const labelH = linesBox(theme, "subhead", data.cards.map((c) => c.label), cw - pad * 2);
    const labelScale = fitScaleAll(data.cards.map((c) => c.label), cw - pad * 2, labelH, theme.type.subhead);
    const bodyTop = 0.9 + labelH + 0.04;
    const bodyScale = fitScaleAll(
      data.cards.map((c) => c.body).filter(Boolean), cw - pad * 2, ch - pad - bodyTop, theme.type.body,
    );
    data.cards.forEach((c, i) => {
      const x = box.x + i * (cw + gut);
      card(slide, theme, { x, y, w: cw, h: ch });
      // The stat's rendered line box is taller than the point size (large
      // ascenders/descenders), so the value reserves a full inch and the label
      // starts well clear of it — a tight 0.7in box let the % touch the label.
      slide.addText(c.value, {
        x: x + pad, y: y + pad, w: cw - pad * 2, h: 0.85,
        ...textStyle(theme, "stat", { color: theme.palette.accent, scale: valueScale }),
        valign: "top",
      });
      slide.addText(c.label, {
        x: x + pad, y: y + pad + 0.9, w: cw - pad * 2, h: labelH,
        ...textStyle(theme, "subhead", { bold: true, scale: labelScale }),
        valign: "top",
      });
      if (c.body) {
        slide.addText(c.body, {
          x: x + pad, y: y + pad + bodyTop, w: cw - pad * 2, h: ch - pad - bodyTop,
          ...textStyle(theme, "body", { scale: bodyScale, color: theme.palette.ink_muted }),
          valign: "top",
        });
      }
    });
  },

  /**
   * Completion bars: a track, an accent fill proportional to value, a target
   * marker, and the percentage. Pure shapes — no text-fitting risk.
   */
  "progress-bars"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.bars.length;
    const rowH = (box.bottom - y - 0.1) / n;
    const labelW = 2.2;
    const barX = box.x + labelW + 0.4;
    const barW = box.w - labelW - 0.4 - 1.3;
    const barH = 0.22;
    const labelScale = fitScaleAll(data.bars.map((b) => b.label), labelW, 0.4, theme.type.subhead, { min: 0.65 });
    data.bars.forEach((b, i) => {
      const ry = y + i * rowH;
      const cy = ry + rowH / 2;
      slide.addText(b.label, {
        x: box.x, y: ry, w: labelW, h: rowH,
        ...textStyle(theme, "subhead", { bold: true, scale: labelScale }),
        valign: "middle",
      });
      slide.addShape("roundRect", {
        x: barX, y: cy - barH / 2, w: barW, h: barH,
        fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
        rectRadius: barH / 2,
      });
      const fillW = Math.max(0.05, barW * (b.value / 100));
      slide.addShape("roundRect", {
        x: barX, y: cy - barH / 2, w: fillW, h: barH,
        fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
        rectRadius: barH / 2,
      });
      if (b.target != null) {
        slide.addShape("rect", {
          x: barX + barW * (b.target / 100) - 0.02, y: cy - 0.19, w: 0.04, h: 0.38,
          fill: { color: hex(theme.palette.ink) }, line: { type: "none" },
        });
      }
      slide.addText(`${Math.round(b.value)}%`, {
        x: barX + barW + 0.15, y: ry, w: 1.15, h: rowH,
        ...textStyle(theme, "eyebrow", { color: theme.palette.accent }),
        align: "right", valign: "middle",
      });
    });
  },

  /**
   * Top-N ranking: a rank pill (accent for the podium, rule otherwise), label
   * with optional detail, and a right-aligned value. Hairlines separate rows.
   */
  "ranking-list"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.items.length;
    const rowH = (box.bottom - y - 0.1 - 0.03 * (n - 1)) / n;
    const vw = 1.6;
    const tw = box.w - 0.55 - vw - 0.3;
    const labelScale = fitScaleAll(data.items.map((i) => i.label), tw, rowH * 0.55, theme.type.subhead, { min: 0.65 });
    const detailScale = fitScaleAll(
      data.items.map((i) => i.detail).filter(Boolean), tw, rowH * 0.4, theme.type.caption,
    );
    data.items.forEach((it, i) => {
      const ry = y + i * (rowH + 0.03);
      const cy = ry + rowH / 2;
      const rank = it.rank ?? i + 1;
      const top = rank <= 3;
      // Non-top rank chips are outlined surfaces, not rule fills: `rule` is a
      // hairline colour and can be a translucent white (isometric-dark) that
      // swallows the rank text. The text sits on surface with the rule as the
      // boundary, exactly like the layered-architecture chips.
      slide.addShape("ellipse", {
        x: box.x, y: cy - 0.19, w: 0.38, h: 0.38,
        fill: { color: hex(top ? theme.palette.accent : theme.palette.surface) },
        line: top ? { type: "none" } : { color: hex(theme.palette.rule), width: 1 },
      });
      slide.addText(String(rank), {
        x: box.x, y: cy - 0.19, w: 0.38, h: 0.38,
        ...textStyle(theme, "caption", { color: hex(top ? theme.palette.on_accent : theme.palette.ink_muted), bold: true }),
        align: "center", valign: "middle",
      });
      slide.addText(it.label, {
        x: box.x + 0.55, y: ry, w: tw, h: rowH * 0.55,
        ...textStyle(theme, "subhead", { bold: true, scale: labelScale }),
        valign: "top",
      });
      if (it.detail) {
        slide.addText(it.detail, {
          x: box.x + 0.55, y: ry + rowH * 0.55 + 0.02, w: tw, h: rowH * 0.4,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: detailScale }),
          valign: "top",
        });
      }
      if (it.value) {
        slide.addText(it.value, {
          x: box.x + 0.55 + tw, y: ry, w: vw, h: rowH,
          ...textStyle(theme, "subhead", { bold: true, scale: 0.95 }),
          align: "right", valign: "middle",
        });
      }
      if (i < n - 1) {
        slide.addShape("rect", {
          x: box.x, y: ry + rowH + 0.015, w: box.w, h: 0.015,
          fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
        });
      }
    });
  },

  /**
   * X vs Y with a delta pill between: two half-width stat blocks and the change
   * figure centred in an accent pill. A body paragraph sits below.
   */
  "metric-comparison"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const dW = 1.3;
    const halfW = (box.w - dW) / 2;
    const valScale = fitOneLine(
      [data.left.value, data.right.value].reduce((a, b) => (b.length > a.length ? b : a)),
      halfW,
      theme.type.stat,
    );
    const labelH = linesBox(theme, "subhead", [data.left.label, data.right.label], halfW);
    const labelScale = fitScaleAll([data.left.label, data.right.label], halfW, labelH, theme.type.subhead);
    const block = (side, x) => {
      slide.addText(side.value, {
        x, y: y + 0.1, w: halfW, h: 1.2,
        ...textStyle(theme, "stat", { color: theme.palette.accent, scale: valScale }),
        align: "center", valign: "middle",
      });
      slide.addText(side.label, {
        x, y: y + 1.35, w: halfW, h: labelH,
        ...textStyle(theme, "subhead", { bold: true, scale: labelScale }),
        align: "center", valign: "top",
      });
    };
    block(data.left, box.x);
    block(data.right, box.x + halfW + dW);
    const dx = box.x + halfW;
    slide.addShape("roundRect", {
      x: dx, y: y + 0.35, w: dW, h: 0.62,
      fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
      rectRadius: theme.shape?.radius?.pill ?? 0.3,
    });
    slide.addText(data.delta, {
      x: dx, y: y + 0.35, w: dW, h: 0.62,
      ...textStyle(theme, "subhead", { bold: true, color: theme.palette.on_accent }),
      align: "center", valign: "middle",
    });
    if (data.body) {
      const bodyY = y + 1.35 + labelH + 0.18;
      const bScale = fitScale(data.body, box.w, 0.9, theme.type.body, { min: 0.75 });
      slide.addText(data.body, {
        x: box.x, y: bodyY, w: box.w, h: 0.9,
        ...textStyle(theme, "body", { scale: bScale, color: theme.palette.ink_muted }),
        align: "center", valign: "top",
      });
    }
  },

  /**
   * Mini line charts on cards: a caption label, a bold value, and a small
   * axis-less accent line chart — the native chart API at a tiny size.
   */
  sparklines(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.items.length;
    const cols = Math.min(3, Math.max(2, Math.ceil(Math.sqrt(n))));
    const rows = Math.ceil(n / cols);
    const gut = theme.grid.gutter;
    const cw = (box.w - gut * (cols - 1)) / cols;
    const ch = (box.bottom - y - 0.1 - gut * (rows - 1)) / rows;
    const pad = theme.shape?.card_pad ?? 0.26;
    data.items.forEach((it, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = box.x + c * (cw + gut);
      const ry = y + r * (ch + gut);
      card(slide, theme, { x, y: ry, w: cw, h: ch });
      slide.addText(it.label, {
        x: x + pad, y: ry + pad, w: cw - pad * 2, h: 0.32,
        ...textStyle(theme, "caption", { color: theme.palette.ink_muted }),
        valign: "top",
      });
      if (it.value) {
        slide.addText(it.value, {
          x: x + pad, y: ry + pad, w: cw - pad * 2, h: 0.32,
          ...textStyle(theme, "subhead", { bold: true }),
          align: "right", valign: "top",
        });
      }
      const cw2 = cw - pad * 2;
      const chartH = Math.min(1.1, ch - pad * 2 - 0.45);
      slide.addChart("line", [{ name: it.label, labels: it.values.map((_, j) => String(j + 1)), values: it.values }], {
        x: x + pad, y: ry + pad + 0.42, w: cw2, h: chartH,
        chartColors: [hex(ensureContrast(theme.palette.accent, theme.palette.bg))],
        showLegend: false,
        showTitle: false,
        showValue: false,
        catAxisHidden: true,
        valAxisHidden: true,
        catGridLine: { style: "none" },
        valGridLine: { style: "none" },
        lineSmooth: true,
        lineSize: 2,
      });
    });
  },

  /**
   * Before/after: two state cards with a "Before"/"After" pill, a title, a body
   * and a central transition arrow. The After pill carries the accent, the
   * Before pill is muted — the direction of the change is the point.
   */
  "before-after"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const gut = theme.grid.gutter;
    const arrow = 0.8;
    const cw = (box.w - gut - arrow) / 2;
    const ch = box.bottom - y - 0.1;
    const pad = theme.shape?.card_pad ?? 0.28;
    // The two card titles used to be budgeted a flat 0.5in — one line of
    // heading type — so a title that wanted two lines was shrunk to the
    // readable floor instead, and a narrower frame put every theme there.
    // Sizing the box to the real line count gives them their lines.
    const titleW = cw - pad * 2;
    const titleH = linesBox(theme, "heading", [data.before.title, data.after.title], titleW);
    const titleScale = fitScaleAll([data.before.title, data.after.title], titleW, titleH, theme.type.heading, { min: 0.55 });
    const bodyScale = fitScaleAll([data.before.body, data.after.body], cw - pad * 2, 1.8, theme.type.body);
    const pill = (x, text, filled) => {
      const pw2 = Math.min(cw - pad * 2, measure(text, theme.type.eyebrow) + 0.5);
      // The unfilled pill is an outlined surface, not a rule fill — `rule` can
      // be a translucent white (isometric-dark) whose stripped fill swallows
      // the ink_muted label. The label sits on surface; rule is the boundary.
      slide.addShape("roundRect", {
        x, y: y + pad, w: pw2, h: 0.34,
        fill: { color: hex(filled ? theme.palette.accent : theme.palette.surface) },
        line: filled ? { type: "none" } : { color: hex(theme.palette.rule), width: 1 },
        rectRadius: theme.shape?.radius?.pill ?? 0.17,
      });
      slide.addText(applyTransform(theme, "eyebrow", text), {
        x, y: y + pad, w: pw2, h: 0.34,
        ...textStyle(theme, "eyebrow", {
          color: hex(filled ? theme.palette.on_accent : theme.palette.ink_muted),
        }),
        align: "center", valign: "middle",
      });
    };
    const col = (side, x, isAfter) => {
      card(slide, theme, { x, y, w: cw, h: ch });
      pill(x + pad, isAfter ? "After" : "Before", isAfter);
      let ty = y + pad + 0.5;
      slide.addText(side.title, {
        x: x + pad, y: ty, w: titleW, h: titleH,
        ...textStyle(theme, "heading", { scale: titleScale }),
        valign: "top",
      });
      ty += titleH + 0.1;
      slide.addText(side.body, {
        x: x + pad, y: ty, w: cw - pad * 2, h: ch - (ty - y) - pad,
        ...textStyle(theme, "body", { scale: bodyScale, color: theme.palette.ink_muted }),
        valign: "top",
      });
    };
    col(data.before, box.x, false);
    col(data.after, box.x + cw + gut + arrow, true);
    const ax = box.x + cw + gut / 2;
    slide.addShape("triangle", {
      x: ax + arrow / 2 - 0.15, y: y + ch / 2 - 0.15, w: 0.3, h: 0.3,
      fill: { color: hex(theme.palette.accent) }, line: { type: "none" }, rotate: 90,
    });
  },

  /**
   * A central concept with supporting elements arranged in a ring, connected by
   * hairlines. Positions come from angle and radius — pure geometry, nothing
   * content-derived.
   *
   * The ring must never hide text: element cards may not overlap the central
   * ellipse (their inner corner must clear it) and no two cards may overlap
   * each other. The ring radii are checked against both constraints at the
   * largest size the box allows; when the box cannot hold a non-overlapping
   * ring (too many elements, too little vertical room), the layout falls back
   * to a stacked concept + element grid, which cannot overlap by construction.
   */
  framework(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.elements.length;
    const top = Math.max(y, 3.0);
    const cx = box.x + box.w / 2;
    const cy = (top + box.bottom) / 2;
    const ew = 1.6, eh = 0.95;
    // The ellipse is sized so the concept title fits at the subhead floor: a
    // 2.3in-wide oval forced a mono title like "Hybrid Node Layout" down to
    // ~12.7pt and flagged the slide. 2.7in gives a 16-char title ~14pt.
    const exAxis = 1.35, eyAxis = 0.55;
    const gap = 0.09;

    // The largest ring that fits the box — growing the radii can only improve
    // both clearances (further from the ellipse, further apart), so the max is
    // the best candidate; if even it fails the box cannot hold a ring. The
    // vertical radius keeps ~0.3in of air between the ring cards and the
    // ellipse so the gap reads as clear separation, never a collision.
    const radX = Math.max(0.5, box.w / 2 - ew / 2 - 0.4);
    const radY = Math.max(0.5, (box.bottom - top) / 2 - eh / 2 - 0.15);
    const ringClear = (() => {
      if (radX <= ew / 2 || radY <= eh / 2) return false;
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n - Math.PI / 2;
        const dx = radX * Math.cos(a), dy = radY * Math.sin(a);
        // The card's corner nearest the ellipse centre must sit outside it.
        const ix = Math.max(0, Math.abs(dx) - ew / 2);
        const iy = Math.max(0, Math.abs(dy) - eh / 2);
        if ((ix / exAxis) ** 2 + (iy / eyAxis) ** 2 < 1.08) return false;
      }
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const ai = (2 * Math.PI * i) / n - Math.PI / 2;
          const aj = (2 * Math.PI * j) / n - Math.PI / 2;
          const dx = radX * (Math.cos(ai) - Math.cos(aj));
          const dy = radY * (Math.sin(ai) - Math.sin(aj));
          if (Math.abs(dx) < ew + gap && Math.abs(dy) < eh + gap) return false;
        }
      }
      return true;
    })();

    /**
     * The ring is a treatment for short labels, and it had no way to say so.
     * Its element bodies were drawn at a fixed 0.9 scale with no fit at all,
     * so a real 55-character body ran out of its 0.33in card and under the
     * ellipse — no floor was reported, because nothing asked the fitter.
     *
     * Asking here instead: if the concept title cannot sit on one line, or an
     * element body cannot sit inside its card, the grid fallback takes it. The
     * grid budgets every card to its content and is the honest composition for
     * anything longer than a label.
     */
    const contentFits = (() => {
      const cap = theme.type.caption, sub = theme.type.subhead;
      const capLine = (cap.size * (cap.line ?? 1.35)) / 72;
      const rows = Math.max(1, Math.floor((eh - 0.62) / capLine));
      if (data.elements.some((e) => e.body && lineCount(e.body, ew - 0.24, cap) > rows)) return false;
      if (data.concept.body && lineCount(data.concept.body, (exAxis - 0.15) * 2, cap) > 2) return false;
      // The concept title has one line inside the ellipse. Would fitting it
      // there push it under the readable floor?
      const need = measure(data.concept.title, sub) / ((exAxis - 0.1) * 2 * 0.88);
      const floor = floorOf(sub);
      return need <= 1 || floor == null || sub.size / need >= floor;
    })();

    if (ringClear && contentFits) {
      const conceptScale = fitOneLine(data.concept.title, exAxis * 2 - 0.3, theme.type.subhead, { min: 0.6 });
      slide.addShape("ellipse", {
        x: cx - exAxis, y: cy - eyAxis, w: exAxis * 2, h: eyAxis * 2,
        fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
      });
      slide.addText(data.concept.title, {
        x: cx - (exAxis - 0.1), y: cy - 0.52, w: (exAxis - 0.1) * 2, h: 0.5,
        ...textStyle(theme, "subhead", { bold: true, color: theme.palette.on_accent, scale: conceptScale }),
        align: "center", valign: "middle",
      });
      if (data.concept.body) {
        slide.addText(data.concept.body, {
          x: cx - (exAxis - 0.15), y: cy - 0.02, w: (exAxis - 0.15) * 2, h: 0.45,
          ...textStyle(theme, "caption", { color: theme.palette.on_accent, scale: 0.9 }),
          align: "center", valign: "top",
        });
      }

      const titleScale = fitScaleAll(data.elements.map((e) => e.title), ew - 0.25, 0.35, theme.type.caption, { min: 0.6 });
      // The central ellipse's semi-axes — connectors must start at its EDGE, not
      // its centre, or a hairline runs straight through the concept title and
      // body (the real defect this fixes: the vertical line crossed "The ₹4.2/unit
      // arithmetic" on a live deck). Edge point = ray from centre at angle θ to
      // where it exits the ellipse.
      data.elements.forEach((e, i) => {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        const ex = cx + radX * Math.cos(angle);
        const ey = cy + radY * Math.sin(angle);
        const denom = Math.sqrt((Math.cos(angle) ** 2) / (exAxis ** 2) + (Math.sin(angle) ** 2) / (eyAxis ** 2)) || 1;
        const t = 1 / denom;
        const sx = cx + t * Math.cos(angle);
        const sy = cy + t * Math.sin(angle);
        const lx = Math.min(sx, ex), lw = Math.abs(ex - sx) || 0.02;
        const ly = Math.min(sy, ey), lh = Math.abs(ey - sy) || 0.02;
        slide.addShape("line", {
          x: lx, y: ly, w: lw, h: lh,
          line: { color: hex(theme.palette.rule), width: 1.2 },
          flipH: ex < sx, flipV: ey < sy,
        });
        card(slide, theme, { x: ex - ew / 2, y: ey - eh / 2, w: ew, h: eh });
        slide.addText(e.title, {
          x: ex - ew / 2 + 0.12, y: ey - eh / 2 + 0.12, w: ew - 0.24, h: 0.35,
          ...textStyle(theme, "caption", { bold: true, scale: titleScale }),
          align: "center", valign: "top",
        });
        if (e.body) {
          slide.addText(e.body, {
            x: ex - ew / 2 + 0.12, y: ey - eh / 2 + 0.5, w: ew - 0.24, h: eh - 0.62,
            ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: 0.9 }),
            align: "center", valign: "top",
          });
        }
      });
      return;
    }

    // Grid fallback — the concept as a full-width panel, elements as cards
    // beneath it. Nothing overlaps because every zone is stacked and sized to
    // the content box; connectors are dropped (a hairline across a grid reads
    // as clutter, not structure).
    const conceptH = 0.85;
    const gutter = 0.18;
    const colGap = 0.24;
    const perRow = n <= 2 ? n : n === 3 ? 3 : n <= 4 ? 2 : 3;
    const rows = Math.ceil(n / perRow);
    const availH = box.bottom - top - conceptH - gutter;
    const rowGap = 0.22;
    const cardH = Math.min(1.15, (availH - rowGap * (rows - 1)) / rows);
    const cardW = (box.w - colGap * (perRow - 1)) / perRow;
    const conceptScale = fitOneLine(data.concept.title, box.w - 0.6, theme.type.subhead, { min: 0.7 });
    const titleScale = fitScaleAll(data.elements.map((e) => e.title), cardW - 0.3, 0.35, theme.type.caption, { min: 0.6 });
    const bodyScale = fitScaleAll(data.elements.map((e) => e.body).filter(Boolean), cardW - 0.3, cardH - 0.45, theme.type.caption, { min: 0.65 });

    card(slide, theme, { x: box.x, y: top, w: box.w, h: conceptH });
    slide.addText(data.concept.title, {
      x: box.x + 0.3, y: top + 0.12, w: box.w - 0.6, h: 0.45,
      ...textStyle(theme, "subhead", { bold: true, scale: conceptScale }),
      align: "left", valign: "middle",
    });
    if (data.concept.body) {
      slide.addText(data.concept.body, {
        x: box.x + 0.3, y: top + 0.48, w: box.w - 0.6, h: conceptH - 0.6,
        ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: 0.9 }),
        align: "left", valign: "top",
      });
    }
    data.elements.forEach((e, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = box.x + col * (cardW + colGap);
      const yTop = top + conceptH + gutter + row * (cardH + rowGap);
      card(slide, theme, { x, y: yTop, w: cardW, h: cardH });
      slide.addText(e.title, {
        x: x + 0.15, y: yTop + 0.1, w: cardW - 0.3, h: 0.35,
        ...textStyle(theme, "caption", { bold: true, scale: titleScale }),
        align: "left", valign: "top",
      });
      if (e.body) {
        slide.addText(e.body, {
          x: x + 0.15, y: yTop + 0.48, w: cardW - 0.3, h: cardH - 0.58,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: bodyScale }),
          align: "left", valign: "top",
        });
      }
    });
  },

  /**
   * 2×2 quadrant matrix: axis hairlines split the content box into four, each
   * quadrant carries a title and optional body, and the axes' low/high ends and
   * labels are marked on the edges (the y-axis labels rotate 270°).
   */
  matrix(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const top = Math.max(y, 2.6);
    const cx = box.x + box.w / 2;
    const cy = (top + box.bottom) / 2;
    const halfW = box.w / 2 - 0.35;
    const halfH = (box.bottom - top) / 2 - 0.25;

    slide.addShape("rect", {
      x: box.x, y: cy - 0.015, w: box.w, h: 0.03,
      fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
    });
    slide.addShape("rect", {
      x: cx - 0.015, y: top, w: 0.03, h: box.bottom - top,
      fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
    });

    const spots = [
      { x: box.x, y: top },
      { x: cx, y: top },
      { x: box.x, y: cy },
      { x: cx, y: cy },
    ];
    const titleScale = fitScaleAll(data.quadrants.map((q) => q.title), halfW - 0.36, 0.4, theme.type.subhead, { min: 0.65 });
    const bodyScale = fitScaleAll(
      data.quadrants.map((q) => q.body).filter(Boolean), halfW - 0.36, halfH - 0.6, theme.type.caption,
    );
    spots.forEach((s, i) => {
      const q = data.quadrants[i] ?? {};
      if (q.title) {
        slide.addText(q.title, {
          x: s.x + 0.18, y: s.y + 0.12, w: halfW - 0.36, h: 0.4,
          ...textStyle(theme, "subhead", { bold: true, scale: titleScale }),
          valign: "top",
        });
      }
      if (q.body) {
        slide.addText(q.body, {
          x: s.x + 0.18, y: s.y + 0.5, w: halfW - 0.36, h: halfH - 0.6,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: bodyScale }),
          valign: "top",
        });
      }
    });

    const ax = data.axes ?? {};
    // X-axis low/high sit just above the horizontal axis — below the top
    // quadrants' content (which ends at cy - halfH + 0.1) and above the line.
    if (ax.x) {
      slide.addText(ax.x.low ?? "", {
        x: box.x, y: cy - 0.4, w: 2.0, h: 0.3,
        ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
        align: "left", valign: "middle",
      });
      slide.addText(ax.x.high ?? "", {
        x: box.x + box.w - 2.0, y: cy - 0.4, w: 2.0, h: 0.3,
        ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
        align: "right", valign: "middle",
      });
      slide.addText(ax.x.label ?? "", {
        x: box.x, y: box.bottom - 0.42, w: box.w, h: 0.3,
        ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
        align: "center", valign: "middle",
      });
    }
    // Y-axis low/high read vertically beside the axis. The boxes are small and
    // placed left of the quadrant text column so their rotated footprints stay
    // clear of the quadrant titles and the footer presenter. A rotated box
    // wraps within its LOGICAL width before rotation, and the eyebrow token
    // may uppercase its text — measure the TRANSFORMED string or a label like
    // "Impact" wraps as "Imp/act". Boxes are sized to that width and keep
    // their right edge at the same line as before.
    if (ax.y) {
      const highT = applyTransform(theme, "eyebrow", ax.y.high ?? "");
      const lowT = applyTransform(theme, "eyebrow", ax.y.low ?? "");
      const axisName = applyTransform(theme, "eyebrow", ax.y.label ?? "");
      const highW = Math.min(1.8, Math.max(1.2, measure(highT, theme.type.eyebrow) * 1.1));
      const lowW = Math.min(1.8, Math.max(1.2, measure(lowT, theme.type.eyebrow) * 1.1));
      const nameW = Math.min(1.8, Math.max(0.9, measure(axisName, theme.type.eyebrow) * 1.1));
      const right = box.x + 0.45;
      slide.addText(highT, {
        x: right - highW, y: top + 0.05, w: highW, h: 0.3,
        ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
        align: "right", valign: "middle", rotate: 270,
      });
      slide.addText(lowT, {
        x: right - lowW, y: box.bottom - 0.38, w: lowW, h: 0.3,
        ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
        align: "right", valign: "middle", rotate: 270,
      });
      // The y-axis name reads vertically too. Its box is sized to the text's
      // measured width so the string never wraps in the narrow gutter, and the
      // centre is pinned left of the quadrant column so the rotated footprint
      // (which equals the box's long dimension) stays clear of it.
      slide.addText(axisName, {
        x: right - nameW, y: cy - 0.15, w: nameW, h: 0.3,
        ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
        align: "center", valign: "middle", rotate: 270,
      });
    }
  },

  /**
   * Criteria × options grid with a proportional bar per cell and a weighted
   * total row. Cell bars scale against the highest score in the table; totals
   * multiply each score by its criterion's percentage weight.
   */
  scorecard(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const options = data.options;
    const criteria = data.criteria;
    const nCrit = criteria.length;
    const gut = 0.14;
    const headH = 0.5;
    const labelW = 2.5;
    const totalH = 0.55;
    const rowH = (box.bottom - y - headH - totalH - 0.15 - gut * (nCrit + 1)) / nCrit;
    const colW = (box.w - labelW - gut * (options.length - 1)) / options.length;

    options.forEach((o, i) => {
      const x = box.x + labelW + i * (colW + gut);
      slide.addText(o.name, {
        x, y, w: colW, h: headH,
        ...textStyle(theme, "subhead", { bold: true, scale: 0.85 }),
        align: "center", valign: "middle",
      });
    });

    const allScores = options.flatMap((o) => o.scores ?? []);
    const maxScore = Math.max(1, ...allScores);
    criteria.forEach((c, r) => {
      const ry = y + headH + r * (rowH + gut);
      slide.addText(c.label, {
        x: box.x, y: ry, w: labelW, h: rowH,
        ...textStyle(theme, "caption", { scale: 0.95 }),
        valign: "middle",
      });
      options.forEach((o, i) => {
        const x = box.x + labelW + i * (colW + gut);
        const score = o.scores?.[r];
        if (score == null) return;
        const trackW = colW * 0.46;
        const barW = Math.max(0.03, trackW * (score / maxScore));
        const trackY = ry + rowH - 0.2;
        slide.addShape("roundRect", {
          x: x + (colW - trackW) / 2, y: trackY, w: trackW, h: 0.11,
          fill: { color: hex(theme.palette.rule) }, line: { type: "none" }, rectRadius: 0.055,
        });
        slide.addShape("roundRect", {
          x: x + (colW - trackW) / 2, y: trackY, w: barW, h: 0.11,
          fill: { color: hex(theme.palette.accent) }, line: { type: "none" }, rectRadius: 0.055,
        });
        slide.addText(String(score), {
          x, y: ry, w: colW, h: rowH - 0.24,
          ...textStyle(theme, "caption", { bold: true }),
          align: "center", valign: "middle",
        });
      });
    });

    const ty = y + headH + nCrit * (rowH + gut);
    slide.addShape("rect", {
      x: box.x, y: ty - 0.08, w: box.w, h: 0.02,
      fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
    });
    slide.addText("Total", {
      x: box.x, y: ty, w: labelW, h: totalH,
      ...textStyle(theme, "caption", { bold: true }),
      valign: "middle",
    });
    options.forEach((o, i) => {
      const x = box.x + labelW + i * (colW + gut);
      const total = (criteria.reduce((acc, c, r) => {
        const weight = parseFloat(String(c.weight ?? "1").replace("%", "")) || 0;
        return acc + (o.scores?.[r] ?? 0) * weight;
      }, 0));
      slide.addText(String(Math.round(total * 10) / 10), {
        x, y: ty, w: colW, h: totalH,
        ...textStyle(theme, "caption", { bold: true, color: theme.palette.accent }),
        align: "center", valign: "middle",
      });
    });
  },

  /**
   * Head-to-head: two centred titles with a "VS" pill between them and optional
   * bodies below. Maximum contrast, minimum structure.
   */
  vs(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const pillW = 1.0;
    const halfW = (box.w - pillW) / 2;
    const longest = [data.left.title, data.right.title].reduce((a, b) => (b.length > a.length ? b : a));
    const titleScale = fitOneLine(longest, halfW, theme.type.heading);
    const block = (side, body, x) => {
      slide.addText(side.title, {
        x, y: y + 0.25, w: halfW, h: 1.3,
        ...textStyle(theme, "heading", { scale: titleScale }),
        align: "center", valign: "middle",
      });
      if (body) {
        const bScale = fitScale(body, halfW - 0.4, 1.4, theme.type.body, { min: 0.75 });
        slide.addText(body, {
          x: x + 0.2, y: y + 1.75, w: halfW - 0.4, h: 1.4,
          ...textStyle(theme, "body", { scale: bScale, color: theme.palette.ink_muted }),
          align: "center", valign: "top",
        });
      }
    };
    block(data.left, data.left_body, box.x);
    block(data.right, data.right_body, box.x + halfW + pillW);
    const px = box.x + halfW;
    slide.addShape("ellipse", {
      x: px, y: y + 0.5, w: pillW, h: pillW,
      fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
    });
    slide.addText("VS", {
      x: px, y: y + 0.5, w: pillW, h: pillW,
      ...textStyle(theme, "subhead", { bold: true, color: theme.palette.on_accent }),
      align: "center", valign: "middle",
    });
  },

  /**
   * Two equal image panels: a cover-fit image at the top of each card, then a
   * title and a body. A missing image renders a rule-coloured placeholder so
   * the geometry never collapses.
   */
  "side-by-side"(slide, ctx) {
    const { theme, data, box, resolveAsset } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const gut = theme.grid.gutter;
    const cw = (box.w - gut) / 2;
    const ch = box.bottom - y - 0.1;
    const pad = theme.shape?.card_pad ?? 0.28;
    const imgH = 2.0;
    const titleScale = fitScaleAll(
      [data.left.title, data.right.title].filter(Boolean), cw - pad * 2, 0.4, theme.type.subhead, { min: 0.65 },
    );
    const bodyScale = fitScaleAll(
      [data.left.body, data.right.body].filter(Boolean), cw - pad * 2, 1.1, theme.type.body,
    );
    const col = (side, x) => {
      card(slide, theme, { x, y, w: cw, h: ch });
      const src = resolveAsset(side.image);
      if (src) {
        slide.addImage({
          path: src, x: x + pad, y: y + pad, w: cw - pad * 2, h: imgH,
          sizing: { type: "cover", w: cw - pad * 2, h: imgH },
        });
      } else {
        slide.addShape("roundRect", {
          x: x + pad, y: y + pad, w: cw - pad * 2, h: imgH,
          fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
          rectRadius: theme.shape?.radius?.card ?? 0.12,
        });
      }
      let ty = y + pad + imgH + 0.18;
      if (side.title) {
        slide.addText(side.title, {
          x: x + pad, y: ty, w: cw - pad * 2, h: 0.4,
          ...textStyle(theme, "subhead", { bold: true, scale: titleScale }),
          valign: "top",
        });
        ty += 0.44;
      }
      if (side.body) {
        slide.addText(side.body, {
          x: x + pad, y: ty, w: cw - pad * 2, h: ch - (ty - y) - pad,
          ...textStyle(theme, "body", { scale: bodyScale, color: theme.palette.ink_muted }),
          valign: "top",
        });
      }
    };
    col(data.left, box.x);
    col(data.right, box.x + cw + gut);
  },

  /**
   * A cyclic process: steps on an elliptical ring around an accent centre. Each
   * step carries a number node, a title and a body; small triangles between
   * consecutive steps point along the ring to show the direction of travel.
   */
  cycle(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.steps.length;
    // The ring used to be forced to `top = max(y, 3.0)`, which sat it in the
    // lower ~60% of the slide with a big dead zone between the heading and the
    // top node. Starting just below the heading and letting radiusY take the
    // full remaining vertical run centres the loop in the actual space.
    const top = y + 0.25;
    const cx = box.x + box.w / 2;
    const cy = (top + box.bottom) / 2;
    const radiusX = box.w / 2 - 1.65;
    // Each step's content spans ey-0.55 (number node) to ey+0.61 (body). The
    // ring must keep the top step's content clear of the centre circle's top
    // edge AND the bottom step's clear of the circle's bottom and the footer —
    // the vertical run is tight, so the ring sits as low as that allows.
    const radiusY = Math.max(1.15, Math.min((box.bottom - cy) - 0.62, cy - top + 0.5));

    const centreW = 1.5;
    slide.addShape("ellipse", {
      x: cx - centreW / 2, y: cy - centreW / 2, w: centreW, h: centreW,
      fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
    });
    const label = data.label ?? `${n} steps`;
    const labelScale = fitOneLine(label, centreW - 0.25, theme.type.subhead, { min: 0.45 });
    slide.addText(label, {
      x: cx - centreW / 2, y: cy - centreW / 2, w: centreW, h: centreW,
      ...textStyle(theme, "subhead", { bold: true, color: theme.palette.on_accent, scale: labelScale }),
      align: "center", valign: "middle",
    });

    const ew = 1.5, eh = 0.9;
    const titleScale = fitScaleAll(data.steps.map((s) => s.title), ew - 0.2, 0.35, theme.type.caption, { min: 0.6 });
    const bodyScale = fitScaleAll(
      data.steps.map((s) => s.body).filter(Boolean), ew - 0.2, 0.45, theme.type.caption,
    );
    const centres = data.steps.map((s, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      return { angle, ex: cx + radiusX * Math.cos(angle), ey: cy + radiusY * Math.sin(angle) };
    });
    centres.forEach((c, i) => {
      slide.addShape("ellipse", {
        x: c.ex - 0.21, y: c.ey - 0.55, w: 0.42, h: 0.42,
        fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
      });
      slide.addText(String(i + 1), {
        x: c.ex - 0.21, y: c.ey - 0.55, w: 0.42, h: 0.42,
        ...textStyle(theme, "caption", { color: theme.palette.on_accent, bold: true }),
        align: "center", valign: "middle",
      });
      slide.addText(data.steps[i].title, {
        x: c.ex - ew / 2, y: c.ey - 0.05, w: ew, h: 0.35,
        ...textStyle(theme, "caption", { bold: true, scale: titleScale }),
        align: "center", valign: "top",
      });
      if (data.steps[i].body) {
        slide.addText(data.steps[i].body, {
          x: c.ex - ew / 2, y: c.ey + 0.33, w: ew, h: 0.28,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: bodyScale }),
          align: "center", valign: "top",
        });
      }
      const next = centres[(i + 1) % n];
      const mx = (c.ex + next.ex) / 2;
      const my = (c.ey + next.ey) / 2;
      const ang = Math.atan2(next.ey - c.ey, next.ex - c.ex) * 180 / Math.PI;
      slide.addShape("triangle", {
        x: mx - 0.12, y: my - 0.12, w: 0.24, h: 0.24,
        fill: { color: hex(theme.palette.ink_muted) }, line: { type: "none" },
        rotate: ang + 90,
      });
    });
  },

  /**
   * A funnel: stages as roundRects narrowing linearly from full width to a
   * fraction, centred, with the value at the right of each stage.
   */
  funnel(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.stages.length;
    const stageH = (box.bottom - y - 0.1 - 0.22 * (n - 1)) / n;
    // The stack fills the space by construction; a short funnel (3-4 stages)
    // leaves a wide empty gap under its last bar, so the whole stack is shifted
    // down by half that gap — the same "centre the block" rule as the timeline
    // and pipeline, so a sparse funnel reads balanced rather than top-heavy.
    const stackH = n * stageH + (n - 1) * 0.22;
    const top = y + Math.max(0, (box.bottom - y - stackH) / 2);

    // A funnel's narrowing only exists when every stage carries a real number
    // (a "30%" or "1,200" the research supports). With any stage lacking one,
    // the taper would fake a conversion it cannot measure, so the stages render
    // as equal-width steps — the illustrative treatment, honest and still
    // designed. Values, when present, stay as right-aligned figures either way.
    const num = (v) => {
      if (v == null || v === "") return NaN;
      const f = parseFloat(String(v).replace(/[^\d.]/g, ""));
      return Number.isFinite(f) ? f : NaN;
    };
    const nums = data.stages.map((s) => num(s.value));
    const real = nums.every((x) => Number.isFinite(x));
    const maxN = real ? Math.max(...nums) : 1;
    const minN = real ? Math.min(...nums) : maxN;

    const width = (i) => {
      if (!real) return box.w * 0.78;
      if (maxN === minN) return box.w * 0.78;
      return box.w * (0.85 - 0.5 * ((maxN - nums[i]) / (maxN - minN)));
    };

    const labelScale = fitScaleAll(data.stages.map((s) => s.label), box.w * 0.78 - 1.6, 0.4, theme.type.subhead, { min: 0.5 });
    // A stage may carry a body — the schema allows one and the layout used to
    // drop it, so a model could write a line per stage and watch it vanish.
    const bodies = data.stages.map((s) => s.body).filter(Boolean);
    const bodyScale = bodies.length
      ? fitScaleAll(bodies, box.w * 0.78 - 1.6, 0.32, theme.type.caption)
      : 1;
    data.stages.forEach((st, i) => {
      const w = width(i);
      const x = box.x + (box.w - w) / 2;
      const sy = top + i * (stageH + 0.22);
      const accent = i % 2 === 0;
      slide.addShape("roundRect", {
        x, y: sy, w, h: stageH,
        fill: { color: hex(accent ? theme.palette.accent : theme.palette.surface) },
        line: { type: "none" },
        rectRadius: theme.shape?.radius?.card ?? 0.12,
      });
      const ink = accent ? theme.palette.on_accent : theme.palette.ink;
      if (st.body) {
        // Label and body stack as one block centred in the bar. The body takes
        // the bar's own ink rather than ink_muted, which is sized for the page
        // and not for an accent fill.
        const labH = 0.36, bodH = 0.3;
        const by = sy + (stageH - (labH + bodH)) / 2;
        slide.addText(st.label, {
          x: x + 0.2, y: by, w: w - 1.6, h: labH,
          ...textStyle(theme, "subhead", { bold: true, color: ink, scale: labelScale }),
          align: "center", valign: "bottom",
        });
        slide.addText(st.body, {
          x: x + 0.2, y: by + labH, w: w - 1.6, h: bodH,
          ...textStyle(theme, "caption", { color: ink, scale: bodyScale }),
          align: "center", valign: "top",
        });
      } else {
        slide.addText(st.label, {
          x: x + 0.2, y: sy, w: w - 1.6, h: stageH,
          ...textStyle(theme, "subhead", { bold: true, color: ink, scale: labelScale }),
          align: "center", valign: "middle",
        });
      }
      if (st.value) {
        slide.addText(st.value, {
          x: x + w - 1.4, y: sy, w: 1.2, h: stageH,
          ...textStyle(theme, "stat", { color: hex(ink), scale: 0.45 }),
          align: "right", valign: "middle",
        });
      }
    });
  },

  /**
   * A horizontal pipeline: stage cards sitting above a baseline, gate pills
   * below it, accent pipes connecting the stages and the vertical stubs that
   * tie each card to the line.
   */
  pipeline(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.stages.length;
    const cardH = 1.35;
    const gut = 0.34;
    const cw = (box.w - gut * (n - 1)) / n;
    // The whole cluster — cards, baseline, gate pills — used to start just
    // below the heading and left the bottom half of the slide empty. It is now
    // centred in the space between the heading and the footer, so a 4-stage
    // pipeline reads as a full slide rather than a top-hugging diagram.
    const clusterH = cardH + 0.55 + 0.03 + 0.5;
    const top = Math.max(y + 0.15, y + (box.bottom - y - clusterH) / 2);
    const lineY = top + cardH + 0.55;
    const titleScale = fitScaleAll(data.stages.map((s) => s.title), cw - 0.3, 0.4, theme.type.subhead, { min: 0.6 });
    const bodyScale = fitScaleAll(
      data.stages.map((s) => s.body).filter(Boolean), cw - 0.3, 0.55, theme.type.caption,
    );
    slide.addShape("rect", {
      x: box.x, y: lineY, w: box.w, h: 0.03,
      fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
    });
    data.stages.forEach((st, i) => {
      const x = box.x + i * (cw + gut);
      if (i > 0) {
        slide.addShape("rect", {
          x: x - gut, y: lineY - 0.02, w: gut, h: 0.04,
          fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
        });
      }
      slide.addShape("rect", {
        x: x + cw / 2 - 0.015, y: top + cardH, w: 0.03, h: lineY - top - cardH,
        fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
      });
      card(slide, theme, { x, y: top, w: cw, h: cardH });
      slide.addText(st.title, {
        x: x + 0.15, y: top + 0.15, w: cw - 0.3, h: 0.4,
        ...textStyle(theme, "subhead", { bold: true, scale: titleScale }),
        valign: "top",
      });
      if (st.body) {
        slide.addText(st.body, {
          x: x + 0.15, y: top + 0.58, w: cw - 0.3, h: 0.55,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: bodyScale }),
          valign: "top",
        });
      }
      if (st.gate) {
        const gW = Math.min(cw, measure(st.gate, theme.type.caption) + 0.4);
        slide.addShape("roundRect", {
          x: x + (cw - gW) / 2, y: lineY + 0.18, w: gW, h: 0.32,
          fill: { color: hex(theme.palette.ink) }, line: { type: "none" },
          rectRadius: theme.shape?.radius?.pill ?? 0.16,
        });
        slide.addText(st.gate, {
          x: x + (cw - gW) / 2, y: lineY + 0.18, w: gW, h: 0.32,
          ...textStyle(theme, "caption", { color: theme.palette.surface, scale: 0.85 }),
          align: "center", valign: "middle",
        });
      }
    });
  },

  /**
   * A dependency graph: nodes sorted into layers by dependency depth (a node's
   * layer is the longest path from any source to it), distributed horizontally
   * within each layer, with hairlines from each node to its dependencies.
   */
  dependencies(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const nodes = data.nodes;
    const n = nodes.length;
    const depth = Array(n).fill(0);
    // depends_on is a list of indices; propagate depth until it settles.
    for (let pass = 0; pass < n; pass++) {
      nodes.forEach((nd, i) => (nd.depends_on ?? []).forEach((d) => {
        if (d >= 0 && d < n && d !== i) depth[i] = Math.max(depth[i], depth[d] + 1);
      }));
    }
    const maxDepth = Math.max(0, ...depth);
    const layers = Array.from({ length: maxDepth + 1 }, () => []);
    nodes.forEach((nd, i) => layers[depth[i]].push(i));
    // Order nodes within each layer by the barycentre of their dependencies'
    // horizontal positions, so edges route with fewer crossings. The naive
    // insertion order lets long edges slash across unrelated nodes — the
    // observed defect was Enrichment's edge to Alerts crossing over Storage.
    const barycenter = (nodeIdx) => {
      const deps = (nodes[nodeIdx].depends_on ?? []).filter((d) => d >= 0 && d < n && d !== nodeIdx);
      if (!deps.length) return layers[depth[nodeIdx]].indexOf(nodeIdx);
      return deps.reduce((acc, d) => acc + layers[depth[d]].indexOf(d), 0) / deps.length;
    };
    for (let pass = 0; pass < 3; pass++) {
      for (const layer of layers) layer.sort((a, b) => barycenter(a) - barycenter(b));
    }
    const top = Math.max(y, 2.6);
    const layerH = (box.bottom - top) / (maxDepth + 1);
    // Nodes sized to the diagram, not to the schema minimum — the 2.4in boxes
    // left a narrow centred column with dead space on both sides for a small
    // graph. Wider, taller nodes make the diagram read as the slide's subject.
    const nodeW = Math.min(3.0, Math.max(2.4, (box.w - 0.35 * Math.max(0, ...layers.map((l) => l.length - 1))) / Math.max(...layers.map((l) => l.length))));
    const nodeH = 0.95;
    const titleScale = fitScaleAll(nodes.map((nd) => nd.title), nodeW - 0.2, 0.4, theme.type.caption, { min: 0.6 });
    const bodyScale = fitScaleAll(
      nodes.map((nd) => nd.body).filter(Boolean), nodeW - 0.2, 0.45, theme.type.caption,
    );
    const centres = nodes.map(() => ({ x: 0, y: 0 }));
    layers.forEach((layer, li) => {
      const lx = box.x + (box.w - (nodeW * layer.length + 0.35 * (layer.length - 1))) / 2;
      layer.forEach((nodeIdx, ni) => {
        const x = lx + ni * (nodeW + 0.35);
        const nodeY = top + li * layerH + (layerH - nodeH) / 2;
        centres[nodeIdx] = { x: x + nodeW / 2, y: nodeY + nodeH / 2 };
      });
    });
    // Edges are drawn BEFORE the nodes so a long dependency line passes under
    // an unrelated card rather than slicing across its face — the wires read
    // as routed behind the boxes, which is how a layered diagram is meant to
    // be read.
    nodes.forEach((nd, i) => (nd.depends_on ?? []).forEach((d) => {
      if (d >= 0 && d < n && d !== i) {
        const from = centres[d], to = centres[i];
        const x1 = from.x, y1 = from.y + nodeH / 2;
        const x2 = to.x, y2 = to.y - nodeH / 2;
        const lx = Math.min(x1, x2), lw = Math.abs(x2 - x1) || 0.02;
        const ly = Math.min(y1, y2), lh = Math.abs(y2 - y1) || 0.02;
        // Edges are the diagram's grammar — a rule-coloured hairline reads as
        // decoration, not as a dependency, so the accent marks the relationship.
        slide.addShape("line", {
          x: lx, y: ly, w: lw, h: lh,
          line: { color: hex(theme.palette.accent), width: 1.3 },
          flipH: x2 < x1, flipV: y2 < y1,
        });
      }
    }));
    layers.forEach((layer, li) => {
      layer.forEach((nodeIdx) => {
        const { x, y: nodeY } = { x: centres[nodeIdx].x - nodeW / 2, y: centres[nodeIdx].y - nodeH / 2 };
        card(slide, theme, { x, y: nodeY, w: nodeW, h: nodeH });
        slide.addText(nodes[nodeIdx].title, {
          x: x + 0.1, y: nodeY + 0.1, w: nodeW - 0.2, h: 0.4,
          ...textStyle(theme, "caption", { bold: true, scale: titleScale }),
          align: "center", valign: "top",
        });
        if (nodes[nodeIdx].body) {
          slide.addText(nodes[nodeIdx].body, {
            x: x + 0.1, y: nodeY + 0.5, w: nodeW - 0.2, h: 0.42,
            ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: bodyScale }),
            align: "center", valign: "top",
          });
        }
      });
    });
  },

  /**
   * An if/else flow: optional lead-in steps, an accent decision diamond, and
   * branches fanning out below — each with a label pill and its own steps.
   */
  "branching-flow"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const top = Math.max(y, 2.55);
    const decisionW = 1.4, decisionH = 0.95;
    const dx = box.x + box.w / 2 - decisionW / 2;
    const dy = top + 0.5;

    slide.addShape("diamond", {
      x: dx, y: dy, w: decisionW, h: decisionH,
      fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
    });
    const decisionScale = fitScale(data.decision ?? "Decision", decisionW - 0.4, decisionH - 0.4, theme.type.caption, { min: 0.5 });
    slide.addText(data.decision ?? "Decision", {
      x: dx, y: dy, w: decisionW, h: decisionH,
      ...textStyle(theme, "caption", { bold: true, color: theme.palette.on_accent, scale: decisionScale }),
      align: "center", valign: "middle",
    });

    const pre = data.steps ?? [];
    const stepW = 1.5, stepH = 0.7;
    pre.forEach((s, i) => {
      const x = box.x + box.w / 2 + (i - (pre.length - 1) / 2) * (stepW + 0.3) - stepW / 2;
      const sy = top - 0.15;
      card(slide, theme, { x, y: sy, w: stepW, h: stepH });
      slide.addText(s.title, {
        x: x + 0.1, y: sy + 0.1, w: stepW - 0.2, h: stepH - 0.2,
        ...textStyle(theme, "caption", { bold: true, scale: 0.95 }),
        align: "center", valign: "middle",
      });
      slide.addShape("line", {
        x: x + stepW / 2 - 0.015, y: sy + stepH, w: 0.03, h: dy - sy - stepH,
        line: { color: hex(theme.palette.rule), width: 1.1 },
      });
    });

    const branches = data.branches ?? [];
    const nb = branches.length;
    const branchTop = dy + decisionH + 0.25;
    branches.forEach((b, bi) => {
      const bx = box.x + box.w * (bi + 1) / (nb + 1) - stepW / 2;
      slide.addShape("line", {
        x: dx + decisionW / 2 - 0.015, y: dy + decisionH, w: 0.03, h: branchTop - dy - decisionH,
        line: { color: hex(theme.palette.rule), width: 1.1 },
      });
      slide.addShape("line", {
        x: dx + decisionW / 2 - 0.015, y: branchTop, w: bx + stepW / 2 - dx - decisionW / 2, h: 0.03,
        line: { color: hex(theme.palette.rule), width: 1.1 },
      });
      const lW = Math.min(1.3, measure(b.label, theme.type.caption) + 0.4);
      // Outlined surface, not a rule fill — `rule` can be a translucent white
      // (isometric-dark) that swallows the ink_muted branch label.
      slide.addShape("roundRect", {
        x: bx + (stepW - lW) / 2, y: branchTop + 0.05, w: lW, h: 0.3,
        fill: { color: hex(theme.palette.surface) }, line: { color: hex(theme.palette.rule), width: 1 },
        rectRadius: theme.shape?.radius?.pill ?? 0.15,
      });
      slide.addText(b.label, {
        x: bx + (stepW - lW) / 2, y: branchTop + 0.05, w: lW, h: 0.3,
        ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: 0.9 }),
        align: "center", valign: "middle",
      });
      (b.steps ?? []).forEach((s, si) => {
        const sy2 = branchTop + 0.45 + si * (stepH + 0.2);
        card(slide, theme, { x: bx, y: sy2, w: stepW, h: stepH });
        slide.addText(s.title, {
          x: bx + 0.1, y: sy2 + 0.1, w: stepW - 0.2, h: stepH - 0.2,
          ...textStyle(theme, "caption", { bold: true, scale: 0.95 }),
          align: "center", valign: "middle",
        });
      });
    });
  },

  /**
   * A stacked layer diagram: horizontal layer panels with an accent left border,
   * a label on the left, a centred body and item pills packed from the right.
   */
  "layered-architecture"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.layers.length;
    const gap = 0.09;
    const layerH = (box.bottom - y - 0.1 - gap * (n - 1)) / n;
    const labelScale = fitScaleAll(data.layers.map((l) => l.label), 3.2, 0.4, theme.type.subhead, { min: 0.65 });
    const bodyScale = fitScaleAll(
      data.layers.map((l) => l.body).filter(Boolean), 4.4, 0.35, theme.type.caption,
    );
    data.layers.forEach((l, i) => {
      const ly = y + i * (layerH + gap);
      slide.addShape("roundRect", {
        x: box.x, y: ly, w: box.w, h: layerH,
        fill: { color: hex(theme.palette.surface) }, line: { type: "none" },
        rectRadius: theme.shape?.radius?.card ?? 0.1,
      });
      slide.addShape("rect", {
        x: box.x, y: ly, w: 0.06, h: layerH,
        fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
      });
      slide.addText(l.label, {
        x: box.x + 0.24, y: ly, w: 3.2, h: layerH,
        ...textStyle(theme, "subhead", { bold: true, scale: labelScale }),
        valign: "middle",
      });
      if (l.body) {
        slide.addText(l.body, {
          x: box.x + 3.5, y: ly, w: 4.4, h: layerH,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: bodyScale }),
          valign: "middle",
        });
      }
      const items = l.items ?? [];
      let pillX = box.x + box.w - 0.18;
      for (let j = items.length - 1; j >= 0; j--) {
        const it = items[j];
        const w2 = Math.min(2.3, measure(it, theme.type.caption) + 0.4);
        pillX -= w2;
        // An OUTLINED chip, not a rule-filled one: `rule` is a hairline colour
        // and in some themes a translucent white (isometric-dark's #FFFFFF1C),
        // which renders as a solid near-white fill that swallows `ink` text.
        // The text sits on the row's surface and the rule is the boundary.
        slide.addShape("roundRect", {
          x: pillX, y: ly + (layerH - 0.3) / 2, w: w2, h: 0.3,
          fill: { color: hex(theme.palette.surface) }, line: { color: hex(theme.palette.rule), width: 1 },
          rectRadius: theme.shape?.radius?.pill ?? 0.15,
        });
        slide.addText(it, {
          x: pillX, y: ly + (layerH - 0.3) / 2, w: w2, h: 0.3,
          ...textStyle(theme, "caption", { color: theme.palette.ink, scale: 0.85 }),
          align: "center", valign: "middle",
        });
        pillX -= 0.12;
      }
    });
  },

  /**
   * A Now/Next/Later roadmap: time labels across the top, then one row per
   * phase — a label column and item cards distributed evenly along the row.
   */
  roadmap(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const phases = data.phases;
    const timeLabels = data.time_labels ?? [];
    const top = Math.max(y, 2.8);
    const labelW = 1.6;
    const rowH = (box.bottom - top - 0.05) / phases.length;
    const areaX = box.x + labelW + 0.35;
    const areaW = box.w - labelW - 0.35;

    if (timeLabels.length) {
      const tw = areaW / timeLabels.length;
      timeLabels.forEach((tl, i) => {
        slide.addText(tl, {
          x: areaX + i * tw, y: top - 0.34, w: tw, h: 0.3,
          ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
          align: "center", valign: "middle",
        });
      });
    }
    const titleScale = fitScaleAll(
      phases.flatMap((p) => p.items ?? []).map((it) => it.title), 3.2, 0.3, theme.type.caption, { min: 0.6 },
    );
    phases.forEach((p, pi) => {
      const ry = top + 0.05 + pi * rowH;
      const phaseScale = fitScale(p.label, labelW - 0.1, rowH - 0.15, theme.type.subhead, { min: 0.6 });
      slide.addText(p.label, {
        x: box.x, y: ry, w: labelW, h: rowH - 0.1,
        ...textStyle(theme, "subhead", { bold: true, scale: phaseScale }),
        valign: "middle",
      });
      const items = p.items ?? [];
      const itemW = Math.max(1.2, Math.min(3.4, areaW / items.length - 0.18));
      items.forEach((it, ii) => {
        const x = areaX + (ii + 0.5) * (areaW / items.length) - itemW / 2;
        card(slide, theme, { x, y: ry, w: itemW, h: rowH - 0.1 });
        slide.addText(it.title, {
          x: x + 0.1, y: ry + 0.07, w: itemW - 0.2, h: 0.3,
          ...textStyle(theme, "caption", { bold: true, scale: titleScale }),
          align: "center", valign: "top",
        });
        if (it.body) {
          slide.addText(it.body, {
            x: x + 0.1, y: ry + rowH * 0.5, w: itemW - 0.2, h: rowH * 0.42,
            ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: 0.88 }),
            align: "center", valign: "top",
          });
        }
      });
      if (pi < phases.length - 1) {
        slide.addShape("rect", {
          x: box.x, y: ry + rowH - 0.015, w: box.w, h: 0.015,
          fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
        });
      }
    });
  },

  /**
   * A journey map: stage labels above, the path below them, and the stage
   * bodies under that. The path is honest about what it draws:
   *
   *  - EVERY stage carries a numeric `value` → a REAL line, y scaled to the
   *    values across the band, each value captioned under its label, a thin
   *    reference rail at the middle. This is a measurement.
   *  - ANY stage lacks a value → an ILLUSTRATIVE flat rail: all nodes sit on a
   *    horizontal rail (no vertical position — a partial line would fake the
   *    stages it cannot measure). Sentiment, when present, colours the nodes
   *    categorically (a colour implies no magnitude); the rail never rises or
   *    falls. The design is a milestone rail, not a chart.
   */
  journey(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const stages = data.stages;
    const n = stages.length;
    const top = Math.max(y, 2.75);
    // Headroom above the line for the value captions when the path is real.
    const hasValues = stages.every((s) => typeof s.value === "number");
    const lineTop = top + (hasValues ? 0.85 : 0.4);
    const lineBot = box.bottom - 1.0;
    const mid = (lineTop + lineBot) / 2;
    const step = box.w / n;

    const yFor = (st) => {
      if (!hasValues) return mid;
      const vals = stages.map((s) => s.value);
      const vMin = Math.min(...vals), vMax = Math.max(...vals);
      const range = vMax - vMin || 1;
      return lineBot - ((st.value - vMin) / range) * (lineBot - lineTop);
    };
    const points = stages.map((st, i) => ({ x: box.x + step * i + step / 2, y: yFor(st) }));

    const labelScale = fitScaleAll(stages.map((s) => s.label), step - 0.2, 0.3, theme.type.eyebrow, { min: 0.6 });
    stages.forEach((st, i) => {
      slide.addText(st.label, {
        x: box.x + step * i + 0.1, y: top, w: step - 0.2, h: 0.3,
        ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted, scale: labelScale }),
        align: "center", valign: "top",
      });
    });

    if (hasValues) {
      // The measurement case: a reference rail at the middle and a true line
      // scaled to the stage values, with each value captioned under its label.
      slide.addShape("rect", {
        x: box.x, y: mid - 0.015, w: box.w, h: 0.03,
        fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
      });
      const valScale = fitScaleAll(
        stages.map((s) => String(s.value)), step - 0.2, 0.24, theme.type.caption, { min: 0.7 },
      );
      for (let i = 0; i < n - 1; i++) {
        const a = points[i], b = points[i + 1];
        const lx = Math.min(a.x, b.x), lw = Math.abs(b.x - a.x) || 0.02;
        const ly = Math.min(a.y, b.y), lh = Math.abs(b.y - a.y) || 0.02;
        slide.addShape("line", {
          x: lx, y: ly, w: lw, h: lh,
          line: { color: hex(theme.palette.accent), width: 2 },
          flipH: b.x < a.x, flipV: b.y < a.y,
        });
      }
      points.forEach((p, i) => {
        slide.addText(String(stages[i].value), {
          x: box.x + step * i + 0.1, y: top + 0.32, w: step - 0.2, h: 0.24,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: valScale }),
          align: "center", valign: "top",
        });
      });
    } else {
      // The illustrative case: a flat rail and nodes on it. Sentiment colours
      // the nodes categorically — a colour never encodes a magnitude.
      slide.addShape("rect", {
        x: box.x, y: mid - 0.02, w: box.w, h: 0.04,
        fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
      });
      for (let i = 0; i < n - 1; i++) {
        const a = points[i], b = points[i + 1];
        slide.addShape("line", {
          x: a.x, y: mid - 0.02, w: Math.max(0.02, b.x - a.x), h: 0.04,
          line: { color: hex(theme.palette.rule), width: 1.5 },
        });
      }
    }

    const bodyScale = fitScaleAll(
      stages.map((s) => s.body).filter(Boolean), step - 0.2, 0.8, theme.type.caption,
    );
    points.forEach((p, i) => {
      const fill = hasValues
        ? theme.palette.accent
        : stages[i].sentiment === "positive"
          ? theme.palette.accent
          : stages[i].sentiment === "negative"
            ? theme.palette.ink
            : theme.palette.ink_muted;
      slide.addShape("ellipse", {
        x: p.x - 0.11, y: p.y - 0.11, w: 0.22, h: 0.22,
        fill: { color: hex(fill) }, line: { type: "none" },
      });
      if (stages[i].body) {
        slide.addText(stages[i].body, {
          x: box.x + step * i + 0.1, y: lineBot + 0.16, w: step - 0.2, h: 0.8,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: bodyScale }),
          align: "center", valign: "top",
        });
      }
    });
  },

  /**
   * A dense chronological list: a fixed year column in accent eyebrow, a rule
   * between the columns, and the event text to the right.
   */
  chronology(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const yearW = 1.4;
    const rowH = (box.bottom - y - 0.1) / data.events.length;
    const textScale = fitScaleAll(
      data.events.map((e) => e.text), box.w - yearW - 0.55, rowH * 0.8, theme.type.body,
    );
    slide.addShape("rect", {
      x: box.x + yearW + 0.18, y, w: 0.02, h: box.bottom - y,
      fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
    });
    data.events.forEach((e, i) => {
      const ry = y + i * rowH;
      slide.addText(e.year, {
        x: box.x, y: ry, w: yearW, h: rowH,
        ...textStyle(theme, "eyebrow", { color: theme.palette.accent }),
        align: "left", valign: "middle",
      });
      slide.addText(e.text, {
        x: box.x + yearW + 0.4, y: ry, w: box.w - yearW - 0.4, h: rowH,
        ...textStyle(theme, "body", { scale: textScale }),
        valign: "middle",
      });
    });
  },

  /**
   * A quote with its speaker: the quote centred (or right-offset when a circular
   * photo sits on the left), with name and role beneath.
   */
  testimonial(slide, ctx) {
    const { theme, data, box, resolveAsset } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const img = data.image ? resolveAsset(data.image) : null;
    const hasImg = Boolean(img);
    const qx = hasImg ? box.x + 2.6 : box.x;
    const qw = hasImg ? box.w - 2.6 : box.w;
    const top = Math.max(y, 2.5);
    const quoteScale = fitScale(data.quote, qw, hasImg ? 2.0 : 2.6, theme.type.heading, { min: 0.55 });
    slide.addText(`“${data.quote}”`, {
      x: qx, y: top, w: qw, h: hasImg ? 2.0 : 2.6,
      ...textStyle(theme, "heading", { scale: quoteScale, italic: true }),
      align: hasImg ? "left" : "center", valign: "middle",
    });
    if (hasImg) {
      const imgSize = 1.8;
      slide.addImage({
        path: img, x: box.x + 0.1, y: top + 0.4, w: imgSize, h: imgSize,
        rounding: true, sizing: { type: "cover", w: imgSize, h: imgSize },
      });
    }
    if (data.name) {
      const ny = hasImg ? top + 2.15 : top + 2.75;
      slide.addText(data.name, {
        x: qx, y: ny, w: qw, h: 0.4,
        ...textStyle(theme, "subhead", { bold: true }),
        align: hasImg ? "left" : "center", valign: "middle",
      });
      if (data.role) {
        slide.addText(data.role, {
          x: qx, y: ny + 0.42, w: qw, h: 0.35,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted }),
          align: hasImg ? "left" : "center", valign: "middle",
        });
      }
    }
  },

  /**
   * An inline quote-lite within a content slide: an accent left bar, the quote
   * in italic heading, and an attribution below — quieter than the full-bleed
   * quote, so it can sit inside a sequence of standard slides.
   */
  "pull-quote"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const top = Math.max(y + 0.5, 3.1);
    slide.addShape("rect", {
      x: box.x, y: top, w: 0.08, h: 1.3,
      fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
    });
    const quoteScale = fitScale(data.quote, box.w - 0.55, 1.3, theme.type.heading, { min: 0.55 });
    slide.addText(`“${data.quote}”`, {
      x: box.x + 0.32, y: top, w: box.w - 0.32, h: 1.3,
      ...textStyle(theme, "heading", { scale: quoteScale, italic: true }),
      align: "left", valign: "middle",
    });
    if (data.attribution) {
      slide.addText(`— ${data.attribution}`, {
        x: box.x + 0.32, y: top + 1.45, w: box.w - 0.32, h: 0.4,
        ...textStyle(theme, "caption", { color: theme.palette.ink_muted }),
        align: "left", valign: "middle",
      });
    }
  },

  /**
   * A section-opening quote on the section surface — the epigraph as a hero.
   * Full-bleed: large centred italic quote, attribution and source beneath.
   */
  epigraph(slide, ctx) {
    const { theme, data } = ctx;
    const s = theme.surfaces.section;
    paint(slide, ctx, s.bg);
    const m = theme.grid.margin;
    const w = CANVAS.w - m.left - m.right;
    const quoteScale = fitScale(data.quote, w * 0.78, 3.0, theme.type.heading, { min: 0.55 });
    slide.addText(`“${data.quote}”`, {
      x: (CANVAS.w - w * 0.78) / 2, y: 1.7, w: w * 0.78, h: 3.0,
      ...textStyle(theme, "heading", { color: s.ink, scale: quoteScale, italic: true }),
      align: "center", valign: "middle",
    });
    if (data.attribution) {
      slide.addText(`— ${data.attribution}`, {
        x: m.left, y: 4.85, w, h: 0.4,
        ...textStyle(theme, "subhead", { color: s.muted }),
        align: "center", valign: "middle",
      });
    }
    if (data.source) {
      slide.addText(data.source, {
        x: m.left, y: 5.32, w, h: 0.35,
        ...textStyle(theme, "caption", { color: s.muted, italic: true }),
        align: "center", valign: "middle",
      });
    }
  },

  /**
   * A caution panel: amber top and left borders on a surface panel, an eyebrow
   * label and the body. The accent_alt token is the theme's warning colour
   * (amber in most themes), falling back to the accent.
   */
  warning(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const ph = 2.0;
    const py = Math.max(y, 3.0);
    const warn = theme.palette.accent_alt ?? theme.palette.accent;
    slide.addShape("roundRect", {
      x: box.x, y: py, w: box.w, h: ph,
      fill: { color: hex(theme.palette.surface) }, line: { type: "none" },
      rectRadius: theme.shape?.radius?.card ?? 0.12,
    });
    slide.addShape("rect", {
      x: box.x, y: py, w: box.w, h: 0.06,
      fill: { color: hex(warn) }, line: { type: "none" },
    });
    slide.addShape("rect", {
      x: box.x, y: py, w: 0.06, h: ph,
      fill: { color: hex(warn) }, line: { type: "none" },
    });
    const pad = 0.5;
    slide.addText(data.label ?? "⚠️", {
      x: box.x + pad, y: py + 0.3, w: box.w - pad * 2, h: 0.4,
      ...textStyle(theme, "eyebrow", { color: warn }),
      valign: "middle",
    });
    slide.addText(data.body, {
      x: box.x + pad, y: py + 0.78, w: box.w - pad * 2, h: ph - 0.9,
      ...textStyle(theme, "body", { scale: fitScale(data.body, box.w - pad * 2, ph - 0.9, theme.type.body) }),
      valign: "top",
    });
  },

  /** A best-practice panel: accent left border, subtle surface fill, label + body. */
  tip(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const ph = 1.9;
    const py = Math.max(y, 3.0);
    slide.addShape("roundRect", {
      x: box.x, y: py, w: box.w, h: ph,
      fill: { color: hex(theme.palette.surface) }, line: { type: "none" },
      rectRadius: theme.shape?.radius?.card ?? 0.12,
    });
    slide.addShape("rect", {
      x: box.x, y: py, w: 0.08, h: ph,
      fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
    });
    const pad = 0.5;
    slide.addText(data.label ?? "Tip", {
      x: box.x + pad, y: py + 0.32, w: box.w - pad * 2, h: 0.4,
      ...textStyle(theme, "eyebrow", { color: theme.palette.accent }),
      valign: "middle",
    });
    slide.addText(data.body, {
      x: box.x + pad, y: py + 0.8, w: box.w - pad * 2, h: ph - 0.95,
      ...textStyle(theme, "body", { scale: fitScale(data.body, box.w - pad * 2, ph - 0.95, theme.type.body) }),
      valign: "top",
    });
  },

  /**
   * A key-takeaway panel: an ink-filled bar with the body in surface text and
   * optional supporting points beneath — the strongest of the callout variants,
   * so it carries the inverted treatment.
   */
  takeaway(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const hasPoints = Array.isArray(data.points) && data.points.length > 0;
    // The panel must fit the body AND every point; the point rows are 0.36in
    // apart, so the panel grows with the count rather than overflowing.
    const ph = hasPoints ? 1.5 + 0.36 * data.points.length : 1.6;
    const py = Math.max(y, 2.7);
    slide.addShape("roundRect", {
      x: box.x, y: py, w: box.w, h: ph,
      fill: { color: hex(theme.palette.ink) }, line: { type: "none" },
      rectRadius: theme.shape?.radius?.card ?? 0.12,
    });
    const pad = 0.5;
    slide.addText(data.label ?? "Key takeaway", {
      x: box.x + pad, y: py + 0.26, w: box.w - pad * 2, h: 0.4,
      ...textStyle(theme, "eyebrow", { color: theme.palette.accent_alt ?? theme.palette.accent }),
      valign: "middle",
    });
    const bodyH = hasPoints ? 0.75 : ph - 0.85;
    slide.addText(data.body, {
      x: box.x + pad, y: py + 0.7, w: box.w - pad * 2, h: bodyH,
      ...textStyle(theme, "body", {
        color: theme.palette.surface,
        scale: fitScale(data.body, box.w - pad * 2, bodyH, theme.type.body),
      }),
      valign: "top",
    });
    if (hasPoints) {
      const pointScale = fitScaleAll(data.points, box.w - pad * 2 - 0.32, 0.32, theme.type.caption);
      data.points.forEach((p, i) => {
        const py2 = py + 1.5 + i * 0.36;
        slide.addText("•", {
          x: box.x + pad + 0.1, y: py2, w: 0.2, h: 0.32,
          ...textStyle(theme, "caption", { color: theme.palette.accent_alt ?? theme.palette.accent }),
          valign: "middle",
        });
        slide.addText(p, {
          x: box.x + pad + 0.32, y: py2, w: box.w - pad * 2 - 0.32, h: 0.32,
          ...textStyle(theme, "caption", { color: theme.palette.surface, scale: pointScale }),
          valign: "middle",
        });
      });
    }
  },

  /**
   * A grid of cover-fit images with captions: 1×2 for two, 2 columns for
   * three or four, 3 columns for five or six. A missing image renders a
   * rule-coloured placeholder so the grid never collapses.
   */
  "image-grid"(slide, ctx) {
    const { theme, data, box, resolveAsset } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.images.length;
    const cols = n <= 2 ? n : n <= 4 ? 2 : 3;
    const rows = Math.ceil(n / cols);
    const gut = theme.grid.gutter;
    const capH = 0.34;
    const cw = (box.w - gut * (cols - 1)) / cols;
    const ch = (box.bottom - y - 0.1 - gut * (rows - 1)) / rows;
    const imgH = ch - capH;
    const capScale = fitScaleAll(
      data.images.map((i) => i.caption).filter(Boolean), cw, capH - 0.04, theme.type.caption,
    );
    data.images.forEach((im, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = box.x + c * (cw + gut);
      const ry = y + r * (ch + gut);
      const src = resolveAsset(im.src);
      if (src) {
        slide.addImage({ path: src, x, y: ry, w: cw, h: imgH, sizing: { type: "cover", w: cw, h: imgH } });
      } else {
        slide.addShape("roundRect", {
          x, y: ry, w: cw, h: imgH,
          fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
          rectRadius: theme.shape?.radius?.card ?? 0.12,
        });
      }
      if (im.caption) {
        slide.addText(im.caption, {
          x, y: ry + imgH + 0.04, w: cw, h: capH,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, italic: true, scale: capScale }),
          align: "center", valign: "top",
        });
      }
    });
  },

  /**
   * A full-bleed image with a dark overlay on the bottom third carrying the
   * headline and subtitle. The overlay is a single semi-transparent ink rect —
   * pptxgenjs cannot express gradient fills natively, and the solid overlay is
   * what keeps the hero type native.
   */
  "hero-image"(slide, ctx) {
    const { theme, data, resolveAsset } = ctx;
    const src = resolveAsset(data.image);
    if (src) {
      slide.addImage({
        path: src, x: 0, y: 0, w: CANVAS.w, h: CANVAS.h,
        sizing: { type: "cover", w: CANVAS.w, h: CANVAS.h },
      });
    } else {
      paint(slide, ctx, theme.palette.ink);
    }
    const ovH = 2.6;
    slide.addShape("rect", {
      x: 0, y: CANVAS.h - ovH, w: CANVAS.w, h: ovH,
      fill: { color: hex(theme.palette.ink), transparency: 45 }, line: { type: "none" },
    });
    const m = theme.grid.margin;
    const w = CANVAS.w - m.left - m.right;
    const scale = fitScale(data.headline, w, 1.2, theme.type.display, { min: 0.6 });
    slide.addText(data.headline, {
      x: m.left, y: CANVAS.h - ovH + 0.4, w, h: 1.2,
      ...textStyle(theme, "display", { color: theme.palette.surface, scale }),
      valign: "top",
    });
    if (data.subtitle) {
      const sScale = fitScale(data.subtitle, w, 0.5, theme.type.subhead, { min: 0.75 });
      slide.addText(data.subtitle, {
        x: m.left, y: CANVAS.h - ovH + 1.62, w, h: 0.5,
        ...textStyle(theme, "subhead", { color: theme.palette.surface, scale: sScale }),
        valign: "top",
      });
    }
  },

  /**
   * Two images splitting the content area equally with optional captions — a
   * clean visual comparison, the split line being the images' shared edge.
   */
  "split-screen"(slide, ctx) {
    const { theme, data, box, resolveAsset } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const capH = data.left_caption || data.right_caption ? 0.34 : 0;
    const imgH = box.bottom - y - capH - 0.05;
    const halfW = box.w / 2;
    const img = (src, x, caption) => {
      const abs = resolveAsset(src);
      if (abs) {
        slide.addImage({
          path: abs, x, y, w: halfW, h: imgH,
          sizing: { type: "cover", w: halfW, h: imgH },
        });
      } else {
        slide.addShape("roundRect", {
          x, y, w: halfW, h: imgH,
          fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
          rectRadius: theme.shape?.radius?.card ?? 0.1,
        });
      }
      if (caption) {
        slide.addText(caption, {
          x, y: y + imgH + 0.04, w: halfW, h: 0.3,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, italic: true }),
          align: "center", valign: "top",
        });
      }
    };
    img(data.left, box.x, data.left_caption);
    img(data.right, box.x + halfW, data.right_caption);
  },

  /**
   * A rich data table: per-column headers with alignment, an optional leading
   * row-label column, and rows whose cells come from a single string or a
   * per-column array. Highlighted rows carry an accent left bar.
   */
  "data-table"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const cols = data.columns;
    const rows = data.rows;
    const rowLabels = data.row_labels ?? [];
    const hasLabels = rowLabels.length > 0;
    const cellOf = (label, { bold = false, color, fill, align = "left" }) => ({
      text: label,
      options: {
        bold,
        align,
        color: hex(color),
        fill: { color: hex(fill) },
        fontFace: theme.type.caption.family,
        fontSize: Math.max(9, theme.type.caption.size),
      },
    });
    const head = [
      ...(hasLabels ? [cellOf("", { bold: true, color: theme.palette.on_accent, fill: theme.palette.accent })] : []),
      ...cols.map((c) => cellOf(c.label, {
        bold: true, color: theme.palette.on_accent, fill: theme.palette.accent, align: c.align ?? "left",
      })),
    ];
    const body = rows.map((r, ri) => {
      const cells = Array.isArray(r.text) ? r.text : [r.text];
      const fillBase = ri % 2 ? theme.palette.bg : theme.palette.surface;
      return [
        ...(hasLabels ? [cellOf(rowLabels[ri] ?? "", { bold: true, color: theme.palette.ink, fill: fillBase })] : []),
        ...cols.map((c, ci) => cellOf(cells[ci] ?? "", {
          color: theme.palette.ink, fill: fillBase, align: c.align ?? "left",
        })),
      ];
    });
    slide.addTable([head, ...body], {
      x: box.x, y, w: box.w,
      border: { type: "solid", pt: 0.5, color: hex(theme.palette.rule) },
      rowH: Math.min(0.5, Math.max(0.32, (box.bottom - y - 0.1) / (rows.length + 1))),
      valign: "middle",
      margin: 0.08,
      autoPage: false,
    });
    // Accent left bar overlays highlighted rows.
    const rowH = Math.min(0.5, Math.max(0.32, (box.bottom - y - 0.1) / (rows.length + 1)));
    rows.forEach((r, ri) => {
      if (r.highlight) {
        slide.addShape("rect", {
          x: box.x, y: y + rowH + ri * rowH + 0.02, w: 0.06, h: rowH - 0.04,
          fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
        });
      }
    });
  },

  /**
   * A weighted decision matrix: criteria (with weights) as rows, options as
   * columns, the best score per row bolded in the accent, and a weighted total
   * row beneath.
   */
  "decision-matrix"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const criteria = data.criteria;
    const options = data.options;
    const nCrit = criteria.length;
    const totalH = 0.55;
    const rowH = (box.bottom - y - totalH - 0.1) / (nCrit + 1);
    const labelW = 3.0;
    const gut = theme.grid.gutter;
    const colW = (box.w - labelW - gut * (options.length - 1)) / options.length;
    const cellOpts = (text, { bold = false, color = theme.palette.ink, fill = null, align = "center" }) => ({
      text,
      options: {
        bold, align,
        color: hex(color),
        ...(fill ? { fill: { color: hex(fill) } } : {}),
        fontFace: theme.type.caption.family,
        fontSize: Math.max(9, theme.type.caption.size),
      },
    });
    const head = [
      cellOpts("", { align: "left" }),
      ...options.map((o) => cellOpts(o.name, { bold: true, color: theme.palette.on_accent, fill: theme.palette.accent })),
    ];
    const body = criteria.map((c, r) => {
      const best = Math.max(...options.map((o) => o.scores?.[r] ?? 0));
      const cells = [
        cellOpts(`${c.label} (w ${String(c.weight ?? "")})`, { bold: true, align: "left" }),
        ...options.map((o) => {
          const score = o.scores?.[r];
          const isBest = score != null && score === best;
          return cellOpts(score == null ? "–" : String(score), {
            bold: isBest, color: isBest ? theme.palette.accent : theme.palette.ink,
            fill: r % 2 ? theme.palette.bg : theme.palette.surface,
          });
        }),
      ];
      return cells;
    });
    const totals = options.map((o) => {
      const total = criteria.reduce((acc, c, r) => acc + (o.scores?.[r] ?? 0) * (c.weight ?? 0), 0);
      return Math.round(total * 10) / 10;
    });
    const bestTotal = Math.max(...totals);
    const table = [
      head,
      ...body,
      [
        cellOpts("Total", { bold: true, align: "left" }),
        ...options.map((o, i) => cellOpts(String(totals[i]), {
          // Only the winning total earns the accent — highlighting all of them
          // would defeat the purpose of pointing at the best choice.
          bold: totals[i] === bestTotal,
          color: totals[i] === bestTotal ? theme.palette.accent : theme.palette.ink,
        })),
      ],
    ];
    slide.addTable(table, {
      x: box.x, y, w: box.w,
      border: { type: "solid", pt: 0.5, color: hex(theme.palette.rule) },
      rowH: Math.min(0.5, Math.max(0.32, (box.bottom - y - 0.1) / (nCrit + 2))),
      valign: "middle",
      margin: 0.08,
      autoPage: false,
    });
  },

  /**
   * A general-purpose graph. Vertical and horizontal layouts topologically
   * layer the nodes by edge depth and distribute them within each layer; radial
   * puts the first node at the centre and the rest on a ring. Edges are drawn
   * as hairlines between node centres.
   */
  diagram(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const nodes = data.nodes;
    const n = nodes.length;
    const edges = data.edges ?? [];
    const idIdx = new Map(nodes.map((nd, i) => [nd.id, i]));
    const layout = data.layout ?? "vertical";
    const top = Math.max(y, 2.6);
    // Node size adapts to the graph: with many depth layers the vertical run is
    // thin, and a fixed 1.0in box would overlap the layer below it (the six-
    // node stacked diagram defect). Cap the height to the layer spacing and the
    // width to the widest layer, so boxes never overlap however dense the graph.
    const depth = Array(n).fill(0);
    for (let pass = 0; pass < n; pass++) {
      edges.forEach((e) => {
        const f = idIdx.get(e.from), t = idIdx.get(e.to);
        if (f != null && t != null && f !== t) depth[t] = Math.max(depth[t], depth[f] + 1);
      });
    }
    const maxDepth = Math.max(0, ...depth);
    const layers = Array.from({ length: maxDepth + 1 }, () => []);
    nodes.forEach((nd, i) => layers[depth[i]].push(i));
    // A chain graph in a vertical layout stacks every node at the same x with
    // ~0.7in per layer — too thin for a readable label. When the vertical run
    // cannot hold the layer count at a readable size, the graph lays out
    // horizontally (one column per layer) where the full width gives each node
    // room. The explicit `horizontal` request always wins.
    const vertical = layout !== "horizontal" && (box.bottom - top) / (maxDepth + 1) >= 0.85;
    const across = vertical ? box.bottom - top : box.w;
    const along = vertical ? box.w : box.bottom - top;
    const vSpacing = across / (maxDepth + 1);
    const hSpacing = along / Math.max(...layers.map((l) => l.length));
    // The two axes bound differently: nodeW must fit the horizontal spacing
    // between centres, nodeH the vertical one.
    const layerSpaceX = vertical ? hSpacing : vSpacing;
    const layerSpaceY = vertical ? vSpacing : hSpacing;
    const nodeW = Math.min(2.2, Math.max(1.4, layerSpaceX - 0.35));
    const nodeH = Math.max(0.5, Math.min(1.0, layerSpaceY - 0.2));
    // When the layers are too dense for a body line at the readable floor, the
    // nodes render label-only — the same deal the flow layout strikes for a
    // 6-step run. A 0.04in body zone would flag the floor and clip text.
    const dense = nodeH < 0.72;
    const titleScale = fitScaleAll(nodes.map((nd) => nd.label), nodeW - 0.2, 0.3, theme.type.caption, { min: 0.6 });
    const bodyScale = fitScaleAll(
      nodes.map((nd) => nd.body).filter(Boolean), nodeW - 0.2, nodeH - 0.5, theme.type.caption,
    );
    const node = (i, x, y2) => {
      card(slide, theme, { x: x - nodeW / 2, y: y2 - nodeH / 2, w: nodeW, h: nodeH });
      slide.addText(nodes[i].label, {
        x: x - nodeW / 2 + 0.1, y: y2 - nodeH / 2 + 0.06, w: nodeW - 0.2, h: 0.3,
        ...textStyle(theme, "caption", { bold: true, scale: titleScale }),
        align: "center", valign: "middle",
      });
      if (nodes[i].body && !dense) {
        // The body zone must hold two caption lines at the readable floor — a
        // 0.32in box was the "text clipped below the rounded rectangle" defect.
        slide.addText(nodes[i].body, {
          x: x - nodeW / 2 + 0.1, y: y2 - nodeH / 2 + 0.38, w: nodeW - 0.2, h: nodeH - 0.46,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: bodyScale }),
          align: "center", valign: "top",
        });
      }
    };
    const line = (ax, ay, bx, by) => {
      const lx = Math.min(ax, bx), lw = Math.abs(bx - ax) || 0.02;
      const ly = Math.min(ay, by), lh = Math.abs(by - ay) || 0.02;
      slide.addShape("line", {
        x: lx, y: ly, w: lw, h: lh,
        line: { color: hex(theme.palette.rule), width: 1.1 },
        flipH: bx < ax, flipV: by < ay,
      });
    };
    const centres = new Array(n);

    if (layout === "radial") {
      const cx = box.x + box.w / 2;
      const cy = (top + box.bottom) / 2;
      const radius = Math.max(1.2, Math.min(box.w / 2 - nodeW / 2 - 0.5, (box.bottom - top) / 2 - nodeH / 2 - 0.4));
      centres[0] = { x: cx, y: cy };
      nodes.slice(1).forEach((nd, i) => {
        const angle = (2 * Math.PI * i) / Math.max(1, n - 1) - Math.PI / 2;
        const idx = nodes.indexOf(nd);
        centres[idx] = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
      });
    } else {
      // Order each layer by the barycentre of incoming-edge neighbours'
      // horizontal positions, so long edges route with fewer crossings instead
      // of slashing across unrelated node boxes.
      const barycenter = (nodeIdx) => {
        const ins = edges
          .filter((e) => idIdx.get(e.to) === nodeIdx && idIdx.get(e.from) != null && idIdx.get(e.from) !== nodeIdx)
          .map((e) => idIdx.get(e.from));
        if (!ins.length) return layers[depth[nodeIdx]].indexOf(nodeIdx);
        return ins.reduce((acc, d) => acc + layers[depth[d]].indexOf(d), 0) / ins.length;
      };
      for (let pass = 0; pass < 3; pass++) {
        for (const layer of layers) layer.sort((a, b) => barycenter(a) - barycenter(b));
      }
      layers.forEach((layer, li) => {
        const per = along / layer.length;
        layer.forEach((nodeIdx, ni) => {
          const a = per * (ni + 0.5);
          const c = across * (li + 0.5) / (maxDepth + 1);
          centres[nodeIdx] = vertical
            ? { x: box.x + a, y: top + c }
            : { x: box.x + c, y: top + a };
        });
      });
    }
    // Edges first, nodes second: a connector passing behind a box reads as
    // routed, never as cutting through the label — the layered-graph lesson.
    // A node's edge must still start at the node's EDGE, not its centre, or
    // the line runs under (and through) the label text. The ray from the
    // centre is clipped to the first box side it crosses.
    const clipToBox = (p, q) => {
      const dx = q.x - p.x, dy = q.y - p.y;
      let t = 1;
      if (dx !== 0) t = Math.min(t, nodeW / 2 / Math.abs(dx));
      if (dy !== 0) t = Math.min(t, nodeH / 2 / Math.abs(dy));
      return { x: p.x + dx * t, y: p.y + dy * t };
    };
    edges.forEach((e) => {
      const f = idIdx.get(e.from), t = idIdx.get(e.to);
      if (f == null || t == null || f === t) return;
      const a = centres[f], b = centres[t];
      const s = clipToBox(a, b);
      const e2 = clipToBox(b, a);
      line(s.x, s.y, e2.x, e2.y);
    });
    centres.forEach((c, i) => node(i, c.x, c.y));
  },

  /**
   * A hierarchy pyramid: levels narrowing from a wide base to a narrow top,
   * alternating accent/surface fills, label centred in each level with a body
   * beneath it.
   */
  pyramid(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const levels = data.levels;
    const n = levels.length;
    const gap = 0.12;
    const levelH = (box.bottom - y - 0.1 - gap * (n - 1)) / n;
    const maxW = box.w;
    const minW = box.w * 0.4;
    const labelScale = fitScaleAll(levels.map((l) => l.label), maxW - 0.7, 0.4, theme.type.subhead, { min: 0.5 });
    const bodyScale = fitScaleAll(
      levels.map((l) => l.body).filter(Boolean), maxW - 0.7, 0.3, theme.type.caption,
    );
    levels.forEach((l, i) => {
      const w = maxW - (maxW - minW) * (i / (n - 1));
      const x = box.x + (box.w - w) / 2;
      const sy = y + i * (levelH + gap);
      const accent = i % 2 === 0;
      slide.addShape("roundRect", {
        x, y: sy, w, h: levelH,
        fill: { color: hex(accent ? theme.palette.accent : theme.palette.surface) },
        line: { type: "none" }, rectRadius: theme.shape?.radius?.card ?? 0.12,
      });
      const ink = accent ? theme.palette.on_accent : theme.palette.ink;
      slide.addText(l.label, {
        x: x + 0.35, y: sy, w: w - 0.7, h: levelH * 0.5,
        ...textStyle(theme, "subhead", { bold: true, color: ink, scale: labelScale }),
        align: "center", valign: "middle",
      });
      if (l.body) {
        slide.addText(l.body, {
          x: x + 0.35, y: sy + levelH * 0.52, w: w - 0.7, h: levelH * 0.42,
          ...textStyle(theme, "caption", { color: ink, scale: bodyScale }),
          align: "center", valign: "top",
        });
      }
    });
  },

  /**
   * Overlapping semi-transparent circles with set labels above and items listed
   * inside each circle. 2, 3 and 4-set geometries are placed by arrangement, and
   * the overlap regions carry no special text — the items sit within their set.
   */
  venn(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const sets = data.sets;
    const n = sets.length;
    const top = Math.max(y, 2.6);
    const cx = box.x + box.w / 2;
    const cy = (top + box.bottom) / 2;
    const d = Math.min(3.2, box.w / 3.4, box.bottom - top - 1.1);
    const transparency = 62;
    const colours = [theme.palette.accent, theme.palette.accent_alt ?? theme.palette.ink, theme.palette.ink_muted, theme.palette.rule];
    let centres;
    if (n === 2) {
      centres = [{ x: cx - d * 0.28, y: cy }, { x: cx + d * 0.28, y: cy }];
    } else if (n === 3) {
      const r = d * 0.34;
      centres = [
        { x: cx, y: cy - r * 0.75 },
        { x: cx - r * 1.15, y: cy + r * 0.5 },
        { x: cx + r * 1.15, y: cy + r * 0.5 },
      ];
    } else {
      const o = d * 0.32;
      centres = [
        { x: cx - o, y: cy - o * 0.85 },
        { x: cx + o, y: cy - o * 0.85 },
        { x: cx - o, y: cy + o * 0.85 },
        { x: cx + o, y: cy + o * 0.85 },
      ];
    }
    const itemScale = fitScaleAll(sets.flatMap((s) => s.items ?? []), 2.2, 0.3, theme.type.caption);
    sets.forEach((s, i) => {
      const c = centres[i];
      slide.addShape("ellipse", {
        x: c.x - d / 2, y: c.y - d / 2, w: d, h: d,
        fill: { color: hex(colours[i % colours.length]), transparency },
        line: { type: "none" },
      });
      slide.addText(s.label, {
        x: c.x - 1.2, y: c.y - d / 2 - 0.42, w: 2.4, h: 0.35,
        ...textStyle(theme, "caption", { bold: true }),
        align: "center", valign: "middle",
      });
      (s.items ?? []).forEach((it, j) => {
        slide.addText(it, {
          x: c.x - 1.1, y: c.y - d / 2 + 0.4 + j * 0.32, w: 2.2, h: 0.3,
          ...textStyle(theme, "caption", { scale: itemScale }),
          align: "center", valign: "middle",
        });
      });
    });
  },

  /**
   * A tree: leaves spread evenly across the width, internal nodes centred over
   * their children, hairlines from each node's bottom to its children's tops.
   * Depth maps to vertical position.
   */
  hierarchy(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const top = Math.max(y, 2.5);
    const nodeW = 1.9, nodeH = 0.6;
    const tree = [];
    const build = (label, children, depth) => {
      // Push the node first, THEN build its children: the children value is
      // evaluated before push() runs, so building it inside the object literal
      // would append the grandchildren before their parent and desync every
      // index. (That bug made the whole tree render post-order and collapse.)
      const idx = tree.length;
      tree.push({ label, children: [], depth });
      tree[idx].children = (children ?? []).map((c) => build(c.label, c.children, depth + 1));
      return idx;
    };
    const rootIdx = build(data.root.label, data.children, 0);
    let totalLeaves = 0;
    const countLeaves = (i) => {
      if (!tree[i].children.length) totalLeaves++;
      else tree[i].children.forEach(countLeaves);
    };
    countLeaves(rootIdx);
    const leafW = box.w / Math.max(1, totalLeaves);
    const xs = new Array(tree.length);
    let leaf = 0;
    const place = (i) => {
      if (!tree[i].children.length) {
        xs[i] = box.x + leafW * (leaf++ + 0.5);
        return xs[i];
      }
      const childXs = tree[i].children.map(place);
      xs[i] = (Math.min(...childXs) + Math.max(...childXs)) / 2;
      return xs[i];
    };
    place(rootIdx);
    const maxDepth = Math.max(...tree.map((nd) => nd.depth));
    const levelH = maxDepth ? (box.bottom - top - 0.1) / (maxDepth + 1) : 0;
    const labelScale = fitScaleAll(tree.map((nd) => nd.label), nodeW - 0.2, 0.4, theme.type.caption, { min: 0.6 });
    tree.forEach((nd, i) => {
      const nx = xs[i] - nodeW / 2;
      const ny = top + nd.depth * levelH + 0.05;
      nd.children.forEach((ci) => {
        const fromY = ny + nodeH;
        const toY = top + tree[ci].depth * levelH + 0.05;
        const lx = Math.min(xs[i], xs[ci]), lw = Math.abs(xs[ci] - xs[i]) || 0.02;
        const ly = Math.min(fromY, toY), lh = Math.abs(toY - fromY) || 0.02;
        slide.addShape("line", {
          x: lx, y: ly, w: lw, h: lh,
          line: { color: hex(theme.palette.rule), width: 1.1 },
          flipH: xs[ci] < xs[i], flipV: toY < fromY,
        });
      });
      card(slide, theme, { x: nx, y: ny, w: nodeW, h: nodeH });
      slide.addText(nd.label, {
        x: nx + 0.1, y: ny, w: nodeW - 0.2, h: nodeH,
        ...textStyle(theme, "caption", { bold: true, scale: labelScale }),
        align: "center", valign: "middle",
      });
    });
  },

  /**
   * A mind-map: an accent centre circle, thick accent branches radiating to
   * sub-labels, and thinner hairlines from each sub-label to its leaf items.
   */
  "concept-map"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const top = Math.max(y, 2.6);
    const cx = box.x + box.w / 2;
    const cy = (top + box.bottom) / 2;
    const branches = data.branches;
    const n = branches.length;
    const centreW = 1.5;
    const centreScale = fitOneLine(data.centre.label, centreW - 0.3, theme.type.subhead, { min: 0.5 });
    slide.addShape("ellipse", {
      x: cx - centreW / 2, y: cy - centreW / 2, w: centreW, h: centreW,
      fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
    });
    slide.addText(data.centre.label, {
      x: cx - centreW / 2, y: cy - centreW / 2, w: centreW, h: centreW,
      ...textStyle(theme, "subhead", { bold: true, color: theme.palette.on_accent, scale: centreScale }),
      align: "center", valign: "middle",
    });
    const radius = Math.max(1.3, Math.min(box.w / 2 - 1.9, (box.bottom - top) / 2 - 0.95));
    const labelScale = fitScaleAll(branches.map((b) => b.label), 1.7, 0.35, theme.type.caption, { min: 0.6 });
    const line = (ax, ay, bx, by, { width = 1.1, color = theme.palette.rule } = {}) => {
      const lx = Math.min(ax, bx), lw = Math.abs(bx - ax) || 0.02;
      const ly = Math.min(ay, by), lh = Math.abs(by - ay) || 0.02;
      slide.addShape("line", {
        x: lx, y: ly, w: lw, h: lh,
        line: { color: hex(color), width },
        flipH: bx < ax, flipV: by < ay,
      });
    };
    // Lines first, then the centre circle on top — a branch drawn over the
    // circle would slice through the centre label.
    const spreadCap = (angle, ex, ey) => {
      let cap = 1.15;
      const s = Math.sin(angle), c = Math.cos(angle);
      if (s > 0) cap = Math.min(cap, (box.bottom - 0.4 - ey) / s);
      if (s < 0) cap = Math.min(cap, (ey - top - 0.3) / -s);
      if (c > 0) cap = Math.min(cap, (box.right - 0.4 - ex) / c);
      if (c < 0) cap = Math.min(cap, (ex - box.x - 0.4) / -c);
      return cap;
    };
    // Leaf geometry shared by the line pass and the label pass: each leaf is a
    // pill sized to its OWN measured text width, fanned PERPENDICULAR to the
    // branch so the footprints never overlap. The old fixed 1.7in box at
    // 0.46in spacing made two side-by-side leaves collide ("Events" over
    // "Queues") and shrank the labels to ~8pt; sizing to the text fixes both.
    const leafGeometry = (b) => {
      const items = b.items ?? [];
      const widths = items.map((it) => Math.min(1.9, measure(it, theme.type.caption) + 0.36));
      const total = widths.reduce((a, c) => a + c, 0) + 0.18 * Math.max(0, items.length - 1);
      let cursor = -total / 2;
      return items.map((it, j) => {
        const w2 = widths[j];
        const off = cursor + w2 / 2;
        cursor += w2 + 0.18;
        return { text: it, w: w2, off };
      });
    };
    const leafPos = (b, angle, ex, ey, spread) => {
      const perp = angle + Math.PI / 2;
      return leafGeometry(b).map(({ text, w, off }) => {
        let ix = ex + spread * Math.cos(angle) + off * Math.cos(perp);
        let iy = ey + spread * Math.sin(angle) + off * Math.sin(perp);
        ix = Math.max(box.x + 0.45, Math.min(box.right - 0.45, ix));
        iy = Math.max(top + 0.35, Math.min(box.bottom - 0.35, iy));
        return { text, w, x: ix, y: iy };
      });
    };
    branches.forEach((b, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      const ex = cx + radius * Math.cos(angle);
      const ey = cy + radius * Math.sin(angle);
      const spread = spreadCap(angle, ex, ey);
      line(cx, cy, ex, ey, { width: 2.2, color: theme.palette.accent });
      for (const lf of leafPos(b, angle, ex, ey, spread)) line(ex, ey, lf.x, lf.y);
    });
    slide.addShape("ellipse", {
      x: cx - centreW / 2, y: cy - centreW / 2, w: centreW, h: centreW,
      fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
    });
    slide.addText(data.centre.label, {
      x: cx - centreW / 2, y: cy - centreW / 2, w: centreW, h: centreW,
      ...textStyle(theme, "subhead", { bold: true, color: theme.palette.on_accent, scale: centreScale }),
      align: "center", valign: "middle",
    });
    branches.forEach((b, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      const ex = cx + radius * Math.cos(angle);
      const ey = cy + radius * Math.sin(angle);
      const spread = spreadCap(angle, ex, ey);
      slide.addText(b.label, {
        x: ex - 0.85, y: ey - 0.3, w: 1.7, h: 0.35,
        ...textStyle(theme, "caption", { bold: true, scale: labelScale }),
        align: "center", valign: "middle",
      });
      const maxW = Math.min(1.9, Math.max(...leafGeometry(b).map((g) => g.w)));
      const itemScale = fitScaleAll(
        (b.items ?? []).flat(), maxW, 0.34, theme.type.caption, { min: 0.7 },
      );
      for (const lf of leafPos(b, angle, ex, ey, spread)) {
        slide.addText(lf.text, {
          x: lf.x - lf.w / 2, y: lf.y - 0.17, w: lf.w, h: 0.34,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: itemScale }),
          align: "center", valign: "middle",
        });
      }
    });
  },

  /**
   * A mini-dictionary: terms in an accent bold column, definitions to the
   * right, hairlines between entries.
   */
  glossary(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const termW = 3.2;
    const rowH = (box.bottom - y - 0.1) / data.entries.length;
    const defScale = fitScaleAll(
      data.entries.map((e) => e.definition), box.w - termW - 0.5, rowH * 0.8, theme.type.body,
    );
    const termScale = fitScaleAll(data.entries.map((e) => e.term), termW, rowH * 0.8, theme.type.subhead, { min: 0.65 });
    data.entries.forEach((e, i) => {
      const ry = y + i * rowH;
      slide.addText(e.term, {
        x: box.x, y: ry, w: termW, h: rowH,
        ...textStyle(theme, "subhead", { bold: true, color: theme.palette.accent, scale: termScale }),
        valign: "middle",
      });
      slide.addText(e.definition, {
        x: box.x + termW + 0.5, y: ry, w: box.w - termW - 0.5, h: rowH,
        ...textStyle(theme, "body", { scale: defScale }),
        valign: "middle",
      });
      if (i < data.entries.length - 1) {
        slide.addShape("rect", {
          x: box.x, y: ry + rowH - 0.015, w: box.w, h: 0.015,
          fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
        });
      }
    });
  },

  /** Questions and answers: a Q marker and question above an A marker and answer. */
  faq(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.items.length;
    const rowH = (box.bottom - y - 0.1 - 0.12 * (n - 1)) / n;
    const qScale = fitScaleAll(data.items.map((i) => i.question), box.w - 0.45, rowH * 0.42, theme.type.subhead, { min: 0.7 });
    const aScale = fitScaleAll(data.items.map((i) => i.answer), box.w - 0.45, rowH * 0.45, theme.type.body);
    data.items.forEach((it, i) => {
      const ry = y + i * (rowH + 0.12);
      slide.addText("Q", {
        x: box.x, y: ry, w: 0.4, h: rowH * 0.45,
        ...textStyle(theme, "eyebrow", { color: theme.palette.accent }),
        valign: "top",
      });
      slide.addText(it.question, {
        x: box.x + 0.45, y: ry, w: box.w - 0.45, h: rowH * 0.45,
        ...textStyle(theme, "subhead", { bold: true, scale: qScale }),
        valign: "top",
      });
      slide.addText("A", {
        x: box.x, y: ry + rowH * 0.52, w: 0.4, h: rowH * 0.42,
        ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
        valign: "top",
      });
      slide.addText(it.answer, {
        x: box.x + 0.45, y: ry + rowH * 0.52, w: box.w - 0.45, h: rowH * 0.42,
        ...textStyle(theme, "body", { scale: aScale, color: theme.palette.ink_muted }),
        valign: "top",
      });
      if (i < n - 1) {
        slide.addShape("rect", {
          x: box.x, y: ry + rowH + 0.06, w: box.w, h: 0.015,
          fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
        });
      }
    });
  },

  /**
   * A member grid: a circular photo (or a numbered placeholder) beside the name
   * and role. Columns grow with the roster: 2..4 → two, 5..6 → three, 7+ → four.
   */
  "team-grid"(slide, ctx) {
    const { theme, data, box, resolveAsset } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.members.length;
    const cols = n <= 4 ? 2 : n <= 6 ? 3 : 4;
    const rows = Math.ceil(n / cols);
    const gut = theme.grid.gutter;
    const cw = (box.w - gut * (cols - 1)) / cols;
    const ch = (box.bottom - y - 0.1 - gut * (rows - 1)) / rows;
    const pad = theme.shape?.card_pad ?? 0.24;
    const imgSize = 0.95;
    const tx = (x) => x + pad + imgSize + 0.25;
    const tw = (cw) => cw - pad * 2 - imgSize - 0.25;
    // Name and role were each budgeted one flat line, so a long name in a
    // narrow column was shrunk to the readable floor rather than wrapped.
    // The pair is sized to its real line count and centred in the card as one
    // block, which keeps the rows aligned however many lines a name takes.
    const nameH = linesBox(theme, "subhead", data.members.map((m) => m.name), tw(cw));
    const roleH = linesBox(theme, "caption", data.members.map((m) => m.role), tw(cw));
    const blockH = nameH + roleH;
    const nameScale = fitScaleAll(data.members.map((m) => m.name), tw(cw), nameH, theme.type.subhead, { min: 0.65 });
    const roleScale = fitScaleAll(data.members.map((m) => m.role), tw(cw), roleH, theme.type.caption);
    data.members.forEach((m, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = box.x + c * (cw + gut);
      const ry = y + r * (ch + gut);
      card(slide, theme, { x, y: ry, w: cw, h: ch });
      const cy = ry + ch / 2;
      const src = resolveAsset(m.image);
      if (src) {
        slide.addImage({
          path: src, x: x + pad, y: cy - imgSize / 2, w: imgSize, h: imgSize,
          rounding: true, sizing: { type: "cover", w: imgSize, h: imgSize },
        });
      } else {
        // Placeholder avatar: outlined surface, not a rule fill — `rule` can
        // be a translucent white whose stripped fill swallows the number.
        slide.addShape("ellipse", {
          x: x + pad, y: cy - imgSize / 2, w: imgSize, h: imgSize,
          fill: { color: hex(theme.palette.surface) }, line: { color: hex(theme.palette.rule), width: 1 },
        });
        slide.addText(String(i + 1), {
          x: x + pad, y: cy - imgSize / 2, w: imgSize, h: imgSize,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted }),
          align: "center", valign: "middle",
        });
      }
      const ty = cy - blockH / 2;
      slide.addText(m.name, {
        x: tx(x), y: ty, w: tw(cw), h: nameH,
        ...textStyle(theme, "subhead", { bold: true, scale: nameScale }),
        valign: "top",
      });
      slide.addText(m.role, {
        x: tx(x), y: ty + nameH, w: tw(cw), h: roleH,
        ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: roleScale }),
        valign: "top",
      });
    });
  },

  /** Credits: name/contribution pairs in a two- or three-column grid. */
  attribution(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const cols = data.items.length >= 6 ? 3 : 2;
    const rows = Math.ceil(data.items.length / cols);
    const gut = theme.grid.gutter;
    const cw = (box.w - gut * (cols - 1)) / cols;
    const ch = (box.bottom - y - 0.1 - gut * (rows - 1)) / rows;
    const nameScale = fitScaleAll(data.items.map((i) => i.name), cw - 0.2, 0.45, theme.type.subhead, { min: 0.7 });
    const contribScale = fitScaleAll(
      data.items.map((i) => i.contribution).filter(Boolean), cw - 0.2, 0.4, theme.type.caption,
    );
    data.items.forEach((it, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = box.x + c * (cw + gut);
      const ry = y + r * (ch + gut);
      slide.addText(it.name, {
        x, y: ry, w: cw, h: 0.5,
        ...textStyle(theme, "subhead", { bold: true, scale: nameScale }),
        valign: "top",
      });
      if (it.contribution) {
        slide.addText(it.contribution, {
          x, y: ry + 0.52, w: cw, h: 0.4,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: contribScale }),
          valign: "top",
        });
      }
    });
  },

  /** A centred card of label/value contact lines. */
  contact(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    // The card used to be ~6.4in wide pinned below the heading, leaving most
    // of the slide empty around a small floating box. It now spans most of the
    // content width and fills the space from the heading to the footer, so the
    // contact rows read as the slide's subject, not a note stuck mid-air.
    const cardW = Math.min(9.4, box.w * 0.85);
    const cx = box.x + (box.w - cardW) / 2;
    const cardTop = y + 0.25;
    const cardBot = box.bottom - 0.35;
    const cardH = cardBot - cardTop;
    const rowH = (cardH - 0.5) / data.items.length;
    slide.addShape("roundRect", {
      x: cx, y: cardTop, w: cardW, h: cardH,
      fill: { color: hex(theme.palette.surface) }, line: { type: "none" },
      rectRadius: theme.shape?.radius?.card ?? 0.12,
    });
    const valueScale = fitScaleAll(data.items.map((i) => i.value), cardW - 3.1, Math.min(0.55, rowH - 0.1), theme.type.subhead, { min: 0.7 });
    data.items.forEach((it, i) => {
      const ry = cardTop + 0.25 + i * rowH + (rowH - 0.5) / 2;
      // The label is right-aligned to its box end; the box must END before the
      // value starts or a right-aligned label's last glyph meets the value.
      slide.addText(it.label, {
        x: cx + 0.5, y: ry, w: 1.9, h: 0.5,
        ...textStyle(theme, "caption", { color: theme.palette.ink_muted }),
        align: "right", valign: "middle",
      });
      slide.addText(it.value, {
        x: cx + 2.6, y: ry, w: cardW - 3.1, h: 0.5,
        ...textStyle(theme, "subhead", { bold: true, scale: valueScale }),
        valign: "middle",
      });
    });
  },

  /**
   * A formula slide: the equation in the theme's mono face (falling back to the
   * body family), a panel behind it, the interpretation below, and a grid of
   * variable definitions at the bottom.
   */
  equation(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const mono = theme.type.mono?.family ?? theme.type.body.family;
    const top = Math.max(y, 2.7);
    const fH = 1.25;
    slide.addShape("roundRect", {
      x: box.x, y: top, w: box.w, h: fH,
      fill: { color: hex(theme.palette.surface) }, line: { type: "none" },
      rectRadius: theme.shape?.radius?.card ?? 0.12,
    });
    const fStyle = { family: mono, size: theme.type.heading.size, weight: 700 };
    const fScale = fitOneLine(data.formula, box.w - 1.2, fStyle, { min: 0.5 });
    slide.addText(data.formula, {
      x: box.x + 0.6, y: top, w: box.w - 1.2, h: fH,
      fontFace: mono, fontSize: Math.round(fStyle.size * fScale),
      bold: true, color: hex(theme.palette.accent),
      align: "center", valign: "middle",
      charSpacing: theme.type.heading.tracking ?? 0,
    });
    const bodyTop = top + fH + 0.3;
    const hasVars = Array.isArray(data.variables) && data.variables.length > 0;
    const bodyBudget = hasVars ? 0.95 : box.bottom - bodyTop - 0.1;
    slide.addText(data.body, {
      x: box.x, y: bodyTop, w: box.w, h: bodyBudget,
      ...textStyle(theme, "body", {
        scale: fitScale(data.body, box.w, bodyBudget, theme.type.body, { min: 0.75 }),
        color: theme.palette.ink_muted,
      }),
      valign: "top",
    });
    if (hasVars) {
      const vars = data.variables;
      const cols = vars.length > 3 ? 3 : vars.length;
      const rows = Math.ceil(vars.length / cols);
      const gut = theme.grid.gutter;
      const cw = (box.w - gut * (cols - 1)) / cols;
      const vTop = bodyTop + 1.05;
      const ch = (box.bottom - vTop - 0.1 - gut * (rows - 1)) / rows;
      const meaningScale = fitScaleAll(vars.map((v) => v.meaning), cw - 1.5, 0.4, theme.type.caption);
      vars.forEach((v, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        const x = box.x + c * (cw + gut);
        const ry = vTop + r * (ch + gut);
        // Symbols are mono acronyms; the box is sized by the longest one and the
        // font shrinks to fit, so CAPEX never breaks into "CA"/"PEX".
        const symStyle = { family: mono, size: theme.type.subhead.size * 0.85 };
        const symScale = fitOneLine(
          vars.map((x) => x.symbol).reduce((a, b) => (b.length > a.length ? b : a)),
          1.4,
          symStyle,
          { min: 0.5 },
        );
        slide.addText(v.symbol, {
          x, y: ry, w: 1.4, h: ch,
          fontFace: mono, fontSize: Math.round(symStyle.size * symScale),
          bold: true, color: hex(theme.palette.accent),
          align: "left", valign: "middle",
        });
        slide.addText(v.meaning, {
          x: x + 1.5, y: ry, w: cw - 1.5, h: ch,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: meaningScale }),
          valign: "middle",
        });
      });
    }
  },

  /**
   * An annotated bibliography: the citation and an italic annotation beneath it,
   * one entry per row.
   */
  bibliography(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.entries.length;
    const rowH = (box.bottom - y - 0.1 - 0.1 * (n - 1)) / n;
    const citeScale = fitScaleAll(
      data.entries.map((e) => e.citation), box.w - 0.3, rowH * 0.55, theme.type.body,
    );
    const annScale = fitScaleAll(
      data.entries.map((e) => e.annotation).filter(Boolean), box.w - 0.3, rowH * 0.4, theme.type.caption,
    );
    data.entries.forEach((e, i) => {
      const ry = y + i * (rowH + 0.1);
      slide.addText(e.citation, {
        x: box.x, y: ry, w: box.w, h: rowH * 0.55,
        ...textStyle(theme, "body", { scale: citeScale }),
        valign: "top",
      });
      if (e.annotation) {
        slide.addText(e.annotation, {
          x: box.x, y: ry + rowH * 0.55, w: box.w, h: rowH * 0.4,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, italic: true, scale: annScale }),
          valign: "top",
        });
      }
    });
  },

  /**
   * Data-source attribution cards: a name, the URL in small caption, a
   * description, and hairlines between sources.
   */
  "data-source"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.sources.length;
    const rowH = (box.bottom - y - 0.1 - 0.12 * (n - 1)) / n;
    const nameScale = fitScaleAll(data.sources.map((s) => s.name), box.w - 0.2, rowH * 0.4, theme.type.subhead, { min: 0.7 });
    const descScale = fitScaleAll(
      data.sources.map((s) => s.description).filter(Boolean), box.w - 0.2, rowH * 0.28, theme.type.caption,
    );
    data.sources.forEach((s, i) => {
      const ry = y + i * (rowH + 0.12);
      slide.addText(s.name, {
        x: box.x, y: ry, w: box.w, h: rowH * 0.4,
        ...textStyle(theme, "subhead", { bold: true, scale: nameScale }),
        valign: "top",
      });
      if (s.url) {
        slide.addText(s.url, {
          x: box.x, y: ry + rowH * 0.42, w: box.w, h: rowH * 0.26,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: 0.85 }),
          valign: "top",
        });
      }
      if (s.description) {
        slide.addText(s.description, {
          x: box.x, y: ry + rowH * 0.7, w: box.w, h: rowH * 0.26,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: descScale }),
          valign: "top",
        });
      }
      if (i < n - 1) {
        slide.addShape("rect", {
          x: box.x, y: ry + rowH + 0.06, w: box.w, h: 0.015,
          fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
        });
      }
    });
  },
};

export { content };
