// @forge/core-adjacent @forge/renderer-pptx — canonical SlideScene to
// editable PPTX bytes. Consumes the SAME scene representation as the
// browser editor (hard invariant): text/charts/tables survive as editable
// OOXML, never raster. Chrome arrives as ordinary locked scene
// elements; the renderer projects them like any other element and
// never plans chrome itself. In-memory only: no output path, no
// filesystem write. The Node-only file adapter lives in node.ts.
//
// Scene fields without a PPTX projection yet (rotation,
// locked/provenance as metadata) are preserved in the scene for
// editor/seed use; V2-5 extends fidelity when those gain real
// compiler/editor consumers. Image src stays the current
// path/URL-style asset seam (see node.ts and the V2-2D report).

import PptxGenJSModule from "pptxgenjs";
import type { SlideScene, SceneElement } from "../model/scene.generated.ts";
import { runBold, visibleText } from "../core/text-run.ts";

// The library's default-export typing does not expose its constructor
// under nodenext module resolution. This narrow structural interface
// covers exactly the surface the renderer uses; the single cast below
// is the only boundary concession, and slide-shape methods stay loosely
// typed because pptxgenjs itself types them as Function.
interface PptxSlide {
  background: unknown;
  addText(...args: unknown[]): void;
  addShape(...args: unknown[]): void;
  addImage(...args: unknown[]): void;
  addChart(...args: unknown[]): void;
  addTable(...args: unknown[]): void;
}

interface PptxPresentation {
  layout: string;
  title: string;
  author: string;
  subject: string;
  company: string;
  revision: string;
  defineLayout(opts: { name: string; width: number; height: number }): void;
  addSlide(): PptxSlide;
  write(opts: { outputType: "uint8array" }): Promise<unknown>;
}

const PptxGenJS = PptxGenJSModule as unknown as new () => PptxPresentation;

export interface PptxRenderOptions {
  title?: string;
  author?: string;
  subject?: string;
  company?: string;
  revision?: string;
}

const CHART_TYPE: Record<string, string> = {
  bar: "bar", hbar: "bar", line: "line", pie: "pie", doughnut: "doughnut", area: "area",
};

function addTextElement(slide: PptxSlide, el: SceneElement): void {
  // pptxgenjs takes a flat run list; a paragraph break is breakLine on the
  // run that ends the paragraph. Bullet/align live on the paragraph's runs.
  // Resolved Layer C typography projects verbatim: family -> fontFace,
  // tracking (points) -> charSpacing (points), line ratio -> lineSpacing
  // (points, the same size*line product the legacy textStyle helper
  // uses), transform -> visible uppercase text. Never autoFit: final
  // sizes are baked into the scene by the compiler fitter.
  const runs: { text: string; options: Record<string, unknown> }[] = [];
  const paras = el.paragraphs ?? [];
  paras.forEach((p, pi) => {
    (p.runs ?? []).forEach((r, ri) => {
      const size = r.size ?? 12;
      const options: Record<string, unknown> = {
        bold: runBold(r),
        italic: r.italic,
        fontSize: size,
        color: r.color,
        align: ri === 0 ? (p.align ?? "left") : undefined,
        bullet: ri === 0 ? (p.bullet ? { code: "2022" } : false) : undefined,
        breakLine: ri === p.runs.length - 1 && pi < paras.length - 1,
      };
      if (r.family) options.fontFace = r.family;
      if (r.tracking) options.charSpacing = r.tracking;
      if (r.line) options.lineSpacing = Math.round(size * r.line * 10) / 10;
      runs.push({ text: visibleText(r), options });
    });
  });
  if (!runs.length) return;
  // Element opacity projects to PptxGenJS transparency, the same
  // mapping the legacy chrome facade uses: round((1 - opacity) * 100).
  // Fully opaque or absent opacity omits the property, preserving the
  // legacy slide-number behavior (no transparency key at all).
  slide.addText(runs, {
    x: el.x, y: el.y, w: el.w, h: el.h,
    valign: el.valign ?? "top", margin: 0.05,
    ...(el.opacity !== undefined && el.opacity < 1
      ? { transparency: Math.round((1 - el.opacity) * 100) }
      : {}),
  });
}

function addShapeElement(slide: PptxSlide, el: SceneElement): void {
  const form = { rect: "rect", roundRect: "roundRect", ellipse: "ellipse" }[el.shape?.form ?? "rect"];
  slide.addShape(form, {
    x: el.x, y: el.y, w: el.w, h: el.h,
    fill: { color: el.shape?.fill ?? "FFFFFF" },
    line: el.shape?.stroke ? { color: el.shape.stroke, width: el.shape.strokeWidth ?? 1 } : { type: "none" },
  });
}

