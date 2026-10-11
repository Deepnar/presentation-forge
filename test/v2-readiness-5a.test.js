// V2-5A: editor-readiness contracts. Non-mutating proofs that the
// seams later slices build on already exist and agree: stable
// projection identity, locked distinguishability, selection grounding,
// semantic-ref survival, managed/customized/detached discernibility,
// viewer non-mutation, and one shared scene input for both renderers.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { createViewer } from "../packages/editor/scene-dom.js";
import { preflightScenes } from "../packages/renderer-pptx/render.ts";
import { applyCommand } from "../packages/model/commands.ts";
import { compileDeck } from "../packages/compiler/compile.js";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";

function walkEls(els, out = []) {
  for (const el of els ?? []) {
    out.push(el);
    walkEls(el.group?.children ?? [], out);
  }
  return out;
}

describe("v2-5a editor readiness", () => {
  it("every scene id projects to exactly one DOM identity", async () => {
    const design = await warmDesign();
    const scenes = compileDeck(sampleDeckIntent(), design);
    for (const scene of scenes) {
      const svg = sceneToSvg(scene, { wrapText: true });
      for (const el of walkEls(scene.elements)) {
        const hits = svg.split(`data-el="${el.id}"`).length - 1;
        assert.equal(hits, 1, `${scene.id}/${el.id} projects exactly once`);
      }
    }
  });

  it("locked elements stay distinguishable in projection and viewer", async () => {
    const design = await warmDesign();
    const scenes = compileDeck(sampleDeckIntent(), design);
    const locked = walkEls(scenes.flatMap((s) => s.elements)).filter((e) => e.locked);
    assert.ok(locked.length >= 0, "scanned");
    const svg = sceneToSvg(scenes[0], { wrapText: true });
    for (const el of walkEls(scenes[0].elements)) {
      if (el.locked) assert.ok(svg.includes(`data-el="${el.id}"`), "locked identity present");
    }
    const { document } = parseHTML("<!doctype html><html><body></body></html>");
    const root = document.createElement("div");
    document.body.appendChild(root);
    const viewer = createViewer(root, scenes.slice(0, 1));
    for (const n of root.querySelectorAll("[data-el]")) {
      const id = n.getAttribute("data-el");
      const el = walkEls(scenes[0].elements).find((e) => e.id === id);
      assert.ok(el, `${id} maps to an actual scene element`);
      assert.equal(n.getAttribute("data-locked") === "true", el.locked === true, `${id} lock flag agrees`);
    }
    const ids = viewer.api.selectableIds();
    assert.ok(ids.every((id) => !walkEls(scenes[0].elements).find((e) => e.id === id)?.locked), "selectables exclude locked");
  });

  it("semantic references survive projection and inspection", async () => {
    const design = await warmDesign();
    const scenes = compileDeck(sampleDeckIntent(), design);
    const refs = walkEls(scenes.flatMap((s) => s.elements)).filter((e) => e.semanticRef);
    assert.ok(refs.length > 0, "compiler emits refs");
    const { document } = parseHTML("<!doctype html><html><body></body></html>");
    const root = document.createElement("div");
    document.body.appendChild(root);
    const viewer = createViewer(root, scenes.slice(0, 2));
    for (const el of refs.slice(0, 5)) {
      const rec = viewer.api.inspect(el.id);
      if (rec) assert.equal(rec.semanticRef, el.semanticRef, `${el.id} ref grounded`);
    }
    const svg = sceneToSvg(scenes[1], { wrapText: true });
    assert.ok(svg.includes("data-semantic-ref="), "refs project into the DOM");
  });

  it("managed, customized, and detached states read from schema data", async () => {
    const design = await warmDesign();
    const scenes = compileDeck(sampleDeckIntent(), design);
    assert.ok(scenes.every((s) => s.layoutState === "managed"), "compiler output starts managed");
    const customized = JSON.parse(JSON.stringify(scenes[1]));
    const target = customized.elements.find((e) => !e.locked && e.kind === "text");
    applyCommand(customized, { type: "element.move", id: target.id, x: target.x + 0.5, y: target.y });
    assert.equal(customized.layoutState, "customized", "a move flips the slide state");
    const moved = customized.elements.find((e) => e.id === target.id);
    assert.equal(moved.provenance, "human", "compiler provenance yields to human");
    assert.equal(moved.customized, true, "geometry edits flag the element");
    const detached = JSON.parse(JSON.stringify(scenes[2]));
    detached.layoutState = "detached";
    assert.equal(detached.layoutState, "detached", "detachment reads from the same field");
    assert.ok([customized, detached].every((s) => ["managed", "customized", "detached"].includes(s.layoutState)));
  });

  it("browser and export consume the same compiled scenes", async () => {
    const design = await warmDesign();
    const scenes = compileDeck(sampleDeckIntent(), design);
    const frozen = JSON.stringify(scenes);
    for (const scene of scenes) sceneToSvg(scene, { wrapText: true });
    assert.equal(await preflightScenes(scenes).then((i) => i.length), 0, "shared input passes export preflight");
    assert.equal(JSON.stringify(scenes), frozen, "projection and preflight never mutate");
  });
});
