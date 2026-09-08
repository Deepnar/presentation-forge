
import { hex, textStyle, applyTransform } from "../theme.js";
import { fitScale, fitScaleAll, fitOneLine, lineCount, measure, floorOf } from "../fit.js";
import { CANVAS, reservedTopRight } from "../chrome.js";
import { chartSeries, ensureContrast } from "../chartpalette.js";
import { frameBox, drawOpening, drawHeading, bulletOptions, listColumns, hasDropcap, sectionField, sectionStyle, titlePlacement } from "../composition.js";
import { atDesign, atFloor, card, content, designed, eyebrow, fitAllAt, fitAt, fitLineAt, heading, lineAtFloor, linesBox, onInk, paint, widest } from "./helpers.js";

export const layouts = {
title(slide, ctx) {
    const { theme, deck, data, identity } = ctx;
    const s = theme.surfaces.title;
    const coverTitle = data.headline?.trim() || deck.title;
    const coverSub = data.standfirst?.trim() || deck.subtitle;
    paint(slide, ctx, s.bg);

    const m = theme.grid.margin;
    const comp = titlePlacement(theme);
    const st = theme.type.display;
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
    const scale = fitScale(coverTitle, w, (st.size / 72) * (st.line ?? 1.12) * 2, st);
    slide.addText(coverTitle, {
      x, y: titleY, w, h: titleH,
      ...textStyle(theme, "display", { color: ink, scale }),
      ...align, valign,
    });

    let y = metaY;
    if (coverSub) {
      slide.addText(coverSub, {
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
      const hs = fitAt(theme, "display", 0.8, data.headline ?? "", tw, 1.9, { min: 0.5 });
      slide.addText(data.headline ?? "", {
        x: tx, y: 2.35, w: tw, h: 1.9,
        ...textStyle(theme, "display", { color: s.ink, scale: hs }),
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
    if (field !== "band" && field !== "rules") {
      slide.addShape("rect", {
        x: centred ? (CANVAS.w - 1.0) / 2 : m.left, y: ruleY + 0.06, w: 1.0, h: 0.05,
        fill: { color: hex(s.muted) }, line: { type: "none" },
      });
    }
    const headScale = fitAt(theme, "display", 0.8, data.headline ?? "", w, 1.15, { min: 0.5 });
    slide.addText(data.headline ?? "", {
      x: m.left, y: headY, w, h: 1.15,
      ...textStyle(theme, "display", { color: ink, scale: headScale }),
      ...align, valign: "top",
    });

    if (data.standfirst) {
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

  
  agenda(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);

    const n = data.items.length;
    const avail = box.bottom - y - 0.1;
    const hasDesc = data.items.some((i) => i.desc);
    const need = lineAtFloor(theme, "subhead") + (hasDesc ? 0.04 + lineAtFloor(theme, "caption") : 0);
    const gut = Math.max(0.12, Math.min(0.28, (avail - need * n) / Math.max(1, n - 1)));
    const rowH = (avail - gut * (n - 1)) / n;
    const numW = 0.62;
    const tw = box.w - numW - 0.25;
    const titleH = Math.min(rowH * 0.62, Math.max(rowH * 0.5, lineAtFloor(theme, "subhead")));
    const descH = Math.max(0.18, rowH - titleH - 0.04);
    const titleScale = fitScaleAll(data.items.map((i) => i.title), tw, titleH, theme.type.subhead);
    const descScale = fitScaleAll(
      data.items.map((i) => i.desc).filter(Boolean), tw, descH, theme.type.caption,
    );

    data.items.forEach((item, i) => {
      const ry = y + i * (rowH + gut);
      slide.addText(String(i + 1).padStart(2, "0"), {
        x: box.x, y: ry, w: numW, h: rowH,
        ...textStyle(theme, "eyebrow", { color: theme.palette.accent }),
        align: "left", valign: "top",
      });
      slide.addText(item.title, {
        x: box.x + numW + 0.25, y: ry, w: tw, h: titleH,
        ...textStyle(theme, "subhead", { bold: true, scale: titleScale }),
        valign: "top",
      });
      if (item.desc) {
        slide.addText(item.desc, {
          x: box.x + numW + 0.25, y: ry + titleH + 0.04, w: tw, h: descH,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: descScale }),
          valign: "top",
        });
      }
    });
  },

  
  "big-number"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const subH = 0.4;
    const reserve = 0.5 + 0.1 + lineAtFloor(theme, "body") * 2 + (data.sub ? subH + 0.12 : 0.15);
    const valueH = Math.max(1.2, Math.min(2.1, box.bottom - y - reserve));
    const valueScale = fitScale(data.value, box.w, valueH, theme.type.stat, { min: 0.7 });
    slide.addText(data.value, {
      x: box.x, y, w: box.w, h: valueH,
      ...textStyle(theme, "stat", { color: theme.palette.accent, scale: valueScale }),
      valign: "top",
    });

    const labelScale = fitScale(data.label, box.w, 0.5, theme.type.subhead, { min: 0.7 });
    slide.addText(data.label, {
      x: box.x, y: y + valueH + 0.05, w: box.w, h: 0.5,
      ...textStyle(theme, "subhead", { bold: true, scale: labelScale }),
      valign: "top",
    });
    const bodyTop = y + valueH + 0.5;
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

  
  "pros-cons"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);

    const gut = theme.grid.gutter;
    const cw = (box.w - gut) / 2;
    const pad = 0.28;
    const ch = box.bottom - y - 0.1;
    const all = [...data.pros, ...data.cons];
    const rows = Math.max(data.pros.length, data.cons.length);
    const listH = ch - 0.7;
    const perItem = Math.max(0.2, (listH - (8 / 72) * (rows - 1)) / rows);
    const scale = fitScaleAll(all, cw - pad * 2 - 0.5, perItem, theme.type.body);

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
  
  definition(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);

    const termScale = fitScale(data.term, box.w, 0.9, theme.type.heading, { min: 0.6 });
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
    const titleH = linesBox(theme, "subhead", data.cards.map((c) => c.title), cw - pad * 2);
    const stackH = titleH + 0.04 + (data.cards.some((c) => c.kicker) ? 0.34 : 0);
    const bodyBudget = Math.max(0.4, ch - stackH - pad * 2 - 0.08);
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
        x: x + pad, y: ty + 0.08, w: cw - pad * 2, h: bodyBudget,
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
    const gut = theme.grid.gutter;
    const verdictLead = `${data.label ?? "The framework"}: `;
    const verdictH = hasVerdict
      ? Math.min(1.35, Math.max(0.62, linesBox(theme, "body", [verdictLead + data.verdict], box.w - 0.68) + 0.24))
      : 0;
    const cw = (box.w - gut) / 2;
    const ch = box.bottom - y - verdictH - (hasVerdict ? 0.24 : 0) - 0.1;
    const pad = theme.shape?.card_pad ?? 0.28;
    const bodyW = cw - pad * 2;
    const ptW = bodyW - 0.24;

    const sides = [data.left, data.right];
    const pointsOf = (s) => (s.points ?? []).filter(Boolean);
    const allPoints = sides.flatMap(pointsOf);
    const maxPoints = Math.max(0, ...sides.map((s) => pointsOf(s).length));
    const titleSt = designed(theme, "heading", 0.6);
    const titleH = (titleSt.size * (titleSt.line ?? 1.2)) / 72 + 0.04;
    const kickerH = (theme.type.caption.size * (theme.type.caption.line ?? 1.3)) / 72 + 0.04;
    const tyOff = pad + titleH + 0.03 + (sides.some((s) => s.kicker) ? kickerH + 0.06 : 0);
    const zone = ch - tyOff - pad;
    const pointLine = allPoints.length ? linesBox(theme, "caption", allPoints, ptW) : 0;
    const pointsNeed = maxPoints ? maxPoints * (pointLine + 0.06) + 0.08 : 0;
    const bodyNeed = linesBox(theme, "body", sides.map((s) => s.body), bodyW);
    const pointRowMin = lineAtFloor(theme, "caption") + 0.06;
    const wantPoints = maxPoints ? Math.max(pointsNeed, maxPoints * pointRowMin) : 0;
    const pointsH = Math.min(wantPoints, Math.max(0, zone - lineAtFloor(theme, "body")));
    const bodyH = zone - pointsH;
    const pointRow = maxPoints ? pointsH / maxPoints : 0;
    const bodyScale = fitScaleAll(sides.map((s) => s.body), bodyW, bodyH, theme.type.body);
    const pointScale = fitAllAt(theme, "caption", 0.95, allPoints, ptW, pointRow - 0.06);

    sides.forEach((side, i) => {
      const x = box.x + i * (cw + gut);
      card(slide, theme, { x, y, w: cw, h: ch });

      let ty = y + pad;
      const titleScale = fitAt(theme, "heading", 0.6, side.title, bodyW, titleH, { min: 0.55 });
      slide.addText(side.title, {
        x: x + pad, y: ty, w: bodyW, h: titleH,
        ...textStyle(theme, "heading", { scale: titleScale }),
        valign: "top",
      });
      ty += titleH + 0.03;

      if (side.kicker) {
        slide.addText(side.kicker, {
          x: x + pad, y: ty, w: bodyW, h: kickerH,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted }),
        });
        ty += kickerH + 0.06;
      }

      slide.addText(side.body, {
        x: x + pad, y: y + tyOff + 0.06, w: bodyW, h: bodyH,
        ...textStyle(theme, "body", { scale: bodyScale }),
        valign: "top",
      });

      pointsOf(side).forEach((pt, j) => {
        const py = y + tyOff + bodyH + j * pointRow;
        slide.addShape("ellipse", {
          x: x + pad + 0.03, y: py + pointRow / 2 - 0.045, w: 0.09, h: 0.09,
          fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
        });
        slide.addText(pt, {
          x: x + pad + 0.24, y: py, w: ptW, h: pointRow - 0.06,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: pointScale }),
          valign: "top",
        });
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
          { text: verdictLead, options: { color: hex(onInk(theme)), bold: true } },
          { text: data.verdict, options: { color: hex(theme.palette.surface) } },
        ],
        {
          x: box.x + 0.34, y: vy, w: box.w - 0.68, h: verdictH,
          ...textStyle(theme, "body", {
            scale: fitScale(verdictLead + data.verdict, box.w - 0.68, verdictH - 0.12, theme.type.body),
          }),
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
    const statFloor = floorOf(theme.type.stat);
    const minStat = statFloor ? Math.min(1, statFloor / theme.type.stat.size) : 0.6;
    const cols = data.stats.map((s) => {
      const valueScale = fitOneLine(s.value, cw * 0.94, theme.type.stat, { min: minStat });
      const labelW = cw * 0.9;
      const longestWord = String(s.label).split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), "");
      const labelScale = Math.min(
        fitScale(s.label, labelW, 1.2, sub, { min: 0.7 }),
        fitOneLine(longestWord, labelW, sub, { min: 0.7 }),
      );
      const labelSized = { ...sub, size: sub.size * labelScale };
      const wordBreaks = measure(longestWord, labelSized) > labelW;
      const labelLines = lineCount(s.label, labelW, labelSized) + (wordBreaks ? 1 : 0);
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
        { text: `${data.label ?? "The framework"}: `, options: { color: hex(onInk(theme)), bold: true } },
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
    if (theme.plate?.enabled) {
      card(slide, theme, { x: box.x, y, w: hasAside ? box.w : cw, h: ch });
    }
    const seriesLen = Math.min(...c.series.map((s) => (s.values ?? []).length));
    const labels = Array.from({ length: seriesLen }, (_, i) => c.categories[i] ?? "");

    const raw = c.series.map((s) => ({ name: s.name, labels, values: (s.values ?? []).slice(0, seriesLen) }));
    const series = c.kind === "scatter"
      ? [
          { name: "X-Axis", values: labels.map((cat, i) => Number(cat) || i + 1) },
          ...raw.map(({ name, values }) => ({ name, values })),
        ]
      : raw;
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
      const noteGap = 0.1;
      const noteH = Math.min(0.9, (ch - 0.1 - noteGap * (data.aside.length - 1)) / data.aside.length);
      const noteScale = fitAllAt(theme, "body", 0.9, data.aside, aw - 0.18, noteH);
      let ay = y + 0.1;
      for (const note of data.aside) {
        slide.addShape("rect", {
          x: ax, y: ay + 0.06, w: 0.04, h: Math.min(0.42, noteH - 0.12),
          fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
        });
        slide.addText(note, {
          x: ax + 0.18, y: ay, w: aw - 0.18, h: noteH,
          ...textStyle(theme, "body", { scale: noteScale }),
          valign: "top",
        });
        ay += noteH + noteGap;
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
      const chip = 0.5;
      const railX = box.x + 0.34;
      const textX = railX + 0.85;
      const textW = box.right - textX - 0.15;
      const lineAtNominal = (style, fallbackRatio) => (style.size * (style.line ?? fallbackRatio)) / 72;
      const titleFloorH = lineAtFloor(theme, "subhead", 1.3);
      const bodyLine = lineAtFloor(theme, "body", 1.35);
      const oneLineBody = (s) => s.body && lineCount(s.body, textW, theme.type.body) <= 1;
      const renderedBodies = data.steps.filter(oneLineBody).map((s) => s.body);

      const avail = box.bottom - y;
      const rowNeed = titleFloorH + bodyLine;
      const canBody = renderedBodies.length > 0 && n * rowNeed <= avail;
      const gutT = Math.min(0.16, Math.max(0.06, (avail - n * (canBody ? rowNeed : titleFloorH)) / Math.max(1, n - 1)));
      const rowH = (avail - gutT * (n - 1)) / n;
      const titleH = canBody
        ? Math.max(titleFloorH, Math.min(lineAtNominal(theme.type.subhead, 1.3), rowH - bodyLine))
        : rowH;
      const bodyBudget = Math.max(bodyLine, rowH - titleH);
      const titleScale = fitScaleAll(data.steps.map((s) => s.title), textW, canBody ? titleH : rowH, theme.type.subhead, { min: 0.6 });
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
          x: textX, y: ry, w: textW, h: canBody ? titleH : rowH,
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
      const n = data.steps.length;
      const colW = box.w / n;
      const railY = Math.min(box.bottom - 1.1, y + (box.bottom - y) * 0.38);
      const titleZone = Math.max(0.7, railY - y - 0.22);
      const bodyTop = railY + 0.48;
      const bodyH = box.bottom - bodyTop - 0.1;

      const titleScale = fitScaleAll(data.steps.map((s) => s.title), colW - 0.3, titleZone, theme.type.subhead, { min: 0.72 });
      const bodyScale = fitScaleAll(data.steps.map((s) => s.body).filter(Boolean), colW - 0.3, bodyH, theme.type.body, { min: 0.72 });
      const usedTitle = Math.max(1, ...data.steps.map((s) => lineCount(s.title, colW - 0.3, theme.type.subhead)))
        * ((theme.type.subhead.size * titleScale * (theme.type.subhead.line ?? 1.3)) / 72);
      const bodies = data.steps.map((s) => s.body).filter(Boolean);
      const usedBody = bodies.length
        ? Math.max(1, ...bodies.map((b) => lineCount(b, colW - 0.3, theme.type.body)))
          * ((theme.type.body.size * bodyScale * (theme.type.body.line ?? 1.35)) / 72)
        : 0;
      const slack = (bodyH - usedBody) - (titleZone - usedTitle);
      const railShift = Math.max(0, Math.min(slack / 2, bodyH - usedBody));
      const railYS = railY + railShift;
      const titleZoneS = titleZone + railShift;
      const bodyTopS = bodyTop + railShift;
      const bodyHS = bodyH - railShift;
      slide.addShape("rect", {
        x: box.x, y: railYS - 0.015, w: box.w, h: 0.03,
        fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
      });

      data.steps.forEach((s, i) => {
        const cx = box.x + colW * i + colW / 2;
        slide.addShape("ellipse", {
          x: cx - 0.24, y: railYS - 0.24, w: 0.48, h: 0.48,
          fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
        });
        slide.addText(String(i + 1), {
          x: cx - 0.24, y: railYS - 0.24, w: 0.48, h: 0.48,
          ...textStyle(theme, "eyebrow", { color: theme.palette.on_accent }),
          align: "center", valign: "middle",
        });
        if (i < n - 1) {
          slide.addShape("triangle", {
            x: cx + 0.34, y: railYS - 0.1, w: 0.2, h: 0.2,
            fill: { color: hex(theme.palette.accent) }, line: { type: "none" }, rotate: 90,
          });
        }
        slide.addText(s.title, {
          x: cx - colW / 2 + 0.15, y, w: colW - 0.3, h: titleZoneS,
          ...textStyle(theme, "subhead", { bold: true, scale: titleScale }),
          align: "center", valign: "bottom",
        });
        if (s.body) {
          slide.addText(s.body, {
            x: cx - colW / 2 + 0.15, y: bodyTopS, w: colW - 0.3, h: bodyHS,
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
    const titled = Boolean(data.headline?.trim() || data.standfirst?.trim());
    let top = box.y;
    if (titled) {
      eyebrow(slide, ctx);
      top = heading(slide, ctx);
    }
    const capH = data.caption ? 0.5 : 0;
    const imgH = box.bottom - top - capH;
    if (src) {
      slide.addImage({
        path: src,
        x: box.x, y: top, w: box.w, h: imgH,
        sizing: { type: data.fit ?? "cover", w: box.w, h: imgH },
      });
    } else {
      slide.addShape("roundRect", {
        x: box.x, y: top, w: box.w, h: imgH,
        fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
        rectRadius: theme.shape?.radius?.card ?? 0.12,
      });
    }
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
    const capH = data.caption ? linesBox(theme, "caption", [data.caption], iw) + 0.08 : 0;
    const imgH = h - capH;

    const src = resolveAsset(data.image);
    if (src) {
      slide.addImage({
        path: src, x: ix, y, w: iw, h: imgH,
        sizing: { type: "cover", w: iw, h: imgH },
        rounding: false,
      });
    } else {
      slide.addShape("roundRect", {
        x: ix, y, w: iw, h: imgH,
        fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
        rectRadius: theme.shape?.radius?.card ?? 0.12,
      });
    }
    if (data.caption) {
      slide.addText(data.caption, {
        x: ix, y: y + imgH + 0.06, w: iw, h: capH - 0.06,
        ...textStyle(theme, "caption", {
          color: theme.palette.ink_muted,
          italic: true,
          scale: fitScale(data.caption, iw, capH - 0.06, theme.type.caption, { min: 0.7 }),
        }),
        valign: "top",
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

  
  "illustrated-points"(slide, ctx) {
    const { theme, data, box, resolveAsset } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);

    const avail = box.bottom - y - 0.2;
    const st = theme.type.body;
    if (!data.image) {
      slide.addText(
        data.points.map((b, i) => ({ text: b, options: { breakLine: true, ...bulletOptions(theme, i) } })),
        {
          x: box.x, y, w: box.w, h: avail,
          ...textStyle(theme, "body", {
            scale: fitScaleAll(data.points, box.w - 0.4, avail / data.points.length, st),
          }),
          paraSpaceAfter: 10,
          valign: "top",
        },
      );
      return;
    }

    const gut = theme.grid.gutter;
    const iw = box.w * 0.42;
    const tw = box.w - iw - gut;
    const imgLeft = data.side === "left";
    const ix = imgLeft ? box.x : box.x + tw + gut;
    const tx = imgLeft ? box.x + iw + gut : box.x;
    const capH = data.caption ? linesBox(theme, "caption", [data.caption], iw) + 0.08 : 0;
    const imgH = avail - capH;

    const src = resolveAsset(data.image);
    if (src) {
      slide.addImage({
        path: src, x: ix, y, w: iw, h: imgH,
        sizing: { type: "cover", w: iw, h: imgH },
        rounding: false,
      });
    } else {
      slide.addShape("roundRect", {
        x: ix, y, w: iw, h: imgH,
        fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
        rectRadius: theme.shape?.radius?.card ?? 0.12,
      });
    }
    if (data.caption) {
      slide.addText(data.caption, {
        x: ix, y: y + imgH + 0.06, w: iw, h: capH - 0.06,
        ...textStyle(theme, "caption", {
          color: theme.palette.ink_muted,
          italic: true,
          scale: fitScale(data.caption, iw, capH - 0.06, theme.type.caption, { min: 0.7 }),
        }),
        valign: "top",
      });
    }
    slide.addText(
      data.points.map((b, i) => ({ text: b, options: { breakLine: true, ...bulletOptions(theme, i) } })),
      {
        x: tx, y, w: tw, h: avail,
        ...textStyle(theme, "body", {
          scale: fitScaleAll(data.points, tw - 0.4, avail / data.points.length, st),
        }),
        paraSpaceAfter: 10,
        valign: "top",
      },
    );
  },

  timeline(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);

    const n = data.events.length;
    const step = box.w / n;
    const bodyLines = Math.max(
      1,
      ...data.events.map((e) => lineCount(e.what, step - 0.2, designed(theme, "body", 0.85))),
    );
    const whatSt = designed(theme, "body", 0.85);
    const bodyH = bodyLines * ((whatSt.size * (whatSt.line ?? 1.3)) / 72);
    const blockH = 0.42 + 0.03 + 0.24 + bodyH;
    const railY = y + Math.max(0, (box.bottom - y - blockH) / 2) + 0.42;
    slide.addShape("rect", {
      x: box.x, y: railY, w: box.w, h: 0.03,
      fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
    });
    const whatScale = fitAllAt(theme, "body", 0.85, data.events.map((e) => e.what), step - 0.2, box.bottom - railY - 0.4);
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
        ...textStyle(theme, "body", { scale: whatScale }), align: "center", valign: "top",
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
