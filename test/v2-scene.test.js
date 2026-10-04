// Phase 1: scene contracts hold — validation, bounds, stable identity.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateScene, checkBounds, compilerId, humanId } from "../packages/model/scene.ts";
import { compileDeck } from "../packages/compiler/compile.js";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";

describe("v2 scene", () => {
  it("compiled scenes validate and sit on canvas", async () => {
    const design = await warmDesign();
    for (const scene of compileDeck(sampleDeckIntent(), design)) {
      const v = await validateScene(scene);
      assert.equal(v.ok, true, v.errors.join("\n"));
      assert.deepEqual(checkBounds(scene), []);
    }
  });

  it("rejects negative extents", async () => {
    const design = await warmDesign();
    const [scene] = compileDeck(sampleDeckIntent(), design);
    scene.elements[0].w = -1;
    const v = await validateScene(scene);
    assert.equal(v.ok, false);
  });

  it("checkBounds flags footprints off canvas", async () => {
    const design = await warmDesign();
    const [scene] = compileDeck(sampleDeckIntent(), design);
    scene.elements[0].x = 99;
    assert.match(checkBounds(scene).join(" "), /off canvas/);
  });

  it("compiler ids are deterministic, human ids unique", () => {
    assert.equal(compilerId("s1", "b1", "body"), compilerId("s1", "b1", "body"));
    assert.notEqual(humanId(), humanId());
  });
});
