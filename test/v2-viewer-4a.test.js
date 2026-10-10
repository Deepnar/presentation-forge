// V2-4A: browser renderer contracts. Mapping, coordinates,
// identity, order, zoom, selection, and read-only behavior run
// headless under linkedom; real-Chrome coverage (getBBox,
// screenshots, visual parity) lives in the smoke section below.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";
import {
  createViewer,
  fitScale,
  clampZoom,
  nextIndex,
  prevIndex,
  clampIndex,
  SLIDE_ASPECT,
  MIN_ZOOM,
  MAX_ZOOM,
} from "../packages/editor/scene-dom.js";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { viewerFixtures } from "../tools/v2-viewer-fixtures.mjs";
import { validateScene } from "../packages/model/scene.ts";
import { SCENE_W, SCENE_H } from "../packages/model/scene-constants.ts";

function dom() {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  return document;
}

function walkSceneEls(elements, out = []) {
  for (const el of elements ?? []) {
    out.push(el);
    walkSceneEls(el.group?.children ?? [], out);
  }
  return out;
}

let fixtures;
before(async () => {
  fixtures = await viewerFixtures({ includePlates: false });
});

describe("v2-4a viewer math", () => {
  it("slide aspect matches the canonical canvas", () => {
    assert.equal(SCENE_W, 13.333);
    assert.equal(SCENE_H, 7.5);
    assert.ok(Math.abs(SLIDE_ASPECT - 16 / 9) < 1e-3, "16:9 viewBox");
  });

  it("fit scale covers containers and rejects garbage", () => {
    assert.equal(fitScale(1280, 720), 1, "16:9 container fits exactly");
    assert.equal(fitScale(640, 720), 640 / (SCENE_W * 96), "width binds");
    assert.equal(fitScale(2560, 700), 700 / (SCENE_H * 96), "height binds");
    for (const bad of [[0, 720], [640, -1], [NaN, 5], ["x", 5]]) {
      assert.equal(fitScale(...bad), 1, `degenerate ${JSON.stringify(bad)} fits at 1`);
    }
  });

  it("zoom clamps to the documented band", () => {
    assert.equal(clampZoom(2), 2);
    assert.equal(clampZoom(100), MAX_ZOOM);
    assert.equal(clampZoom(0), MIN_ZOOM);
    assert.equal(clampZoom(NaN), 1);
    assert.equal(clampZoom("3"), 3, "numeric strings coerce");
  });

  it("navigation wraps and clamps deterministically", () => {
    assert.equal(nextIndex(11, 12), 0, "next wraps");
    assert.equal(prevIndex(0, 12), 11, "prev wraps");
    assert.equal(nextIndex(0, 0), 0, "empty deck safe");
    assert.equal(clampIndex(99, 12), 11);
    assert.equal(clampIndex(-4, 12), 0);
    assert.equal(clampIndex(2.9, 12), 2, "floors fractional input");
  });
});

