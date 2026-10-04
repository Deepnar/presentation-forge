// Slice B: SourceRef is an immutable normalized source. No full text,
// no scores, no raw payloads, no credentials.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateSourceRef } from "../packages/model/validate.ts";

describe("v2 sourceref", () => {
  it("accepts a minimal project source", async () => {
    const { ok, errors } = await validateSourceRef({ id: "src_1", projectId: "prj_1", kind: "web", title: "Cell review" });
    assert.equal(ok, true, errors.join("\n"));
  });

  it("accepts all supported kinds", async () => {
    for (const kind of ["web", "paper", "project-file", "user-provided"]) {
      const { ok, errors } = await validateSourceRef({ id: "src_1", projectId: "prj_1", kind, title: "T" });
      assert.equal(ok, true, `${kind}: ${errors.join("\n")}`);
    }
  });

  it("rejects invalid kinds and missing projectId", async () => {
    assert.equal((await validateSourceRef({ id: "s", projectId: "p", kind: "searxng", title: "T" })).ok, false);
    assert.equal((await validateSourceRef({ id: "s", kind: "web", title: "T" })).ok, false);
  });

  it("accepts a web source with URL", async () => {
    const { ok, errors } = await validateSourceRef({
      id: "src_1", projectId: "prj_1", kind: "web", title: "Review",
      url: "https://example.com/review", searchProvider: "searxng", retrievedAt: "2026-10-05T00:00:00Z",
    });
    assert.equal(ok, true, errors.join("\n"));
  });

  it("accepts a paper source with DOI", async () => {
    const { ok, errors } = await validateSourceRef({
      id: "src_2", projectId: "prj_1", kind: "paper", title: "Sulfide conductors", doi: "10.1000/xyz",
    });
    assert.equal(ok, true, errors.join("\n"));
  });

  it("accepts a project-file source with fileId and locator", async () => {
    const { ok, errors } = await validateSourceRef({
      id: "src_3", projectId: "prj_1", kind: "project-file", title: "Lab report",
      fileId: "file_1", locator: "p.12", excerpt: "Conductivity peaks at room temperature.",
    });
    assert.equal(ok, true, errors.join("\n"));
  });

  it("accepts searchProvider as an opaque string without enumerating vendors", async () => {
    for (const searchProvider of ["searxng", "custom-backend-1"]) {
      const { ok } = await validateSourceRef({ id: "s", projectId: "p", kind: "web", title: "T", searchProvider });
      assert.equal(ok, true, searchProvider);
    }
  });

  it("rejects unknown fields", async () => {
    for (const extra of [{ score: 0.9 }, { rawPayload: {} }, { pageText: "full text here" }, { apiKey: "x" }]) {
      const { ok } = await validateSourceRef({ id: "s", projectId: "p", kind: "web", title: "T", ...extra });
      assert.equal(ok, false, JSON.stringify(extra));
    }
  });
});
