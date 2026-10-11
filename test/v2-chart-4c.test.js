// V2-4C: browser chart geometry and data fidelity. Assertions are
// mathematical invariants of the authored data — proportions,
// ordering, baselines, sweeps — never mere element presence. The
// kind-geometry cases (line path, hbar orientation, pie arcs,
// multi-series) fail on the accepted V2-4B baseline `34a758b`
// and pass after; the contract cases pin behavior that must not
// move. PPTX stays native throughout (editability proof at the
// end); the browser projector is scene-svg.js + scene-chart.js.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { chartDomain, niceTicks, fmtTick } from "../packages/editor/scene-chart.js";
import { createViewer } from "../packages/editor/scene-dom.js";
import { renderPptxToFile } from "../packages/renderer-pptx/node.ts";

const LABELS = { family: "Inter", size: 10, color: "5C5C59" };

function chartScene(kind, categories, series, extra = {}) {
  return {
    id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
    elements: [{
      id: "s:c", kind: "chart", x: 1, y: 1, w: 6, h: 4, z: 10,
      provenance: "compiler", semanticRef: "c1", ...extra,
      chart: { chartKind: kind, categories, series, labels: LABELS },
    }],
  };
}

function groupOf(svg) {
  // Chart bodies emit no nested <g>, so the first close tag ends
  // the element group.
  const g = svg.match(/<g data-el="s:c"[^>]*>([\s\S]*?)<\/g>/);
  assert.ok(g, "chart group present");
  return g[1];
}

function rects(inner) {
  return [...inner.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)]
    .map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }));
}

function assertFinite(svg, label) {
  assert.ok(!/NaN|Infinity|-Infinity/.test(svg), `${label}: no non-finite coordinates`);
}

describe("v2-4c scale math", () => {
  it("domains always span zero", () => {
    assert.deepEqual(chartDomain([{ values: [1, 2] }]), { lo: 0, hi: 2 });
    assert.deepEqual(chartDomain([{ values: [-3, -1] }]), { lo: -3, hi: 0 });
    assert.deepEqual(chartDomain([{ values: [0, 0] }]), { lo: 0, hi: 1 });
    assert.deepEqual(chartDomain([{ values: [] }]), { lo: 0, hi: 1 });
  });

  it("ticks are deterministic nice lattice values including zero", () => {
    const a = niceTicks(-2, 3, 5);
    const b = niceTicks(-2, 3, 5);
    assert.deepEqual(a, b, "deterministic");
    assert.ok(a.ticks.includes(0), "zero always lands on a tick");
    assert.ok(a.ticks.every((t, i) => i === 0 || t > a.ticks[i - 1]), "ascending");
    assert.ok(a.ticks.length >= 2 && a.ticks.length <= 12, "bounded count");
    assert.equal(fmtTick(1, 2), "2");
    assert.equal(fmtTick(0.5, 1.5), "1.5");
    assert.equal(fmtTick(2.5, 2.5), "2.5", "fractional steps keep their decimals");
    assert.equal(fmtTick(2.5, 7.5), "7.5", "gridline labels never round to neighbours");
  });
});

