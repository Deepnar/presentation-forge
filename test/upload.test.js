import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Upload-only research mode. The whole file runs against a scratch CONFIG dir
 * so staging never touches the real config/. paths.js resolves CONFIG at
 * import time, so the env must be set BEFORE the modules load — hence dynamic
 * imports here, never static ones.
 */
const scratch = await mkdtemp(path.join(os.tmpdir(), "forge-upload-"));
process.env.FORGE_CONFIG_DIR = scratch;

const upload = await import("../src/ai/upload.js");
const { resolveResearchSource } = await import("../src/ai/pipeline.js");
const { groundDeck } = await import("../src/ai/grounding.js");
const { researchSummary } = await import("../src/ai/research.js");

const { ingestUpload, stageUpload, readStagedUpload, sweepStagedUploads, uploadStageDir, UPLOAD_MAX_BYTES, UPLOAD_MAX_WORDS } = upload;

test("ingestUpload accepts markdown and trims it", async () => {
  const r = await ingestUpload(Buffer.from("\uFEFF# Solar pumping\n\nRooftop solar reaches 2.1 GW by 2025.\n\n"), { name: "notes.md" });
  assert.equal(r.text, "# Solar pumping\n\nRooftop solar reaches 2.1 GW by 2025.");
  assert.equal(r.ext, "md");
  assert.equal(r.words, 10);
});

test("ingestUpload rejects an empty buffer", async () => {
  await assert.rejects(ingestUpload(Buffer.alloc(0), { name: "empty.txt" }), /empty/);
});

test("ingestUpload rejects a binary file disguised as .txt", async () => {
  const junk = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(64, 0x00), Buffer.from("text")]);
  await assert.rejects(ingestUpload(junk, { name: "evil.txt" }), /binary/);
});

test("ingestUpload rejects a file over the size cap", async () => {
  const big = Buffer.alloc(UPLOAD_MAX_BYTES + 1, 0x20);
  await assert.rejects(ingestUpload(big, { name: "big.md" }), /too large/);
});

test("ingestUpload rejects an unsupported extension", async () => {
  await assert.rejects(ingestUpload(Buffer.from("hello"), { name: "page.html" }), /unsupported/);
  await assert.rejects(ingestUpload(Buffer.from("x"), { ext: "exe" }), /unsupported/);
});

test("ingestUpload rejects a document beyond the word cap", async () => {
  const text = Array.from({ length: UPLOAD_MAX_WORDS + 5 }, (_, i) => `w${i}`).join(" ");
  await assert.rejects(ingestUpload(Buffer.from(text), { name: "long.md" }), /too long/);
});

test("stage + resolve a briefing document round-trips", async () => {
  const staged = await stageUpload({ text: "# Only this file\n\n42 MW of pumping.", name: "brief.docx", ext: "docx", words: 7 });
  assert.ok(staged.token.startsWith("up-"));
  const resolved = await readStagedUpload(staged.token);
  assert.equal(resolved.name, "brief.docx");
  assert.ok(resolved.text.includes("42 MW"));
  const dir = uploadStageDir();
  assert.ok((await readFile(path.join(dir, `${staged.token}.json`), "utf8")).includes("42 MW"));
  await rm(dir, { recursive: true, force: true });
});

test("resolve rejects a missing or malformed token", async () => {
  assert.equal(await readStagedUpload("up-nope-1234"), null);
  assert.equal(await readStagedUpload("../../config/local.yaml"), null);
  await assert.rejects(resolveResearchSource({ researchSource: "upload", upload: { token: "up-missing-1234" } }), /re-upload/);
});

test("sweep drops only expired staged documents", async () => {
  const dir = uploadStageDir();
  const a = await stageUpload({ text: "fresh", name: "a.md", ext: "md", words: 1 });
  const old = await stageUpload({ text: "old", name: "b.md", ext: "md", words: 1 });
  const past = new Date(Date.now() - 48 * 60 * 60 * 1000 - 1000);
  await utimes(path.join(dir, `${old.token}.json`), past, past);
  await sweepStagedUploads();
  assert.ok((await readStagedUpload(a.token)) != null, "fresh stage survives");
  assert.equal(await readStagedUpload(old.token), null, "expired stage is swept");
  await rm(dir, { recursive: true, force: true });
});

test("resolveResearchSource: explicit upload beats legacy booleans", async () => {
  const r = await resolveResearchSource({ researchSource: "upload", research: false, upload: { name: "a.md", text: "Only this file." } });
  assert.equal(r.mode, "upload");
  assert.equal(r.text, "Only this file.");
  assert.equal(r.name, "a.md");
});

test("resolveResearchSource: upload mode without content errors", async () => {
  await assert.rejects(resolveResearchSource({ researchSource: "upload", upload: {} }), /no uploaded file/);
});

test("resolveResearchSource: legacy booleans keep their meaning", async () => {
  assert.equal((await resolveResearchSource({ research: true })).mode, "web");
  assert.equal((await resolveResearchSource({ research: false, sources: ["https://x.example"] })).mode, "web");
  assert.equal((await resolveResearchSource({})).mode, "none");
  assert.equal((await resolveResearchSource({ researchSource: "none" })).mode, "none");
  assert.equal((await resolveResearchSource({ researchSource: "web" })).mode, "web");
});

test("upload-only grounding is strict fidelity against the file", () => {
  const file = "# My notes\n\nThe plant reaches 2.1 GW by 2025. Cost is 4.2 INR per unit.";
  const deck = {
    title: "T",
    slides: [
      { type: "stats", headline: "Scale", stats: [
        { value: "2.1 GW", label: "capacity" },
        { value: "900 MW", label: "invented" },
      ] },
    ],
  };
  const { findings, problems, notes } = groundDeck(deck, file, { label: "your uploaded file" });
  assert.equal(findings.length, 1);
  assert.ok(findings[0].claims.includes("900 MW"));
  assert.ok(!findings[0].claims.includes("2.1 GW"));
  assert.ok(problems.some((p) => p.includes("900 MW")));
  assert.ok(notes.slides[0].notes.includes("not found in your uploaded file"));
});

test("researchSummary counts a user-provided source without domain noise", () => {
  const s = researchSummary([
    { kind: "user-provided", name: "brief.md", title: "brief.md", words: 20 },
    { url: "https://example.com/a", title: "A" },
  ]);
  assert.equal(s.userProvided, 1);
  assert.equal(s.total, 2);
  assert.equal(s.distinctDomains, 1);
});
