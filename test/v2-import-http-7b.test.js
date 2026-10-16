import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import JSZip from "jszip";
import { importApiFixture, IMPORT_DECK } from "./v2-import-fixture.js";

const exec = promisify(execFile);
let fixture;
before(async () => { fixture = await importApiFixture(); });
after(async () => { await fixture?.stop(); });

test("real authenticated HTTP import creates, reopens and exports native chart/table objects", async () => {
  const { slug } = await fixture.source();
  const response = await fixture.create(slug); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.reused, false);
  const reopened = await fixture.request(`/api/v2/projects/${result.project.id}`, { token: fixture.token }).then(r => r.json());
  assert.deepEqual(reopened.project, result.project);
  const output = await fixture.request(`/api/v2/projects/${result.project.id}/export.pptx`, { token: fixture.token });
  assert.equal(output.status, 200);
  const zip = await JSZip.loadAsync(await output.arrayBuffer());
  const chart = await zip.file("ppt/charts/chart1.xml").async("string");
  assert.ok(chart.includes("1.25") && chart.includes("12.5"));
  const table = await zip.file("ppt/slides/slide3.xml").async("string");
  assert.ok(table.includes("<a:tbl>") && table.includes("12.5"));
});

test("HTTP retries and an owned CLI call share identity and retain a human rename", async () => {
  const { slug } = await fixture.source(); const result = await fixture.create(slug).then(r => r.json());
  const renamed = await fixture.request(`/api/v2/projects/${result.project.id}`, { token: fixture.token, method: "PATCH", body: JSON.stringify({ title: "Human choice", baseRevision: 0 }) });
  assert.equal(renamed.status, 200);
  const cli = await exec(process.execPath, ["src/projects/import-cli.js", slug, "--request-id", "request-one"], { env: { ...fixture.env, FORGE_IMPORT_TOKEN: fixture.token }, timeout: 20000 });
  const retry = JSON.parse(cli.stdout);
  assert.equal(retry.reused, true); assert.equal(retry.project.id, result.project.id);
  assert.equal(retry.project.title, "Human choice"); assert.equal(retry.project.revision, 1);
});

test("signed-out, cross-owner and malformed-source requests disclose no project", async () => {
  const { slug, folder } = await fixture.source();
  assert.equal((await fixture.create(slug, { token: null })).status, 401);
  assert.equal((await fixture.create(slug, { token: fixture.otherToken })).status, 404);
  await writeFile(path.join(folder, "deck.yaml"), "not: [valid");
  assert.equal((await fixture.create(slug, { token: fixture.otherToken })).status, 404);
  assert.equal((await fixture.create(slug)).status, 422);
});

test("owner spoofing, missing request identity and unknown options are refused", async () => {
  const { slug } = await fixture.source();
  for (const body of [{ owner: "other@example.test", requestId: "request-one" }, {}, { requestId: "short" }, { requestId: "request-one", mode: "custom" }]) {
    const response = await fixture.request(`/api/decks/${slug}/v2-project`, { token: fixture.token, method: "POST", body: JSON.stringify(body) });
    assert.equal(response.status, 400);
  }
});

test("pending or unsupported generation reports an actionable refusal without a saved project", async () => {
  const pending = await fixture.source({ meta: { status: "writing" } });
  assert.equal((await fixture.create(pending.slug)).status, 409);
  const notes = await fixture.source({ deck: { ...IMPORT_DECK, slides: IMPORT_DECK.slides.map((s, i) => i === 0 ? { ...s, notes: "Unstored speaker notes" } : s) } });
  const response = await fixture.create(notes.slug); assert.equal(response.status, 422);
  const result = await response.json(); assert.equal(result.code, "unsupported-content");
  assert.ok(result.errors.some(error => error.path.includes("notes")));
});

test("legacy project metadata endpoint keeps its original response contract", async () => {
  const { slug } = await fixture.source();
  const response = await fixture.request(`/api/decks/${slug}/project`, { token: fixture.token });
  assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.project.slug, slug); assert.equal(result.project.scenes, undefined);
});

test("misconfigured PostgreSQL is an honest 503 and never a SQLite fallback", async () => {
  const unavailable = await importApiFixture({ FORGE_PROJECTS_BACKEND: "postgres", FORGE_PROJECTS_DATABASE_URL: "" });
  try {
    const { slug } = await unavailable.source();
    const response = await unavailable.create(slug); assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "store-misconfigured");
  } finally { await unavailable.stop(); }
});