function addImageElement(slide: PptxSlide, el: SceneElement): void {
  if (!el.image?.src) {
    slide.addShape("rect", { x: el.x, y: el.y, w: el.w, h: el.h, fill: { color: "D8D8D2" }, line: { type: "none" } });
    slide.addText([{ text: "[image]", options: { align: "center", color: "5C5C59" } }], { x: el.x, y: el.y + el.h / 2 - 0.2, w: el.w, h: 0.4 });
    return;
  }
  // Renderer-ready asset seam: the scene carries what the adapter
  // resolved. Data URIs ride the PptxGenJS data path; everything else
  // rides the path as before. Nothing is fetched, probed, or read
  // here beyond what PptxGenJS itself embeds.
  const at = { x: el.x, y: el.y, w: el.w, h: el.h, sizing: { type: "cover", w: el.w, h: el.h } };
  if (/^data:/i.test(el.image.src)) {
    slide.addImage({ data: el.image.src, ...at });
    return;
  }
  slide.addImage({ path: el.image.src, ...at });
}

function addChartElement(slide: PptxSlide, el: SceneElement): void {
  const c = el.chart;
  if (!c) return;
  const data = (c.series ?? []).map((s) => ({ name: s.name, labels: c.categories, values: s.values }));
  if (!data.length) return;
  slide.addChart(
    CHART_TYPE[c.chartKind] ?? "bar",
    data,
    {
      x: el.x, y: el.y, w: el.w, h: el.h,
      barDir: c.chartKind === "hbar" ? "bar" : "col",
      showTitle: false, showLegend: true,
    },
  );
}

function addTableElement(slide: PptxSlide, el: SceneElement): void {
  const table = el.table;
  const rows = table?.rows ?? [];
  if (!rows.length) return;
  const layout = table?.layout;
  if (!layout) {
    // Pre-contract scenes keep their historical rendering exactly.
    const legacy = rows.map((row) =>
      row.map((cell) => ({ text: cell, options: { fontSize: 10 } })),
    );
    slide.addTable(legacy, { x: el.x, y: el.y, w: el.w, h: el.h, border: { pt: 0.5, color: "D8D8D2" } });
    return;
  }
  const body = rows.map((row, ri) => {
    const isHeader = !!table?.header && ri === 0;
    return row.map((cell) => ({
      text: cell,
      options: {
        fontSize: isHeader ? (layout.headerSize ?? 10) : (layout.bodySize ?? 10),
        ...(layout.fontFamily ? { fontFace: layout.fontFamily } : {}),
        color: isHeader ? (layout.headerColor ?? "000000") : (layout.bodyColor ?? "000000"),
        bold: isHeader ? (layout.headerBold ?? true) : false,
        ...(isHeader && layout.headerFill ? { fill: { color: layout.headerFill } } : {}),
      },
    }));
  });
  slide.addTable(body, {
    x: el.x, y: el.y, w: el.w, h: el.h,
    ...(layout.rowHeights?.length ? { rowH: layout.rowHeights } : {}),
    border: { pt: 0.5, color: layout.gridColor ?? "D8D8D2" },
    ...(layout.padding !== undefined ? { margin: layout.padding } : {}),
  });
}

function addLineElement(slide: PptxSlide, el: SceneElement): void {
  const line = el.line ?? { x2: el.x, y2: el.y };
  const flipV = (line.y2 ?? el.y) < el.y;
  const flipH = (line.x2 ?? el.x) < el.x;
  slide.addShape("line", {
    x: Math.min(el.x, line.x2 ?? el.x),
    y: Math.min(el.y, line.y2 ?? el.y),
    w: Math.abs((line.x2 ?? el.x) - el.x) || 0.01,
    h: Math.abs((line.y2 ?? el.y) - el.y) || 0.01,
    line: { color: line.stroke ?? "888888", width: line.strokeWidth ?? 1.5 },
    flipV, flipH,
  });
}

function drawElement(slide: PptxSlide, el: SceneElement, dx = 0, dy = 0): void {
  const at = { ...el, x: el.x + dx, y: el.y + dy };
  switch (el.kind) {
    case "text": addTextElement(slide, at); break;
    case "shape": addShapeElement(slide, at); break;
    case "image": addImageElement(slide, at); break;
    case "chart": addChartElement(slide, at); break;
    case "table": addTableElement(slide, at); break;
    case "line": addLineElement(slide, at); break;
    case "group":
      for (const c of el.group?.children ?? []) drawElement(slide, { ...c, x: c.x + at.x, y: c.y + at.y });
      break;
    default: break;
  }
}

export async function renderPptx(
  scenes: readonly SlideScene[],
  options: PptxRenderOptions = {},
): Promise<Uint8Array> {
  if (!scenes.length) throw new Error("renderPptx requires at least one scene");
  const pres = new PptxGenJS();
  pres.defineLayout({ name: "V2", width: scenes[0].width, height: scenes[0].height });
  pres.layout = "V2";
  if (options.title !== undefined) pres.title = options.title;
  if (options.author !== undefined) pres.author = options.author;
  if (options.subject !== undefined) pres.subject = options.subject;
  if (options.company !== undefined) pres.company = options.company;
  if (options.revision !== undefined) pres.revision = options.revision;
  for (const scene of scenes) {
    const slide = pres.addSlide();
    slide.background = { color: scene.background.fill };
    const els = [...scene.elements].sort((a, b) => a.z - b.z);
    for (const el of els) drawElement(slide, el);
  }
  const out = await pres.write({ outputType: "uint8array" });
  if (!(out instanceof Uint8Array)) {
    throw new Error(`renderPptx expected uint8array output, received ${typeof out}`);
  }
  return out;
}
