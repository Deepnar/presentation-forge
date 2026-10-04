// @forge/renderer-pptx — SlideScene -> editable native PPTX. Consumes the
// SAME scene representation as the browser editor (hard invariant 4): every
// element kind both renderers understand must round-trip, and text/charts/
// tables must survive as editable OOXML, never raster.

import pptxgen from "pptxgenjs";

const CHART_TYPE = { bar: "bar", hbar: "bar", line: "line", pie: "pie", doughnut: "doughnut", area: "area" };

function addTextElement(slide, el) {
  // pptxgenjs takes a flat run list; a paragraph break is breakLine on the
  // run that ends the paragraph. Bullet/align live on the paragraph's runs.
  const runs = [];
  const paras = el.paragraphs ?? [];
  paras.forEach((p, pi) => {
    (p.runs ?? []).forEach((r, ri) => {
      runs.push({
        text: r.text,
        options: {
          bold: r.bold,
          italic: r.italic,
          fontSize: r.size,
          color: r.color,
          align: ri === 0 ? (p.align ?? "left") : undefined,
          bullet: ri === 0 ? (p.bullet ? { code: "2022" } : false) : undefined,
          breakLine: ri === p.runs.length - 1 && pi < paras.length - 1,
        },
      });
    });
  });
  if (!runs.length) return;
  slide.addText(runs, { x: el.x, y: el.y, w: el.w, h: el.h, valign: "top", margin: 0.05 });
}

function addShapeElement(slide, el) {
  const form = { rect: "rect", roundRect: "roundRect", ellipse: "ellipse" }[el.shape?.form ?? "rect"];
  slide.addShape(form, {
    x: el.x, y: el.y, w: el.w, h: el.h,
    fill: { color: el.shape?.fill ?? "FFFFFF" },
    line: el.shape?.stroke ? { color: el.shape.stroke, width: el.shape.strokeWidth ?? 1 } : { type: "none" },
  });
}

function addImageElement(slide, el) {
  if (!el.image?.src) {
    slide.addShape("rect", { x: el.x, y: el.y, w: el.w, h: el.h, fill: { color: "D8D8D2" }, line: { type: "none" } });
    slide.addText([{ text: "[image]", options: { align: "center", color: "5C5C59" } }], { x: el.x, y: el.y + el.h / 2 - 0.2, w: el.w, h: 0.4 });
    return;
  }
  slide.addImage({ path: el.image.src, x: el.x, y: el.y, w: el.w, h: el.h, sizing: { type: "cover", w: el.w, h: el.h } });
}

function addChartElement(slide, el) {
  const c = el.chart;
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

function addTableElement(slide, el) {
  const rows = (el.table?.rows ?? []).map((row) =>
    row.map((cell) => ({ text: cell, options: { fontSize: 10 } })),
  );
  if (!rows.length) return;
  slide.addTable(rows, { x: el.x, y: el.y, w: el.w, h: el.h, border: { pt: 0.5, color: "D8D8D2" } });
}

function addLineElement(slide, el) {
  const flipV = (el.line.y2 ?? el.y) < el.y;
  const flipH = (el.line.x2 ?? el.x) < el.x;
  slide.addShape("line", {
    x: Math.min(el.x, el.line.x2 ?? el.x),
    y: Math.min(el.y, el.line.y2 ?? el.y),
    w: Math.abs((el.line.x2 ?? el.x) - el.x) || 0.01,
    h: Math.abs((el.line.y2 ?? el.y) - el.y) || 0.01,
    line: { color: el.line.stroke ?? "888888", width: el.line.strokeWidth ?? 1.5 },
    flipV, flipH,
  });
}

function drawElement(slide, el, dx = 0, dy = 0) {
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

export async function renderScenesToFile(scenes, outPath) {
  const pres = new pptxgen();
  pres.defineLayout({ name: "V2", width: scenes[0]?.width ?? 13.333, height: scenes[0]?.height ?? 7.5 });
  pres.layout = "V2";
  for (const scene of scenes) {
    const slide = pres.addSlide();
    slide.background = { color: scene.background.fill };
    const els = [...scene.elements].sort((a, b) => a.z - b.z);
    for (const el of els) drawElement(slide, el);
  }
  await pres.writeFile({ fileName: outPath });
  return outPath;
}
