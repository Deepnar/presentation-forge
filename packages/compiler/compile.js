// @forge/compiler — SlideIntent -> SlideScene. Deterministic: the same
// intent and design always produce byte-identical scenes (asserted in
// tests). Recipes own geometry; the model never sees a coordinate.
//
// Chrome (banner/crest/footer) is emitted as locked scene elements by
// the canonical planned path when explicit adapter-resolved
// ChromeInput is supplied; without input, scenes stay chrome-free and
// byte-identical to historical output.

import { SCENE_W, SCENE_H, compilerId, findElement } from "../model/scene.ts";
import { planDeckComposition } from "./composition.ts";
import { compilePlannedSlide } from "./mechanisms.ts";
import { fittedTextEl, refitTextEl } from "./text-fit.ts";
import { CONTENT_FOOTER_RESERVE } from "../core/chrome.ts";
import { planDeckChrome, chromePlanForSlide } from "./chrome.ts";

function box(design) {
  const m = design.grid.margins;
  return {
    x: m.left,
    y: m.top,
    w: SCENE_W - m.left - m.right,
    bottom: SCENE_H - m.bottom - CONTENT_FOOTER_RESERVE,
  };
}

function textEl(id, semanticRef, x, y, w, h, paragraphs, size, color, align = "left", fit = null) {
  const paras = paragraphs.map((p) =>
    typeof p === "string"
      ? { runs: [{ text: p, role: "body", size, color }], align }
      : { align, ...p, runs: p.runs.map((r) => ({ role: "body", size, color, ...r })) },
  );
  if (!fit) {
    return {
      id, kind: "text", x, y, w, h, z: 10, provenance: "compiler", semanticRef,
      paragraphs: paras,
    };
  }
  return fittedTextEl(fit.design, {
    id, semanticRef, box: { x, y, w, h }, paragraphs: paras, z: 10,
    slideId: fit.slideId, sink: fit.sink,
  });
}

function shapeEl(id, semanticRef, x, y, w, h, form, fill, z = 1) {
  return { id, kind: "shape", x, y, w, h, z, provenance: "compiler", semanticRef, shape: { form, fill } };
}

function para(text, { role = "body", bold = false, size, color, align = "left", bullet = false } = {}) {
  return { runs: [{ text, role, bold, size, color }], align, bullet };
}

function fitFor(design, slideId, sink) {
  return { design, slideId, sink };
}

function titleBlock(slide, design, content, fit) {
  const t = design.roles;
  const size = t.heading?.size ?? 30;
  return textEl(
    compilerId(slide.id, "title", "heading"), "title",
    content.x, content.y, content.w, 1.1,
    [para(slide.title ?? "", { role: "heading", bold: true, size, color: design.palette.ink.hex })],
    undefined, undefined, "left", fit,
  );
}