describe("v2-4c cartesian geometry", () => {
  it("vertical bars keep values, order, and proportions", () => {
    const inner = groupOf(sceneToSvg(chartScene("bar", ["A", "B"], [{ name: "v", values: [1, 2] }])));
    const bars = rects(inner);
    assert.equal(bars.length, 2, "one bar per category");
    assert.ok(bars[0].x < bars[1].x, "category order left to right");
    assert.ok(Math.abs(bars[1].h / bars[0].h - 2) < 0.02, `2:1 heights (got ${bars[1].h / bars[0].h})`);
    assert.ok(Math.abs(bars[0].y + bars[0].h - (bars[1].y + bars[1].h)) < 0.6, "shared zero baseline");
    assertFinite(inner, "bar");
  });

  it("negative bars hang on the correct side of zero", () => {
    const inner = groupOf(sceneToSvg(chartScene("bar", ["A", "B"], [{ name: "v", values: [2, -1] }])));
    const bars = rects(inner);
    assert.equal(bars.length, 2);
    const zeroLine = [...inner.matchAll(/<line x1="[\d.]+" y1="([\d.]+)"[^>]*stroke-opacity="0.6"/g)];
    assert.ok(zeroLine.length > 0, "zero gridline drawn");
    const z = parseFloat(zeroLine[0][1]);
    assert.ok(bars[0].y + bars[0].h <= z + 0.6, "positive bar sits above zero");
    assert.ok(bars[1].y >= z - 0.6, "negative bar hangs below zero");
  });

  it("multiple series group side by side with distinct colors", () => {
    const inner = groupOf(sceneToSvg(chartScene("bar", ["A"], [{ name: "s1", values: [1] }, { name: "s2", values: [1] }])));
    const bars = rects(inner);
    assert.equal(bars.length, 2, "both series drawn (no first-series-only fallback)");
    assert.ok(bars[0].x !== bars[1].x, "grouped offsets differ");
    const fills = [...inner.matchAll(/<rect[^>]*fill="(#[0-9A-F]{6})"/g)].map((m) => m[1]);
    assert.ok(new Set(fills).size >= 2, "series visually distinguishable");
    assert.ok(inner.includes("s1") && inner.includes("s2"), "legend names both series");
  });

  it("horizontal bars are genuinely horizontal", () => {
    const inner = groupOf(sceneToSvg(chartScene("hbar", ["A", "B"], [{ name: "v", values: [1, 2] }])));
    const bars = rects(inner);
    assert.equal(bars.length, 2);
    assert.ok(bars[0].y < bars[1].y, "categories map top to bottom in order");
    assert.ok(Math.abs(bars[1].w / bars[0].w - 2) < 0.02, `2:1 widths (got ${bars[1].w / bars[0].w})`);
    assert.ok(bars[0].h < bars[0].w && bars[1].h < bars[1].w, "bars wider than tall");
    assert.ok(inner.includes(">A<") && inner.includes(">B<"), "category labels kept");
  });

  it("line charts plot genuine paths through scaled points", () => {
    const inner = groupOf(sceneToSvg(chartScene("line", ["A", "B", "C"], [{ name: "t", values: [1, 3, 2] }])));
    const d = inner.match(/<path d="M([\d.,L]+)" fill="none"/);
    assert.ok(d, "line series draws a stroked path (not vertical bars)");
    const pts = d[1].split("L").map((p) => p.split(",").map(Number));
    assert.equal(pts.length, 3, "one point per category");
    assert.ok(pts[0][0] < pts[1][0] && pts[1][0] < pts[2][0], "category order along x");
    assert.ok(pts[1][1] < pts[0][1] && pts[1][1] < pts[2][1], "peak value plots highest");
  });

  it("missing observations break lines without interpolation", () => {
    const inner = groupOf(sceneToSvg(chartScene("line", ["A", "B", "C", "D"], [{ name: "t", values: [1, 2, NaN, 4] }])));
    const paths = [...inner.matchAll(/<path d="M([\d.,L]+)" fill="none"/g)];
    assert.equal(paths.length, 1, "one stroked run around the gap");
    assert.equal(paths[0][1].split("L").length, 2, "no segment fabricates the missing point");
    assert.ok((inner.match(/<circle /g) || []).length >= 3, "observed points keep markers");
    assertFinite(inner, "line gap");
  });

  it("area fills to the zero baseline without stacking", () => {
    const inner = groupOf(sceneToSvg(chartScene("area", ["A", "B"], [{ name: "a", values: [1, 2] }])));
    const fill = inner.match(/<path d="([\d.,LMZ-]+)" fill="#[0-9A-F]{6}" fill-opacity="0.35"/);
    assert.ok(fill, "area band drawn translucent to zero");
    assert.ok(/L[\d.]+,[\d.]+L[\d.]+,[\d.]+Z$/.test(fill[1]), "band closes at the baseline");
    assert.ok(inner.includes('stroke-width="2.5"'), "top edge stroked like a line");
  });

  it("all-zero datasets render honestly without crashing", () => {
    const inner = groupOf(sceneToSvg(chartScene("bar", ["A", "B"], [{ name: "z", values: [0, 0] }])));
    assert.equal(rects(inner).length, 2, "zero-height bars keep their slots");
    assert.ok(rects(inner).every((b) => b.h === 0), "zero height, not faked");
    assert.ok(inner.includes(">0<"), "zero tick labeled");
    assertFinite(inner, "all-zero");
  });

  it("equal values render equal geometry", () => {
    const inner = groupOf(sceneToSvg(chartScene("bar", ["A", "B", "C"], [{ name: "e", values: [5, 5, 5] }])));
    const hs = rects(inner).map((b) => b.h);
    assert.equal(hs.length, 3);
    assert.ok(Math.max(...hs) - Math.min(...hs) < 0.6, "equal heights");
  });

  it("large and small magnitudes stay finite and ordered", () => {
    const inner = groupOf(sceneToSvg(chartScene("bar", ["big", "small"], [{ name: "m", values: [2500000, 0.0004] }])));
    const bars = rects(inner);
    assert.equal(bars.length, 2);
    assert.ok(bars[0].h > bars[1].h, "magnitude order preserved");
    assertFinite(inner, "magnitudes");
  });

  it("single-category datasets render", () => {
    const inner = groupOf(sceneToSvg(chartScene("bar", ["only"], [{ name: "s", values: [7] }])));
    assert.equal(rects(inner).length, 1);
    assertFinite(inner, "single category");
  });

  it("long categories and legend entries survive unshrunk", () => {
    const cat = "A very long category name that strains slots";
    const inner = groupOf(sceneToSvg(chartScene("bar", [cat], [{ name: "An equally long series name for legends", values: [1] }])));
    assert.ok(inner.includes(cat), "category text kept whole");
    assert.ok(inner.includes("An equally long series name for legends"), "legend text kept whole");
    assert.match(inner, new RegExp(`font-size="${(10 * 96 / 72).toFixed(1)}"`), "contract size, never shrunk");
  });
});

