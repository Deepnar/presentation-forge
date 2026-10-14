// V2-7A creation builders: blank and layout scenes validate as
// Layer-C and carry minted unique ids. Fails on 97a12de at import
// (the lib is new).
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildBlankScenes, buildLayoutScenes, layoutTemplateList, defaultProjectTitle } from "../app/web/src/lib/v2create.js";
import { validateScene } from "../packages/model/scene.ts";

describe("v2-7a creation builders", () => {
  it("blank scenes are valid, empty, and uniquely identified", async () => {
    const [a] = await buildBlankScenes();
    const [b] = await buildBlankScenes();
    assert.equal((await validateScene(a)).ok, true);
    assert.deepEqual(a.elements, []);
    assert.notEqual(a.id, b.id);
    assert.equal(a.layoutState, "managed");
  });

  it("all 15 layout templates build valid human-owned scenes", async () => {
    const list = layoutTemplateList();
    assert.equal(list.length, 15);
    const ids = new Set();
    for (const t of list) {
      const [scene] = await buildLayoutScenes(t.id);
      assert.equal((await validateScene(scene)).ok, true);
      assert.ok(scene.elements.length > 0, `${t.id} carries editable elements`);
      assert.ok(!scene.id.startsWith("layout-"), `${t.id} gets a minted slide id`);
      assert.ok(scene.elements.every((e) => e.provenance === "human"), `${t.id} is human-owned`);
      for (const id of [scene.id, ...scene.elements.map((e) => e.id)]) {
        assert.ok(!ids.has(id), `no id reuse across templates (${id})`);
        ids.add(id);
      }
    }
  });

  it("unknown templates refuse with a named error", async () => {
    await assert.rejects(buildLayoutScenes("no-such-template"), /unknown template/);
  });

  it("default titles read as product copy", () => {
    assert.equal(defaultProjectTitle("blank"), "Untitled presentation");
    assert.equal(defaultProjectTitle("layout", "Chart insight"), "Chart insight presentation");
  });
});
