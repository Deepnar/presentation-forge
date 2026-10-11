// V2-4E: read-only selection model, hit testing, and overlays.
// State transitions, group resolution, bounds, keyboard, and
// immutability run headless under linkedom; measured geometry,
// zoom/resize overlay alignment, and screenshots run in real
// Chrome (test/v2-selection-chrome.test.js). The multiselect
// cases fail on the V2-4D baseline `2509968` (single selectedId
// only) and pass after.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import {
  createViewer,
  walkSceneEls,
} from "../packages/editor/scene-dom.js";
import { viewerFixtures } from "../tools/v2-viewer-fixtures.mjs";

function dom() {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  return document;
}

function mount(scenes) {
  const document = dom();
  const root = document.createElement("div");
  document.body.appendChild(root);
  const viewer = createViewer(root, scenes);
  return { document, root, viewer };
}

// Synthetic events: linkedom lacks MouseEvent-shift init and the
// KeyboardEvent constructor, so plain Events carry assigned props
// — the viewer reads the same fields Chrome sets.
function click(node, shift = false) {
  const ev = new node.ownerDocument.defaultView.Event("click", { bubbles: true });
  ev.shiftKey = shift;
  node.dispatchEvent(ev);
}

function key(root, k, shift = false) {
  const ev = new root.ownerDocument.defaultView.Event("keydown", { bubbles: true });
  ev.key = k;
  ev.shiftKey = shift;
  root.dispatchEvent(ev);
}

function textEl(id, extra = {}) {
  return {
    id, kind: "text", x: 1, y: 1, w: 4, h: 1, z: 1,
    paragraphs: [{ runs: [{ text: id, size: 20, color: "111111" }] }],
    ...extra,
  };
}

function shapeEl(id, extra = {}) {
  return {
    id, kind: "shape", x: 1, y: 3, w: 2, h: 1, z: 2,
    shape: { fill: "FF0000" }, ...extra,
  };
}

function oneSlide(elements) {
  return [{ id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, elements }];
}

function groupSlide() {
  return oneSlide([{
    id: "s:g", kind: "group", x: 2, y: 2, w: 6, h: 3, z: 1,
    group: {
      children: [
        { id: "s:g:kid1", kind: "shape", x: 0.5, y: 0.5, w: 2, h: 1, z: 1, shape: { fill: "00FF00" } },
        { id: "s:g:kid2", kind: "text", x: 3, y: 0.5, w: 2, h: 1, z: 2, paragraphs: [{ runs: [{ text: "kid", size: 14, color: "111111" }] }] },
      ],
    },
  }]);
}

let fixtures;
before(async () => {
  fixtures = await viewerFixtures({ includePlates: false });
});

describe("v2-4e single and additive selection", () => {
  it("click selects exactly one element with an overlay", () => {
    const { root, viewer } = mount(oneSlide([textEl("s:a"), shapeEl("s:b")]));
    click(root.querySelector('[data-el="s:a"]'));
    const snap = viewer.api.snapshot();
    assert.deepEqual(snap.selectedIds, ["s:a"]);
    assert.equal(snap.selectedId, "s:a", "compat single id kept");
    assert.equal(root.querySelectorAll('[data-selected="true"]').length, 1);
    const boxes = root.querySelectorAll('[data-overlay="s:a"]');
    assert.equal(boxes.length, 1, "one overlay box");
    assert.equal(boxes[0].style.left, "96.0px", "fallback scene-geometry x");
    assert.equal(boxes[0].style.top, "96.0px");
  });

  it("plain click replaces the selection", () => {
    const { root, viewer } = mount(oneSlide([textEl("s:a"), shapeEl("s:b")]));
    viewer.api.select("s:a");
    click(root.querySelector('[data-el="s:b"]'));
    assert.deepEqual(viewer.api.snapshot().selectedIds, ["s:b"]);
  });

  it("shift-click adds, and toggles off on repeat", () => {
    const { root, viewer } = mount(oneSlide([textEl("s:a"), shapeEl("s:b")]));
    click(root.querySelector('[data-el="s:a"]'));
    click(root.querySelector('[data-el="s:b"]'), true);
    assert.deepEqual(viewer.api.snapshot().selectedIds, ["s:a", "s:b"]);
    assert.equal(root.querySelectorAll("[data-overlay]").length, 2, "a ring per selection");
    click(root.querySelector('[data-el="s:a"]'), true);
    assert.deepEqual(viewer.api.snapshot().selectedIds, ["s:b"]);
  });

  it("selectMany dedupes and drops unknown ids deterministically", () => {
    const { viewer } = mount(oneSlide([textEl("s:a"), shapeEl("s:b")]));
    assert.deepEqual(viewer.api.selectMany(["s:b", "s:a", "s:b", "nope"]).selectedIds, ["s:b", "s:a"]);
    assert.deepEqual(viewer.api.select("s:a", { additive: true }).selectedIds, ["s:b"]);
  });

  it("background clicks and Escape clear", () => {
    const { root, viewer } = mount(oneSlide([textEl("s:a"), shapeEl("s:b")]));
    viewer.api.select("s:a");
    click(root.querySelector("svg"));
    assert.deepEqual(viewer.api.snapshot().selectedIds, [], "background clears");
    assert.equal(root.querySelectorAll("[data-overlay]").length, 0, "rings go with it");
    viewer.api.selectMany(["s:a", "s:b"]);
    key(root, "Escape");
    assert.deepEqual(viewer.api.snapshot().selectedIds, [], "Escape clears");
  });

  it("slide change reconciles by clearing", () => {
    const scenes = [...oneSlide([textEl("s:a")]), ...oneSlide([textEl("t:a")]).map((s) => ({ ...s, id: "t" }))];
    const { viewer } = mount(scenes);
    viewer.api.select("s:a");
    assert.deepEqual(viewer.api.goTo(1).selectedIds, []);
  });
});

