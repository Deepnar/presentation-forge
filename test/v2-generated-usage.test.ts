// Slice B: generated types must stay structurally usable. Plain arrays
// must assign to ID lists and optional export fields must accept plain
// strings — if tuple-union generation regresses, this file fails
// `npm run typecheck` before anything ships.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Artifact } from "../packages/model/artifact.generated.ts";
import type { SourceRef } from "../packages/model/source.generated.ts";
import type { FileRef } from "../packages/model/file.generated.ts";
import type { Project } from "../packages/model/project.generated.ts";

describe("v2 generated type usability", () => {
  it("plain arrays assign to id lists", () => {
    const ids: string[] = ["src_1", "src_2"];
    const art: Artifact = {
      id: "art_1", projectId: "prj_1", kind: "presentation",
      status: "draft", title: "T", sourceIds: ids,
    };
    assert.equal(art.sourceIds?.length, 2);
  });

  it("export artifacts carry export fields as plain optionals", () => {
    const exp: Artifact = {
      id: "art_2", projectId: "prj_1", kind: "export", status: "ready",
      title: "E", exportOf: "art_1", format: "pptx", storageKey: "k",
    };
    assert.equal(exp.format, "pptx");
  });

  it("domain objects construct without casts", () => {
    const p: Project = { id: "prj_1", title: "P", brief: { objective: "O", constraints: ["c"] } };
    const f: FileRef = {
      id: "file_1", projectId: "prj_1", name: "r.pdf", mime: "application/pdf",
      sizeBytes: 10, storageKey: "k", role: "source-of-truth",
    };
    const s: SourceRef = { id: "src_1", projectId: "prj_1", kind: "paper", title: "T", doi: "10.1/x" };
    assert.ok(p.id && f.id && s.id);
  });
});