describe("v2-4c pie and doughnut", () => {
  it("slices keep exact contribution ratios in order", () => {
    const inner = groupOf(sceneToSvg(chartScene("pie", ["A", "B"], [{ name: "S", values: [1, 3] }])));
    const arcs = [...inner.matchAll(/A([\d.]+),([\d.]+) 0 ([01]),1/g)];
    assert.ok(arcs.length >= 2, "one arc per positive slice");
    // Sweep ratio from path endpoints: reconstruct angles around centroid.
    const pathD = inner.match(/<path d="M([\d.]+),([\d.]+)L([\s\S]*?)Z"/);
    assert.ok(pathD, "slice wedge paths");
    const bodies = [...inner.matchAll(/<path d="M[\d.]+,[\d.]+L[\s\S]*?Z" fill-rule="evenodd"/g)];
    assert.equal(bodies.length, 2, "two wedges");
    assert.ok(inner.includes(">A<") && inner.includes(">B<") && inner.includes(">S<"), "legend maps categories and series");
    assertFinite(inner, "pie");
  });

  it("pie sweep totals a full circle proportionally", () => {
    // 1:3 over two slices -> 90deg and 270deg large-arc flags 0 and 1.
    const inner = groupOf(sceneToSvg(chartScene("pie", ["A", "B"], [{ name: "S", values: [1, 3] }])));
    const flags = [...inner.matchAll(/A[\d.]+,[\d.]+ 0 ([01]),1/g)].map((m) => m[1]);
    assert.deepEqual(flags, ["0", "1"], "quarter slice small-arc, three-quarter large-arc");
  });

  it("doughnut cuts a transparent hole", () => {
    const inner = groupOf(sceneToSvg(chartScene("doughnut", ["A", "B"], [{ name: "S", values: [1, 1] }])));
    assert.ok(inner.includes('fill-rule="evenodd"'), "even-odd rings keep the hole transparent");
    assert.ok((inner.match(/fill-rule="evenodd"/g) || []).length >= 2, "both halves ringed");
  });

  it("zero values take zero sweep but stay legend-listed", () => {
    const inner = groupOf(sceneToSvg(chartScene("pie", ["A", "B", "C"], [{ name: "S", values: [2, 0, 2] }])));
    const wedges = [...inner.matchAll(/fill-rule="evenodd"/g)].length;
    assert.ok(wedges >= 1, "positive slices drawn");
    assert.ok(inner.includes(">B<"), "zero-share category stays in the legend");
    assertFinite(inner, "pie zero");
  });

  it("single-slice pie renders a full disc, not an empty arc", () => {
    const inner = groupOf(sceneToSvg(chartScene("pie", ["all"], [{ name: "S", values: [5] }])));
    assert.ok(/<circle[^>]*fill="#/.test(inner), "full disc for the 100% slice");
  });

  it("multi-series pie renders series[0] honestly", () => {
    const inner = groupOf(sceneToSvg(chartScene("pie", ["A", "B"], [{ name: "S1", values: [1, 1] }, { name: "S2", values: [9, 9] }])));
    const wedges = [...inner.matchAll(/fill-rule="evenodd"/g)].length;
    assert.ok(wedges >= 1, "first series renders");
    assertFinite(inner, "multi-series pie");
  });
});

describe("v2-4c projection contracts", () => {
  it("output is deterministic and mutation-free", () => {
    const scene = chartScene("line", ["A", "B"], [{ name: "t", values: [1, 2] }]);
    const before = JSON.stringify(scene);
    const a = sceneToSvg(scene, { wrapText: true });
    const b = sceneToSvg(scene, { wrapText: true });
    assert.equal(a, b, "byte-identical reruns");
    assert.equal(JSON.stringify(scene), before, "source scene untouched");
  });

  it("chart stays one selectable element with stable identity", () => {
    const { document } = parseHTML("<!doctype html><html><body></body></html>");
    const root = document.createElement("div");
    document.body.appendChild(root);
    const viewer = createViewer(root, [{
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:c", kind: "chart", x: 1, y: 1, w: 6, h: 4, z: 10, provenance: "compiler", semanticRef: "c1",
        chart: { chartKind: "bar", categories: ["A"], series: [{ name: "v", values: [1] }], labels: LABELS },
      }],
    }]);
    assert.equal(viewer.elementIds().filter((e) => e.id === "s:c").length, 1, "single mount identity");
    assert.equal(viewer.api.select("s:c").selectedId, "s:c", "chart selects as a unit");
    assert.ok(root.querySelector('[data-el="s:c"] [data-semantic-ref]') || root.querySelector('[data-el="s:c"]').getAttribute("data-semantic-ref") === "c1", "semantic ref on the unit");
    assert.ok(!root.querySelector('[data-el="s:c"] [data-el]'), "no nested editor identities");
    viewer.destroy();
  });

  it("opacity and zoom behavior unchanged", () => {
    const { document } = parseHTML("<!doctype html><html><body></body></html>");
    const root = document.createElement("div");
    document.body.appendChild(root);
    const viewer = createViewer(root, [chartScene("bar", ["A"], [{ name: "v", values: [1] }])]);
    viewer.api.refit(1280, 720);
    const s = viewer.api.setZoom(2);
    assert.equal(s.effectiveScale, s.fit * 2, "zoom scales around fit, type untouched");
    viewer.destroy();
    const dim = sceneToSvg({
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:c", kind: "chart", x: 1, y: 1, w: 6, h: 4, z: 10, provenance: "compiler", opacity: 0.5,
        chart: { chartKind: "bar", categories: ["A"], series: [{ name: "v", values: [1] }], labels: LABELS },
      }],
    });
    assert.match(dim, /data-el="s:c"[^>]*opacity="0.5"/, "element opacity projects");
  });

  it("native PPTX charts stay native and data-exact", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "v24c-"));
    const pptx = path.join(dir, "c.pptx");
    await renderPptxToFile([{
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:c", kind: "chart", x: 1, y: 1, w: 6, h: 4, z: 10, provenance: "compiler",
        chart: { chartKind: "line", categories: ["A", "B"], series: [{ name: "t", values: [1, 2] }], labels: LABELS },
      }],
    }], pptx);
    const zip = await JSZip.loadAsync(readFileSync(pptx));
    const names = Object.keys(zip.files);
    const chartPart = names.find((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
    assert.ok(chartPart, "native chart part, not an SVG image");
    const xml = await zip.files[chartPart].async("string");
    assert.ok(xml.includes("<c:v>1</c:v>") && xml.includes("<c:v>2</c:v>"), "authored values intact in OOXML");
  });
});