describe("v2-4e keyboard focus", () => {
  it("Tab cycles selectable units in DOM order and wraps", () => {
    const { root, viewer } = mount(oneSlide([textEl("s:a"), shapeEl("s:b")]));
    key(root, "Tab");
    assert.deepEqual(viewer.api.snapshot().selectedIds, ["s:a"]);
    key(root, "Tab");
    assert.deepEqual(viewer.api.snapshot().selectedIds, ["s:b"]);
    key(root, "Tab");
    assert.deepEqual(viewer.api.snapshot().selectedIds, ["s:a"], "wraps");
    key(root, "Tab", true);
    assert.deepEqual(viewer.api.snapshot().selectedIds, ["s:b"], "Shift+Tab walks back");
  });

  it("Tab skips locked units", () => {
    const { root, viewer } = mount(oneSlide([textEl("s:a"), shapeEl("s:b", { locked: true })]));
    key(root, "Tab");
    assert.deepEqual(viewer.api.snapshot().selectedIds, ["s:a"]);
    key(root, "Tab");
    assert.deepEqual(viewer.api.snapshot().selectedIds, ["s:a"], "locked never focused");
  });
});

describe("v2-4e locked exclusion", () => {
  it("locked ids never select, programmatically or by click", () => {
    const { root, viewer } = mount(oneSlide([textEl("s:a"), shapeEl("s:l", { locked: true })]));
    assert.deepEqual(viewer.api.select("s:l").selectedIds, [], "programmatic locked select no-ops");
    viewer.api.select("s:a");
    click(root.querySelector('[data-el="s:l"]'));
    assert.deepEqual(viewer.api.snapshot().selectedIds, [], "locked hit clears like background");
  });

  it("chromed-fixture locks stay unselectable", () => {
    const { root, viewer } = mount(fixtures["mech-warm-humanist-chromed"].scenes.slice(0, 1));
    const locked = [...root.querySelectorAll('[data-el][data-locked="true"]')];
    assert.ok(locked.length > 0, "chromed slide carries locked chrome");
    for (const n of locked) {
      assert.deepEqual(viewer.api.select(n.getAttribute("data-el")).selectedIds, [], `${n.getAttribute("data-el")} excluded`);
    }
  });
});

describe("v2-4e charts and tables select as one unit", () => {
  function chartSlide() {
    const scenes = fixtures["mech-warm-humanist-plain"].scenes;
    const i = scenes.findIndex((s) => walkSceneEls(s.elements).some((e) => e.kind === "chart"));
    assert.ok(i >= 0, "fixture has a chart slide");
    return { scenes, i };
  }

  it("a bar-rect hit selects the chart element", () => {
    const { scenes, i } = chartSlide();
    const { root, viewer } = mount([scenes[i]]);
    const chartId = walkSceneEls(scenes[i].elements).find((e) => e.kind === "chart").id;
    const bar = root.querySelector(`[data-el="${chartId}"] rect`);
    assert.ok(bar && !bar.hasAttribute("data-el"), "chart innards carry no identity");
    click(bar);
    assert.deepEqual(viewer.api.snapshot().selectedIds, [chartId]);
  });

  it("a cell-text hit selects the table element", () => {
    const scenes = fixtures["mech-warm-humanist-plain"].scenes;
    const i = scenes.findIndex((s) => walkSceneEls(s.elements).some((e) => e.kind === "table"));
    assert.ok(i >= 0, "fixture has a table slide");
    const { root, viewer } = mount([scenes[i]]);
    const tableId = walkSceneEls(scenes[i].elements).find((e) => e.kind === "table").id;
    const cell = root.querySelector(`[data-el="${tableId}"] text`);
    assert.ok(cell && !cell.hasAttribute("data-el"), "cell text carries no identity");
    click(cell);
    assert.deepEqual(viewer.api.snapshot().selectedIds, [tableId]);
  });
});

