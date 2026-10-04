// Slice B: Project is a tiny durable root. Children point here;
// the project never mirrors child lists.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateProject } from "../packages/model/validate.ts";

describe("v2 project", () => {
  it("accepts a minimal project", async () => {
    const { ok, errors } = await validateProject({ id: "prj_1", title: "Batteries" });
    assert.equal(ok, true, errors.join("\n"));
  });

  it("accepts a project with a small brief", async () => {
    const { ok, errors } = await validateProject({
      id: "prj_1",
      title: "Batteries",
      brief: { objective: "Explain solid-state cells", audience: "Third-year class", constraints: ["12 slides"] },
      createdAt: "2026-10-05T00:00:00Z",
    });
    assert.equal(ok, true, errors.join("\n"));
  });

  it("rejects missing id and title", async () => {
    assert.equal((await validateProject({ title: "T" })).ok, false);
    assert.equal((await validateProject({ id: "prj_1" })).ok, false);
  });

  it("rejects mirrored child arrays and other unknown properties", async () => {
    for (const extra of [{ artifactIds: ["art_1"] }, { fileIds: ["file_1"] }, { members: ["a@x"] }, { conversation: [] }]) {
      const { ok } = await validateProject({ id: "prj_1", title: "T", ...extra });
      assert.equal(ok, false, JSON.stringify(extra));
    }
  });
});