const RECIPES = {
  title(slide, design, sink = []) {
    const c = box(design);
    const t = design.roles;
    const fit = fitFor(design, slide.id, sink);
    const els = [
      textEl(
        compilerId(slide.id, "title", "display"), "title",
        c.x, 2.2, c.w, 1.6,
        [para(slide.title ?? "", { role: "display", bold: true, size: t.display?.size ?? 40, color: design.palette.ink.hex, align: "center" })],
        undefined, undefined, "center", fit,
      ),
    ];
    const sub = slide.blocks.find((b) => b.kind === "text");
    if (sub?.text) {
      els.push(
        textEl(
          compilerId(slide.id, sub.id, "subtitle"), sub.id,
          c.x, 4.0, c.w, 1.0,
          [para(sub.text, { role: "subhead", size: t.subhead?.size ?? 15, color: design.palette.inkMuted.hex, align: "center" })],
          undefined, undefined, "center", fit,
        ),
      );
    }
    return { recipeId: "title", background: design.palette.bg.hex, elements: els };
  },

  content(slide, design, sink = []) {
    const c = box(design);
    const t = design.roles;
    const fit = fitFor(design, slide.id, sink);
    const els = [titleBlock(slide, design, c, fit)];
    const list = slide.blocks.find((b) => b.kind === "list");
    const bodySize = t.body?.size ?? 13;
    if (list?.items?.length) {
      const items = list.items.map((it) => ({ runs: [{ text: it, role: "body", size: bodySize, color: design.palette.ink.hex }], align: "left", bullet: true }));
      els.push(fittedTextEl(design, { id: compilerId(slide.id, list.id, "body"), semanticRef: list.id, box: { x: c.x, y: c.y + 1.4, w: c.w, h: c.bottom - c.y - 1.4 }, paragraphs: items, z: 10, slideId: slide.id, sink }));
    }
    return { recipeId: "content", background: design.palette.bg.hex, elements: els };
  },

  comparison(slide, design, sink = []) {
    const c = box(design);
    const t = design.roles;
    const fit = fitFor(design, slide.id, sink);
    const els = [titleBlock(slide, design, c, fit)];
    const gap = 0.4;
    const colW = (c.w - gap) / 2;
    const top = c.y + 1.4;
    const verdict = slide.blocks.find((b) => b.kind === "callout");
    const bottom = verdict ? c.bottom - 0.9 : c.bottom;
    const sides = slide.blocks.filter((b) => b.kind === "text").slice(0, 2);
    sides.forEach((b, i) => {
      const x = c.x + i * (colW + gap);
      els.push(shapeEl(compilerId(slide.id, b.id, "card"), b.id, x, top, colW, bottom - top, "roundRect", design.palette.surface.hex, 1));
      const paras = [
        ...(b.label ? [para(b.label, { role: "subhead", bold: true, size: t.subhead?.size ?? 15, color: design.palette.ink.hex })] : []),
        ...(b.text ? [para(b.text, { role: "body", size: t.body?.size ?? 13, color: design.palette.ink.hex })] : []),
      ];
      els.push(fittedTextEl(design, { id: compilerId(slide.id, b.id, "body"), semanticRef: b.id, box: { x: x + 0.3, y: top + 0.3, w: colW - 0.6, h: bottom - top - 0.6 }, paragraphs: paras, z: 10, slideId: slide.id, sink }));
    });
    if (verdict) {
      els.push(textEl(compilerId(slide.id, verdict.id, "body"), verdict.id, c.x, c.bottom - 0.8, c.w, 0.8, [para(verdict.text ?? "", { role: "body", bold: true, size: t.body?.size ?? 13, color: design.palette.accent.hex, align: "center" })], undefined, undefined, "center", fit));
    }
    return { recipeId: "comparison", background: design.palette.bg.hex, elements: els };
  },

  media(slide, design, sink = []) {
    const c = box(design);
    const t = design.roles;
    const fit = fitFor(design, slide.id, sink);
    const els = [titleBlock(slide, design, c, fit)];
    const img = slide.blocks.find((b) => b.kind === "image");
    const list = slide.blocks.find((b) => b.kind === "list" || b.kind === "text");
    const leftFirst = (slide.layoutHint?.mediaSide ?? "right") === "left";
    const gap = 0.5;
    const mediaW = c.w * 0.45;
    const textW = c.w - mediaW - gap;
    const mediaX = leftFirst ? c.x : c.x + textW + gap;
    const textX = leftFirst ? c.x + mediaW + gap : c.x;
    const top = c.y + 1.4;
    const h = c.bottom - top;
    if (img) {
      els.push({ id: compilerId(slide.id, img.id, "media"), kind: "image", x: mediaX, y: top, w: mediaW, h, z: 5, provenance: "compiler", semanticRef: img.id, image: { src: img.src ?? "", alt: img.alt ?? "" } });
    }
    if (list) {
      const bodySize = t.body?.size ?? 13;
      const paras = (list.items ?? []).map((it) => ({ runs: [{ text: it, role: "body", size: bodySize, color: design.palette.ink.hex }], align: "left", bullet: true }));
      if (list.text) paras.unshift(para(list.text, { role: "body", size: bodySize, color: design.palette.ink.hex }));
      els.push(fittedTextEl(design, { id: compilerId(slide.id, list.id, "body"), semanticRef: list.id, box: { x: textX, y: top, w: textW, h }, paragraphs: paras, z: 10, slideId: slide.id, sink }));
    }
    return { recipeId: "media", background: design.palette.bg.hex, elements: els };
  },

  chart(slide, design, sink = []) {
    const c = box(design);
    const t = design.roles;
    const fit = fitFor(design, slide.id, sink);
    const els = [titleBlock(slide, design, c, fit)];
    const chart = slide.blocks.find((b) => b.kind === "chart");
    const top = c.y + 1.4;
    if (chart) {
      els.push({ id: compilerId(slide.id, chart.id, "chart"), kind: "chart", x: c.x, y: top, w: c.w, h: c.bottom - top - (chart.caption ? 0.5 : 0), z: 5, provenance: "compiler", semanticRef: chart.id, chart: { chartKind: chart.chartKind ?? "bar", categories: chart.categories ?? [], series: chart.series ?? [] } });
      if (chart.caption) {
        els.push(textEl(compilerId(slide.id, chart.id, "caption"), chart.id, c.x, c.bottom - 0.4, c.w, 0.4, [para(chart.caption, { role: "caption", size: t.caption?.size ?? 10, color: design.palette.inkMuted.hex, align: "center" })], undefined, undefined, "center", fit));
      }
    }
    return { recipeId: "chart", background: design.palette.bg.hex, elements: els };
  },

  process(slide, design, sink = []) {
    const c = box(design);
    const t = design.roles;
    const els = [titleBlock(slide, design, c, fitFor(design, slide.id, sink))];
    const steps = slide.blocks.filter((b) => b.kind === "text").slice(0, 6);
    const gap = 0.3;
    const cardW = (c.w - gap * (steps.length - 1)) / Math.max(1, steps.length);
    const top = c.y + 1.5;
    const h = c.bottom - top;
    steps.forEach((b, i) => {
      const x = c.x + i * (cardW + gap);
      els.push(shapeEl(compilerId(slide.id, b.id, "card"), b.id, x, top, cardW, h, "roundRect", design.palette.surface.hex, 1));
      const paras = [
        para(`${i + 1}. ${b.label ?? ""}`.trim(), { role: "subhead", bold: true, size: t.subhead?.size ?? 15, color: design.palette.accent.hex }),
        ...(b.text ? [para(b.text, { role: "body", size: t.body?.size ?? 13, color: design.palette.ink.hex })] : []),
      ];
      els.push(fittedTextEl(design, { id: compilerId(slide.id, b.id, "body"), semanticRef: b.id, box: { x: x + 0.25, y: top + 0.25, w: cardW - 0.5, h: h - 0.5 }, paragraphs: paras, z: 10, slideId: slide.id, sink }));
    });
    return { recipeId: "process", background: design.palette.bg.hex, elements: els };
  },
};

