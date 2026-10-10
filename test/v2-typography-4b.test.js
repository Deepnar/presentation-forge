// V2-4B: shared typography calibration. Every assertion here is a
// projection contract — scene points to browser pixels — verified
// against PPTX rasters in docs/V2-4B-EVAL.md. The F1 (first
// baseline) and F2 (pt->px scale) cases fail on the accepted V2-4A
// baseline `c5b564a` and pass after the correction; the rest pin
// the behavior that must not move with it.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { createViewer } from "../packages/editor/scene-dom.js";
import { renderPptxToFile } from "../packages/renderer-pptx/node.ts";

const PT = 96 / 72;

function firstTextY(svg, elId) {
  const g = svg.match(new RegExp(`<g data-el="${elId}"[^>]*>([\\s\\S]*?)<\\/g>`));
  assert.ok(g, `${elId} projected`);
  const m = g[1].match(/<text[^>]* y="([\d.]+)"[^>]* font-size="([\d.]+)"/);
  assert.ok(m, `${elId} first line found`);
  return { y: parseFloat(m[1]), size: parseFloat(m[2]) };
}

function textOf(svg) {
  return [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).join("\n");
}

describe("v2-4b point-to-pixel conversion", () => {
  it("scene points convert at 96/72 across roles", () => {
    const cases = [
      ["eyebrow", 10, "Inter"], ["body", 13, "Inter"],
      ["title", 40, "Merriweather"], ["metric", 54, "Merriweather"],
      ["caption", 9, "Inter"],
    ];
    for (const [role, pt, family] of cases) {
      const svg = sceneToSvg({
        id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
        elements: [{
          id: "s:t", kind: "text", x: 1, y: 1, w: 6, h: 2, z: 10, provenance: "compiler",
          paragraphs: [{ runs: [{ text: "Ag", role, family, size: pt, color: "111111" }] }],
        }],
      });
      const expect = (pt * PT).toFixed(1);
      assert.match(svg, new RegExp(`font-size="${expect.replace(".", "\\.")}"`), `${role} ${pt}pt -> ${expect}px`);
    }
  });

  it("tables and chart labels use the same conversion", () => {
    const svg = sceneToSvg({
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [
        {
          id: "s:tab", kind: "table", x: 1, y: 1, w: 6, h: 2, z: 10, provenance: "compiler",
          table: {
            rows: [["h", "h"], ["b", "b"]], header: true,
            layout: { colWidths: [3, 3], rowHeights: [0.4, 0.4], headerSize: 10, bodySize: 10, padding: 0.05 },
          },
        },
        {
          id: "s:ch", kind: "chart", x: 1, y: 4, w: 6, h: 3, z: 11, provenance: "compiler",
          chart: { chartKind: "bar", categories: ["A"], series: [{ name: "v", values: [1] }], labels: { size: 10, color: "5C5C59" } },
        },
      ],
    });
    const expect = (10 * PT).toFixed(1).replace(".", "\\.");
    const header = svg.match(new RegExp(`<g data-el="s:tab"[\\s\\S]*?<text[^>]* font-size="(${expect})"`));
    assert.ok(header, `table 10pt -> ${10 * PT}px`);
    assert.match(svg, new RegExp(`<g data-el="s:ch"[\\s\\S]*?font-size="${expect}"`), "chart labels convert identically");
  });
});

describe("v2-4b first-line baseline", () => {
  it("large display type stays inside its box top (F1)", () => {
    // st-measured-s1:content at y=2.32 carries 54pt/72px type; the
    // fixed +14px baseline put glyph tops ~36px above the box.
    const svg = sceneToSvg({
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:m", kind: "text", x: 1, y: 2.32, w: 6, h: 1.758, z: 10, provenance: "compiler",
        paragraphs: [{ runs: [{ text: "26/26", role: "metric", family: "Merriweather", weight: 900, size: 54, line: 1, color: "111111" }] }],
      }],
    });
    const { y, size } = firstTextY(svg, "s:m");
    const boxTop = 2.32 * 96;
    // Baseline grounds at margin + ascent; glyph tops (baseline -
    // 0.8em) must clear the box top, as the PPTX anchor does.
    assert.ok(y - size * 0.8 >= boxTop - 0.5, `glyph top inside box (baseline ${y}, size ${size}, top ${boxTop})`);
  });

  it("status eyebrow no longer collides with its metric (F1)", () => {
    // Real V2-4A failure: status box bottom 2.27in vs metric glyph
    // tops above the content box top 2.32in.
    const statusBottom = (1.97 + 0.3) * 96;
    const svg = sceneToSvg({
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:m", kind: "text", x: 1, y: 2.32, w: 6, h: 1.758, z: 10, provenance: "compiler",
        paragraphs: [{ runs: [{ text: "26/26", role: "metric", family: "Merriweather", weight: 900, size: 54, line: 1, color: "111111" }] }],
      }],
    });
    const { y, size } = firstTextY(svg, "s:m");
    assert.ok(y - size * 0.8 >= statusBottom, `metric glyph top clears status bottom (top ${y - size * 0.8}, status ${statusBottom})`);
  });

  it("body first baseline mirrors the PPTX box anchor", () => {
    const svg = sceneToSvg({
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:b", kind: "text", x: 1, y: 2, w: 6, h: 2, z: 10, provenance: "compiler",
        paragraphs: [{ runs: [{ text: "Body", role: "body", family: "Inter", size: 13, line: 1.55, color: "111111" }] }],
      }],
    });
    const { y, size } = firstTextY(svg, "s:b");
    // Box top + 0.05in PPTX margin + 0.8em ascent.
    const expect = 2 * 96 + 0.05 * 96 + size * 0.8;
    assert.ok(Math.abs(y - expect) < 0.11, `baseline ${y} anchors at margin+ascent (${expect})`);
  });

  it("multi-line advances stay size-proportional", () => {
    const svg = sceneToSvg({
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:p", kind: "text", x: 1, y: 1, w: 6, h: 3, z: 10, provenance: "compiler",
        paragraphs: [{ runs: [{ text: "one\ntwo\nthree", role: "body", family: "Inter", size: 13, line: 1.55, color: "111111" }] }],
      }],
    });
    const ys = [...svg.matchAll(/<text[^>]* y="([\d.]+)"/g)].map((m) => parseFloat(m[1]));
    assert.equal(ys.length, 3);
    const step = (13 * PT) * 1.55;
    assert.ok(Math.abs(ys[1] - ys[0] - step) < 0.11, `line step ${ys[1] - ys[0]} matches size*line (${step})`);
    assert.ok(Math.abs(ys[2] - ys[1] - step) < 0.11, "even spacing");
  });
});

