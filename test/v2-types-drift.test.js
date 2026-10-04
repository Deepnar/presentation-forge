// The checked-in *.generated.ts files must match their schemas exactly.
// JSON Schema is the source of truth; regeneration is one command
// (npm run types:generate), so any drift fails here rather than shipping.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { generateTypes } from "../tools/v2-types.mjs";

describe("v2 generated types drift", () => {
  it("checked-in generated types match the schemas byte-for-byte", async () => {
    const targets = await generateTypes({ write: false });
    assert.ok(targets.length > 0);
    for (const t of targets) {
      const onDisk = await readFile(new URL(`../${t.out}`, import.meta.url), "utf8");
      assert.equal(onDisk, t.ts, `${t.out} drifted from ${t.schema}; run npm run types:generate`);
    }
  });
});