export function selectRecipe(slide) {
  // Compatibility-only: the six-recipe vocabulary predates composition
  // planning. Canonical compilation goes through planDeckComposition;
  // this remains for legacy callers, demos, and historical tests.
  if (slide.layoutHint?.recipe && RECIPES[slide.layoutHint.recipe]) return slide.layoutHint.recipe;
  const kinds = new Set(slide.blocks.map((b) => b.kind));
  if (kinds.has("chart")) return "chart";
  if ((slide.blocks.filter((b) => b.kind === "text").length >= 2 && !kinds.has("list")) || kinds.has("callout")) {
    if (slide.blocks.filter((b) => b.kind === "text").length >= 2) return "comparison";
  }
  if (kinds.has("image")) return "media";
  if (slide.blocks.filter((b) => b.kind === "text").length >= 3) return "process";
  if (slide.blocks.length === 1 && slide.blocks[0].kind === "text" && !slide.blocks[0].items) return "title";
  return "content";
}

export function compileSlide(slide, design, recipe = selectRecipe(slide), sink = []) {
  // Compatibility-only legacy path: independent six-recipe selection.
  // Canonical deck compilation uses compilePlannedSlide via the plan.
  const built = RECIPES[recipe](slide, design, sink);
  return {
    id: slide.id,
    width: SCENE_W,
    height: SCENE_H,
    background: { fill: built.background },
    elements: built.elements,
    layoutState: "managed",
    recipeId: built.recipeId,
  };
}

export function compileDeck(intent, design, chrome = null) {
  return compileDeckDetailed(intent, design, chrome).scenes;
}