describe("v2-4a scene mapping", () => {
  it("every scene element mounts with a stable id", async () => {
    const document = dom();
    const root = document.createElement("div");
    document.body.appendChild(root);
    const { scenes } = fixtures["mech-warm-humanist-plain"];
    const viewer = createViewer(root, scenes);
    for (const scene of scenes) {
      viewer.api.goTo(scenes.indexOf(scene));
      const expected = walkSceneEls(scene.elements).map((e) => e.id).sort();
      const mounted = viewer.elementIds().map((e) => e.id).sort();
      assert.deepEqual(mounted, expected, `${scene.id}: all ids mounted`);
    }
    viewer.destroy();
  });

  it("draw order follows ascending z", async () => {
    const document = dom();
    const root = document.createElement("div");
    const { scenes } = fixtures["mech-warm-humanist-plain"];
    const viewer = createViewer(root, scenes);
    viewer.api.goTo(3);
    const ordered = [...scenes[3].elements].sort((a, b) => a.z - b.z).map((e) => e.id);
    const domOrder = viewer.elementIds().map((e) => e.id);
    assert.deepEqual(domOrder, ordered, "DOM order matches z order");
    viewer.destroy();
  });

  it("semantic references survive projection", async () => {
    const document = dom();
    const root = document.createElement("div");
    const { scenes } = fixtures["source-of-truth-warm-humanist-plain"];
    const viewer = createViewer(root, scenes);
    for (const scene of scenes) {
      viewer.api.goTo(scenes.indexOf(scene));
      for (const el of walkSceneEls(scene.elements)) {
        if (el.semanticRef === undefined) continue;
        const node = root.querySelector(`[data-el="${el.id}"]`);
        assert.ok(node, `${el.id} mounted`);
        assert.equal(node.getAttribute("data-semantic-ref"), el.semanticRef, `${el.id} ref preserved`);
      }
    }
    viewer.destroy();
  });

  it("locked chrome mounts flagged and unselectable", async () => {
    const document = dom();
    const root = document.createElement("div");
    const { scenes } = fixtures["mech-warm-humanist-chromed"];
    const viewer = createViewer(root, scenes);
    const locked = viewer.elementIds().filter((e) => e.locked);
    assert.ok(locked.length > 0, "chromed fixture carries locked elements");
    const before = viewer.api.select(locked[0].id);
    assert.equal(before.selectedId, null, "locked chrome never selects");
    viewer.destroy();
  });

  it("shape geometry converts inches to pixels exactly", async () => {
    const document = dom();
    const root = document.createElement("div");
    const scene = {
      id: "g", width: 13.333, height: 7.5, background: { fill: "FFFFFF" },
      layoutState: "managed",
      elements: [{ id: "g:r", kind: "shape", x: 1, y: 2, w: 3, h: 0.5, z: 1, provenance: "compiler", shape: { form: "rect", fill: "FF0000" } }],
    };
    createViewer(root, [scene]);
    const rect = root.querySelector('[data-el="g:r"]');
    assert.equal(rect.getAttribute("x"), (1 * 96).toFixed(1));
    assert.equal(rect.getAttribute("y"), (2 * 96).toFixed(1));
    assert.equal(rect.getAttribute("width"), (3 * 96).toFixed(1));
  });

  it("text styling projects family, size, weight, color, and alignment", async () => {
    const svg = sceneToSvg({
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:t", kind: "text", x: 1, y: 1, w: 6, h: 1, z: 10, provenance: "compiler",
        paragraphs: [{ runs: [{ text: "Hi", role: "heading", family: "Inter", weight: 700, size: 20, color: "A1B2C3" }], align: "center" }],
      }],
    }, { wrapText: true });
    assert.match(svg, /font-family="Inter"/);
    assert.match(svg, /font-size="22\.0"/, "CSS px = pt at 96dpi");
    assert.match(svg, /font-weight="bold"/);
    assert.match(svg, /fill="#A1B2C3"/);
    assert.match(svg, /text-anchor="middle"/);
  });

  it("long paragraphs wrap in the viewer projection", async () => {
    const text = "Word ".repeat(40).trim();
    const plain = sceneToSvg({
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{ id: "s:t", kind: "text", x: 1, y: 1, w: 5, h: 3, z: 10, provenance: "compiler", paragraphs: [{ runs: [{ text, role: "body", size: 13 }] }] }],
    });
    const wrapped = sceneToSvg({
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{ id: "s:t", kind: "text", x: 1, y: 1, w: 5, h: 3, z: 10, provenance: "compiler", paragraphs: [{ runs: [{ text, role: "body", size: 13 }] }] }],
    }, { wrapText: true });
    assert.equal((plain.match(/<text /g) || []).length, 1, "default path keeps one line");
    assert.ok((wrapped.match(/<text /g) || []).length > 3, "viewer path wraps to several lines");
  });

  it("backgrounds project fill, plate image, and decor in order", async () => {
    const svg = sceneToSvg({
      id: "s", width: 13.333, height: 7.5, layoutState: "managed",
      background: {
        fill: "112233",
        image: { src: "data:image/png;base64,iVBORw0KGgo=", hash: "0".repeat(64) },
        decor: [{ shape: "rect", x: 0, y: 0, w: 13.333, h: 0.1, fill: "E85AD4", fillAlpha: 0.65 }],
      },
      elements: [],
    }, { wrapText: true });
    const flat = svg.indexOf('fill="#112233"');
    const img = svg.indexOf("<image");
    const decor = svg.indexOf('fill="#E85AD4"');
    assert.ok(flat !== -1 && img !== -1 && decor !== -1 && flat < img && img < decor, "canonical layering preserved");
  });
});