describe("v2-4e group-aware selection", () => {
  it("nested hits resolve to the parent group", () => {
    const { root, viewer } = mount(groupSlide());
    click(root.querySelector('[data-el="s:g:kid1"]'));
    assert.deepEqual(viewer.api.snapshot().selectedIds, ["s:g"], "child hit selects the group");
    assert.deepEqual(viewer.api.select("s:g:kid2").selectedIds, ["s:g"], "programmatic child id resolves up");
    assert.deepEqual(viewer.api.selectableIds(), ["s:g"], "children never list as units");
  });

  it("locked descendants and locked groups never resolve", () => {
    const locked = oneSlide([{
      id: "s:g", kind: "group", x: 2, y: 2, w: 6, h: 3, z: 1,
      group: {
        children: [
          { id: "s:g:kid", kind: "shape", x: 0.5, y: 0.5, w: 2, h: 1, z: 1, locked: true, shape: { fill: "00FF00" } },
        ],
      },
    }]);
    const m1 = mount(locked);
    assert.deepEqual(m1.viewer.api.select("s:g:kid").selectedIds, [], "locked child excluded");
    const m2 = mount(groupSlide());
    m2.viewer.api.select("s:g");
    m2.root.querySelector('[data-el="s:g:kid1"]').setAttribute("data-locked", "true");
    click(m2.root.querySelector('[data-el="s:g:kid1"]'));
    assert.deepEqual(m2.viewer.api.snapshot().selectedIds, [], "locked hit clears");
  });
});

describe("v2-4e bounds, inspector, and stability", () => {
  it("bounds come from authoritative scene geometry", () => {
    const { viewer } = mount(oneSlide([textEl("s:a"), shapeEl("s:b")]));
    assert.deepEqual(viewer.api.bounds("s:a"), { x: 96, y: 96, w: 384, h: 96 });
    assert.deepEqual(viewer.api.bounds("s:g:kid1"), null, "unknown ids have no bounds");
    const { viewer: gv } = mount(groupSlide());
    assert.deepEqual(gv.api.bounds("s:g:kid1"), { x: 192, y: 192, w: 576, h: 288 }, "child ids bound their authoritative unit");
    assert.equal(gv.api.measuredBounds("s:g"), null, "no layout headless, honestly null");
  });

  it("inspect reports grounded scene properties", () => {
    const { viewer } = mount(oneSlide([textEl("s:a"), shapeEl("s:l", { locked: true })]));
    assert.deepEqual(viewer.api.inspect("s:a"), {
      id: "s:a", kind: "text", x: 1, y: 1, w: 4, h: 1,
      locked: false, semanticRef: null, provenance: null,
    });
    assert.equal(viewer.api.inspect("s:l").locked, true);
    assert.equal(viewer.api.inspect("nope"), null);
    const scenes = fixtures["mech-warm-humanist-plain"].scenes;
    const ref = walkSceneEls(scenes.flatMap((s) => s.elements)).find((e) => e.semanticRef);
    assert.ok(ref, "fixture carries semantic refs");
    const mv = mount(scenes.slice(0, 1));
    const hit = walkSceneEls(scenes[0].elements).find((e) => e.semanticRef);
    if (hit) assert.equal(mv.viewer.api.inspect(hit.id).semanticRef, hit.semanticRef, "refs survive projection");
  });

  it("zoom and refit keep SVG-space overlay geometry stable", () => {
    const { root, viewer } = mount(oneSlide([textEl("s:a")]));
    viewer.api.select("s:a");
    const atFit = root.querySelector('[data-overlay="s:a"]').style.left;
    viewer.api.setZoom(2);
    viewer.api.refit(900, 1400);
    const box = root.querySelector('[data-overlay="s:a"]');
    assert.ok(box, "ring survives zoom and resize");
    assert.equal(box.style.left, atFit, "overlay lives in SVG units; the shell transform scales it");
    assert.deepEqual(viewer.api.snapshot().selectedIds, ["s:a"], "harmless UI state preserves selection");
  });

  it("selection never mutates source scenes", () => {
    const scenes = oneSlide([textEl("s:a"), shapeEl("s:b")]);
    const { viewer } = mount(scenes);
    const frozen = JSON.stringify(scenes);
    viewer.api.select("s:a");
    viewer.api.toggle("s:b");
    viewer.api.cycleSelection(1);
    viewer.api.clearSelection();
    viewer.api.setZoom(2);
    assert.equal(JSON.stringify(scenes), frozen, "input scenes byte-identical after every op");
  });
});
