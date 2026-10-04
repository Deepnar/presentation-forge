// The scene dimensions have one canonical authority. The JSON Schema
// declares them as consts for validation; the runtime uses the model
// constants. This test fails if the two ever disagree.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SCENE_W, SCENE_H } from "../packages/model/scene-constants.ts";
import { SCENE_W as RE_W, SCENE_H as RE_H } from "../packages/model/scene.ts";

describe("v2 scene constants", () => {
  it("runtime constants agree with the schema consts", async () => {
    const schema = JSON.parse(
      await readFile(new URL("../packages/model/scene.schema.json", import.meta.url), "utf8"),
    );
    assert.equal(SCENE_W, schema.properties.width.const);
    assert.equal(SCENE_H, schema.properties.height.const);
    assert.equal(RE_W, SCENE_W);
    assert.equal(RE_H, SCENE_H);
  });
});