export function compileDeckDetailed(intent, design, chrome = null) {
  const { plan, findings } = planDeckComposition(intent, design);
  // Chrome is planned once, from adapter input, beside composition —
  // never replanned inside QA or rendering.
  const chromePlan = planDeckChrome(intent.slides, chrome);
  const byId = new Map(plan.slides.map((s) => [s.slideId, s]));
  // One pass only: each slide compiles once, diagnostics collected in
  // emission order (slide order, then element order within a slide).
  const fitDiagnostics = [];
  const scenes = intent.slides.map((s) =>
    compilePlannedSlide(s, byId.get(s.id), design, fitDiagnostics, chromePlanForSlide(chromePlan, s.id)));
  return { scenes, plan, chromePlan, findings, fitDiagnostics };
}

// Recompile after a semantic edit while preserving human geometry.
// - detached: scene is authoritative, returned untouched.
// - exact element IDs match first (stable across family changes);
//   otherwise a unique compatible semanticRef + kind match preserves
//   customized geometry without ambiguity.
// - human-added elements (no regenerated id) survive appended on top.
// Deck-aware callers pass the current SlideCompositionPlan so rhythm
// context survives; compatibility callers omit it and recompile through
// the legacy six-recipe path with the same preservation rules.
export function recompileSlide(intent, prev, design, planned = null, sink = [], chrome = null) {
  if (prev.layoutState === "detached") return prev;
  // Chrome reflow requires the canonical planned path (reserve +
  // emission live there). The frozen legacy path cannot honor it, so
  // supplying chrome without a plan fails loudly instead of silently
  // dropping institutional marks.
  if (chrome && !planned) {
    throw new Error("recompileSlide with chrome requires the canonical planned path (pass planned)");
  }
  const fresh = planned
    ? compilePlannedSlide(intent, planned, design, sink, chromePlanForSlide(planDeckChrome({ slides: [intent] }, chrome), intent.id))
    : compileSlide(intent, design, undefined, sink);
  const prevById = new Map(prev.elements.map((e) => [e.id, e]));
  const usedPrev = new Set();
  const findPrev = (el) => {
    const exact = prevById.get(el.id);
    if (exact && !usedPrev.has(exact.id)) {
      usedPrev.add(exact.id);
      return exact;
    }
    if (el.semanticRef !== undefined) {
      const cands = prev.elements.filter(
        (e) => !usedPrev.has(e.id) && e.semanticRef === el.semanticRef && e.kind === el.kind,
      );
      if (cands.length === 1) {
        usedPrev.add(cands[0].id);
        return cands[0];
      }
    }
    return null;
  };
  for (const el of fresh.elements) {
    const p = findPrev(el);
    if (p?.customized) {
      el.x = p.x;
      el.y = p.y;
      el.w = p.w;
      el.h = p.h;
      if (p.rotation !== undefined) el.rotation = p.rotation;
      el.customized = true;
      el.provenance = "human";
      // Compiler-owned fitting is re-evaluated against the PRESERVED
      // geometry, never the discarded fresh box: shrink-only from the
      // current sizes, so a larger human box keeps readable text and a
      // smaller box (or longer text) shrinks further or diagnoses.
      if (el.kind === "text") refitTextEl(design, el, intent.id ?? prev.id, sink);
    }
  }
  const freshIds = new Set(fresh.elements.map((e) => e.id));
  const orphans = prev.elements.filter(
    (e) => !freshIds.has(e.id) && e.provenance !== "compiler" && !e.semanticRef,
  );
  fresh.elements.push(...orphans.map((e) => ({ ...e, z: fresh.elements.length })));
  const anyCustom = fresh.elements.some((e) => e.customized) || orphans.length > 0;
  fresh.layoutState = prev.layoutState === "customized" || anyCustom ? "customized" : "managed";
  if (prev.recipeId !== fresh.recipeId && prev.layoutState === "customized") {
    // A recipe change under custom edits keeps the human geometry where ids
    // still match; genuinely new regions compile fresh. Nothing is dropped
    // silently: orphans above carry human-only additions forward.
  }
  return fresh;
}

export { findElement };