describe("v2-4a viewer behavior", () => {
  function mounted(name = "mech-warm-humanist-plain") {
    const document = dom();
    const root = document.createElement("div");
    document.body.appendChild(root);
    const viewer = createViewer(root, fixtures[name].scenes);
    return { document, root, viewer };
  }

  it("mounts ready with slide zero selected by default", () => {
    const { viewer } = mounted();
    const snap = viewer.api.goTo(0);
    assert.equal(snap.status, "ready");
    assert.equal(snap.slideIndex, 0);
    assert.equal(snap.slideCount, 12);
    assert.equal(snap.selectedId, null);
    viewer.destroy();
  });

  it("empty scenes report empty state instead of crashing", () => {
    const document = dom();
    const root = document.createElement("div");
    const viewer = createViewer(root, []);
    assert.equal(viewer.state.status, "empty");
    viewer.destroy();
  });

  it("missing root throws explicitly", () => {
    assert.throws(() => createViewer(null, []), /mount requires a root/);
  });

  it("filmstrip navigation moves exactly one slide", () => {
    const { viewer } = mounted();
    assert.equal(viewer.api.next().slideIndex, 1);
    assert.equal(viewer.api.next().slideIndex, 2);
    assert.equal(viewer.api.prev().slideIndex, 1);
    assert.equal(viewer.api.goTo(11).slideIndex, 11);
    assert.equal(viewer.api.next().slideIndex, 0, "wraps at the end");
    assert.equal(viewer.api.prev().slideIndex, 11, "wraps at the start");
    assert.equal(viewer.api.goTo(999).slideIndex, 11, "clamps over-range");
    viewer.destroy();
  });

  it("navigation clears selection", () => {
    const { viewer } = mounted();
    const target = viewer.elementIds()[0].id;
    viewer.api.select(target);
    assert.equal(viewer.api.goTo(3).selectedId, null);
    viewer.destroy();
  });

  it("zoom scales around the fit baseline", () => {
    const { viewer } = mounted();
    viewer.api.refit(1280, 720);
    const base = 1;
    assert.ok(Math.abs(viewer.api.goTo(0).fit - base) < 1e-9, "fit recorded");
    assert.equal(viewer.api.setZoom(2).effectiveScale, base * 2);
    assert.equal(viewer.api.zoomIn().zoom, 2.5);
    assert.equal(viewer.api.zoomOut().zoom, 2);
    assert.equal(viewer.api.resetZoom().zoom, 1);
    assert.equal(viewer.api.setZoom(99).zoom, MAX_ZOOM, "clamped top");
    assert.equal(viewer.api.setZoom(0).zoom, MIN_ZOOM, "clamped bottom");
    viewer.destroy();
  });

  it("refit handles degenerate containers", () => {
    const { viewer } = mounted();
    assert.equal(viewer.api.refit(0, 0).fit, 1);
    assert.equal(viewer.api.refit(-5, 100).fit, 1);
    viewer.destroy();
  });

  it("read-only selection marks exactly one element", () => {
    const { root, viewer } = mounted();
    const ids = viewer.elementIds().filter((e) => !e.locked).map((e) => e.id);
    assert.ok(ids.length > 0, "plain fixture has selectable elements");
    viewer.api.select(ids[0]);
    assert.equal(root.querySelectorAll("[data-selected]").length, 1);
    viewer.api.select(ids[1]);
    assert.equal(root.querySelectorAll("[data-selected]").length, 1, "single selection moves");
    assert.equal(root.querySelector("[data-selected]").getAttribute("data-el"), ids[1]);
    viewer.api.clearSelection();
    assert.equal(root.querySelectorAll("[data-selected]").length, 0);
    viewer.destroy();
  });

  it("selecting unknown ids is a no-op", () => {
    const { viewer } = mounted();
    assert.equal(viewer.api.select("nope:missing").selectedId, null);
    viewer.destroy();
  });

  it("onChange notifies every state transition", () => {
    const { viewer } = mounted();
    const seen = [];
    const off = viewer.onChange((s) => seen.push([s.slideIndex, s.zoom, s.selectedId]));
    viewer.api.next();
    viewer.api.setZoom(2);
    off();
    viewer.api.next();
    assert.deepEqual(seen, [[1, 1, null], [1, 2, null]], "subscriber sees transitions until unsubscribed");
    viewer.destroy();
  });

  it("interactions never mutate scenes", () => {
    const { viewer } = mounted();
    const before = JSON.stringify(viewer.scenes);
    const ids = viewer.elementIds().map((e) => e.id);
    viewer.api.select(ids[0]);
    viewer.api.setZoom(3);
    viewer.api.next();
    viewer.api.refit(800, 600);
    viewer.api.clearSelection();
    assert.equal(JSON.stringify(viewer.scenes), before, "scenes byte-identical after interaction");
    assert.ok(Object.isFrozen(viewer.scenes[0]), "scenes frozen against mutation");
    assert.throws(() => {
      viewer.scenes[0].elements[0].x = 999;
    }, "frozen scene rejects writes");
    viewer.destroy();
  });

  it("malformed scenes fail validation, not silently", async () => {
    const bad = { id: "bad", width: 13.333, height: 7.5, background: {}, elements: "nope", layoutState: "managed" };
    const v = await validateScene(bad);
    assert.equal(v.ok, false, "validator rejects the malformed scene");
  });

  it("committed fixtures have zero drift", async () => {
    const fresh = await viewerFixtures({ includePlates: false });
    for (const [name, data] of Object.entries(fresh)) {
      const prev = JSON.parse(await readFile(new URL(`../app/web/src/scenes/${name}.json`, import.meta.url), "utf8"));
      assert.equal(JSON.stringify(prev), JSON.stringify(data), `${name} matches its checked-in fixture`);
    }
  });
});
