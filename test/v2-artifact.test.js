// Slice B: Artifact lifecycle is draft -> ready. Export artifacts must
// name their source, format, and storage key; nothing else may require them.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateArtifact } from "../packages/model/validate.ts";

describe("v2 artifact", () => {
  it("accepts a presentation without export fields", async () => {
    const { ok, errors } = await validateArtifact({
      id: "art_1", projectId: "prj_1", kind: "presentation", status: "draft", title: "Deck",
      sourceIds: ["src_1"], fileIds: ["file_1"],
    });
    assert.equal(ok, true, errors.join("\n"));
  });

  it("accepts report and script kinds", async () => {
    for (const kind of ["report", "script"]) {
      const { ok, errors } = await validateArtifact({ id: "a", projectId: "p", kind, status: "ready", title: "T" });
      assert.equal(ok, true, `${kind}: ${errors.join("\n")}`);
    }
  });

  it("rejects invalid kinds, statuses, and job states", async () => {
    assert.equal((await validateArtifact({ id: "a", projectId: "p", kind: "slideshow", status: "draft", title: "T" })).ok, false);
    assert.equal((await validateArtifact({ id: "a", projectId: "p", kind: "report", status: "processing", title: "T" })).ok, false);
  });

  it("accepts a valid export, with or without expiry", async () => {
    const base = {
      id: "art_9", projectId: "prj_1", kind: "export", status: "ready", title: "Deck export",
      exportOf: "art_1", format: "pptx", storageKey: "art_9/deck.pptx",
    };
    assert.equal((await validateArtifact(base)).ok, true);
    assert.equal((await validateArtifact({ ...base, expiresAt: "2026-11-05T00:00:00Z" })).ok, true);
  });

  it("rejects exports missing exportOf, format, or storageKey", async () => {
    const base = { id: "art_9", projectId: "prj_1", kind: "export", status: "ready", title: "E" };
    assert.equal((await validateArtifact(base)).ok, false);
    assert.equal((await validateArtifact({ ...base, format: "pptx", storageKey: "k" })).ok, false);
    assert.equal((await validateArtifact({ ...base, exportOf: "art_1", storageKey: "k" })).ok, false);
    assert.equal((await validateArtifact({ ...base, exportOf: "art_1", format: "pptx" })).ok, false);
  });

  it("does not require export fields on non-export artifacts", async () => {
    for (const kind of ["presentation", "report", "script"]) {
      const { ok } = await validateArtifact({ id: "a", projectId: "p", kind, status: "draft", title: "T" });
      assert.equal(ok, true, kind);
    }
  });

  it("rejects unknown fields", async () => {
    const { ok } = await validateArtifact({
      id: "a", projectId: "p", kind: "report", status: "draft", title: "T", jobState: "queued",
    });
    assert.equal(ok, false);
  });
});