describe("v2-4b projection preserves meaning", () => {
  function scene() {
    return {
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:t", kind: "text", x: 1, y: 1, w: 6, h: 2, z: 10, provenance: "compiler",
        paragraphs: [{
          runs: [{ text: "Hi", role: "heading", family: "Inter", weight: 700, size: 20, tracking: 1.2, line: 1.2, transform: "upper", color: "A1B2C3" }],
          align: "center",
        }],
      }],
    };
  }

  it("styling survives calibration", () => {
    const svg = sceneToSvg(scene(), { wrapText: true });
    assert.match(svg, /font-family="Inter"/);
    assert.match(svg, /font-weight="bold"/);
    assert.match(svg, /fill="#A1B2C3"/);
    assert.match(svg, /text-anchor="middle"/);
    assert.match(svg, /letter-spacing="1\.60"/, "tracking still converts at 96/72");
    assert.match(svg, /HI/, "uppercase transform intact");
  });

  it("no authored text is lost or truncated", () => {
    const words = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta"];
    const svg = sceneToSvg({
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:t", kind: "text", x: 1, y: 1, w: 2, h: 3, z: 10, provenance: "compiler",
        paragraphs: [{ runs: [{ text: words.join(" "), role: "body", family: "Inter", size: 13, color: "111111" }] }],
      }],
    }, { wrapText: true });
    for (const w of words) assert.ok(textOf(svg).includes(w), `${w} survives wrapping`);
  });

  it("viewer selection, identity, and chrome survive", () => {
    const { document } = parseHTML("<!doctype html><html><body></body></html>");
    const root = document.createElement("div");
    document.body.appendChild(root);
    const viewer = createViewer(root, [{
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [
        {
          id: "s:t", kind: "text", x: 1, y: 1, w: 6, h: 1, z: 10, provenance: "compiler", semanticRef: "t1",
          paragraphs: [{ runs: [{ text: "Pick me", role: "body", family: "Inter", size: 13, color: "111111" }] }],
        },
        {
          id: "s:c", kind: "text", x: 1, y: 6.9, w: 6, h: 0.3, z: 90, provenance: "chrome", locked: true,
          paragraphs: [{ runs: [{ text: "Presenter", role: "eyebrow", family: "Inter", size: 10, color: "111111" }] }],
        },
      ],
    }]);
    const before = JSON.stringify(viewer.scenes);
    assert.equal(viewer.api.select("s:t").selectedId, "s:t", "selection works");
    assert.equal(viewer.api.select("s:c").selectedId, "s:t", "locked chrome never selects");
    const node = root.querySelector('[data-el="s:t"]');
    assert.equal(node.getAttribute("data-semantic-ref"), "t1", "semantic ref preserved");
    assert.equal(JSON.stringify(viewer.scenes), before, "scenes unmodified");
    viewer.destroy();
  });

  it("native PPTX output uses scene points verbatim", async () => {
    // The browser correction must not move the native path: PPTX
    // font sizes equal scene points (OOXML sz = 100ths of a point).
    const dir = mkdtempSync(path.join(tmpdir(), "v24b-"));
    const pptx = path.join(dir, "t.pptx");
    await renderPptxToFile([{
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:t", kind: "text", x: 1, y: 1, w: 6, h: 1, z: 10, provenance: "compiler",
        paragraphs: [{ runs: [{ text: "Sized", role: "body", family: "Inter", size: 13, color: "111111" }] }],
      }],
    }], pptx);
    const zip = await JSZip.loadAsync(readFileSync(pptx));
    const xml = await zip.files["ppt/slides/slide1.xml"].async("string");
    assert.match(xml, /sz="1300"/, "13pt scene text stays 13pt in OOXML");
  });
});
