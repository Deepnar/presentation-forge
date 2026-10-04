// Slice B: FileRef is a stored project file. storageKey is opaque;
// paths and URLs never enter the domain.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateFileRef } from "../packages/model/validate.ts";

const VALID = {
  id: "file_1",
  projectId: "prj_1",
  name: "report.pdf",
  mime: "application/pdf",
  sizeBytes: 12345,
  hash: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  storageKey: "file_1/report.pdf",
  role: "source-of-truth",
};

describe("v2 fileref", () => {
  it("accepts a valid stored project file", async () => {
    const { ok, errors } = await validateFileRef(VALID);
    assert.equal(ok, true, errors.join("\n"));
  });

  it("requires projectId and storageKey", async () => {
    const { projectId, ...noProject } = VALID;
    assert.equal((await validateFileRef(noProject)).ok, false);
    const { storageKey, ...noKey } = VALID;
    assert.equal((await validateFileRef(noKey)).ok, false);
  });

  it("rejects invalid roles", async () => {
    assert.equal((await validateFileRef({ ...VALID, role: "everything" })).ok, false);
  });

  it("rejects path and URL fields via additionalProperties", async () => {
    for (const extra of [
      { localPath: "/data/x.pdf" },
      { blobUrl: "https://blob.vercel-storage.com/x" },
      { signedUrl: "https://example.com/x?sig=1" },
    ]) {
      const { ok } = await validateFileRef({ ...VALID, ...extra });
      assert.equal(ok, false, JSON.stringify(extra));
    }
  });

  it("accepts a well-formed hash and rejects malformed ones", async () => {
    for (const bad of ["xyz", "sha256:zzzz", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "md5:abc"]) {
      assert.equal((await validateFileRef({ ...VALID, hash: bad })).ok, false, bad);
    }
    const { hash, ...noHash } = VALID;
    assert.equal((await validateFileRef(noHash)).ok, true);
  });
});
