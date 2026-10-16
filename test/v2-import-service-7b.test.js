import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import YAML from "yaml";

const exec = promisify(execFile);
const scratch = await mkdtemp(path.join(tmpdir(), "forge-import-7b-"));
process.env.FORGE_DB_PATH = path.join(scratch, "forge.db");
process.env.FORGE_CONFIG_DIR = path.join(scratch, "config");
process.env.FORGE_DECKS_DIR = path.join(scratch, "decks");
process.env.FORGE_PROJECTS_BACKEND = "sqlite";
process.env.FORGE_HOSTED = "0";
const { importGeneratedProject } = await import("../src/projects/import-generated.js");
const store = await import("../src/projects/store.js");
const { getDb, closeDb } = await import("../src/db.js");
const { userIdentityFile } = await import("../src/tenant.js");
const principal = { email: "owner@example.test" };
const sourceDeck = {
  title: "Imported results", theme: "warm-humanist",
  slides: [
    { type: "title", headline: "Imported results" },
    { type: "chart", headline: "Conductivity", chart: { kind: "bar", categories: ["A", "B"], series: [{ name: "mS/cm", values: [1.25, 12.5] }], unit: "mS/cm" } },
    { type: "table", headline: "Values", columns: ["Cell", "Score"], rows: [["A", "1.25"], ["B", "12.5"]] },
  ],
};
let serial = 0;
async function source({ deck = sourceDeck, owner = principal.email, meta = {}, raw = null } = {}) {
  const slug = `source-${++serial}`;
  const dir = path.join(process.env.FORGE_DECKS_DIR, slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "deck.yaml"), raw ?? YAML.stringify(deck));
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify({ owner, status: "ready", ...meta }));
  return { slug, dir, requestId: "request-one", principal };
}
before(async () => mkdir(process.env.FORGE_DECKS_DIR, { recursive: true }));
after(async () => { closeDb(); await rm(scratch, { recursive: true, force: true }); });

test("creates a real project and recoverable revision zero without changing source", async () => {
  const args = await source();
  const bytes = await readFile(path.join(args.dir, "deck.yaml"), "utf8");
  const result = await importGeneratedProject(args);
  assert.equal(result.reused, false);
  assert.equal(result.project.revision, 0);
  assert.equal(result.project.origin.sourceDeck, args.slug);
  assert.equal(result.project.scenes.length, 3);
  assert.ok(!result.project.scenes[0].elements.some(e => e.id.includes(":chrome:")));
  const footer = result.project.scenes[1].elements.find(e => e.id.endsWith(":chrome:slide-number"));
  assert.equal(footer.paragraphs[0].runs[0].text, "2 / 3");
  assert.equal(footer.locked, true); assert.equal(footer.provenance, "compiler");
  assert.equal(result.project.scenes[1].elements.find(e => e.kind === "chart").chart.series[0].values[0], 1.25);
  assert.deepEqual(result.project.scenes[2].elements.find(e => e.kind === "table").table.rows[1], ["A", "1.25"]);
  assert.equal((await store.listRevisions({ owner: principal.email, id: result.project.id })).revisions.length, 1);
  assert.equal(await readFile(path.join(args.dir, "deck.yaml"), "utf8"), bytes);
});

test("simultaneous requests return one project and baseline; retries retain later human edits", async () => {
  const args = await source();
  const results = await Promise.all(Array.from({ length: 6 }, () => importGeneratedProject(args)));
  assert.equal(new Set(results.map(r => r.project.id)).size, 1);
  assert.equal(results.filter(r => !r.reused).length, 1);
  const created = results[0].project;
  await store.renameProject({ owner: principal.email, id: created.id, baseRevision: 0, title: "Human title" });
  const retried = await importGeneratedProject(args);
  assert.equal(retried.reused, true);
  assert.equal(retried.project.title, "Human title");
  assert.equal(retried.project.revision, 1);
  assert.equal(retried.timings.compileMs, undefined);
});

test("a changed source conflicts until an explicit new request is used", async () => {
  const args = await source(); const original = await importGeneratedProject(args);
  await writeFile(path.join(args.dir, "deck.yaml"), YAML.stringify({ ...sourceDeck, title: "New source title" }));
  await assert.rejects(importGeneratedProject(args), { code: "import-source-changed" });
  const next = await importGeneratedProject({ ...args, requestId: "request-two" });
  assert.notEqual(next.project.id, original.project.id);
  assert.equal((await store.getProject({ owner: principal.email, id: original.project.id })).doc.title, sourceDeck.title);
});

test("deleted imports cannot silently resurrect on retry", async () => {
  const args = await source(); const { project } = await importGeneratedProject(args);
  await store.deleteProject({ owner: principal.email, id: project.id });
  await assert.rejects(importGeneratedProject(args), { code: "import-target-deleted" });
});

test("theme, style and explicit dark appearance reach the shared compiler and retry fingerprint", async () => {
  const args = await source({ deck: { ...sourceDeck, style: "airy" } });
  const light = await importGeneratedProject(args);
  await assert.rejects(importGeneratedProject({ ...args, mode: "dark" }), { code: "import-source-changed" });
  const dark = await importGeneratedProject({ ...args, requestId: "request-two", mode: "dark" });
  assert.deepEqual(dark.project.theme, { name: "warm-humanist", variant: "dark" });
  assert.notEqual(dark.project.scenes[1].background.fill, light.project.scenes[1].background.fill);
  const bad = await source({ deck: { ...sourceDeck, style: "../../private" } });
  await assert.rejects(importGeneratedProject(bad), { code: "bad-style" });
});

test("source and target owner checks prevent cross-owner and silent ownerless claiming", async () => {
  const args = await source();
  await assert.rejects(importGeneratedProject({ ...args, principal: { email: "other@example.test", admin: true } }), { code: "not-found" });
  const local = await source({ owner: null });
  await assert.rejects(importGeneratedProject(local), { code: "not-found" });
  await assert.rejects(importGeneratedProject({ ...local, principal: null }), { code: "unauthorized" });
  const result = await importGeneratedProject({ ...local, principal: null, localOperator: true });
  assert.equal((await store.getProject({ owner: null, id: result.project.id })).doc.id, result.project.id);
  assert.equal((await store.getProject({ owner: principal.email, id: result.project.id })).doc, null);
});

test("incomplete, checkpointed and shorter-than-plan sources refuse before writing", async () => {
  const before = (await store.listProjects({ owner: principal.email })).projects.length;
  const args = await source({ meta: { status: "writing" } });
  await assert.rejects(importGeneratedProject(args), { code: "source-incomplete" });
  const run = await source(); await writeFile(path.join(run.dir, ".run.json"), "{}");
  await assert.rejects(importGeneratedProject(run), { code: "source-incomplete" });
  const partial = await source(); await writeFile(path.join(partial.dir, "plan.yaml"), YAML.stringify({ slides: Array.from({ length: 4 }, () => ({ type: "title" })) }));
  await assert.rejects(importGeneratedProject(partial), { code: "source-incomplete" });
  assert.equal((await store.listProjects({ owner: principal.email })).projects.length, before);
});

test("unrepresentable content and institutional chrome refuse atomically", async () => {
  const before = (await store.listProjects({ owner: principal.email })).projects.length;
  for (const args of [await source({ deck: { ...sourceDeck, slides: [...sourceDeck.slides, { type: "venn", headline: "Sets", sets: [{ label: "A", items: ["One"] }, { label: "B", items: ["Two"] }] }] } }), await source({ meta: { team: { members: [{ name: "Do not drop" }] } } })]) {
    await assert.rejects(importGeneratedProject(args), { code: "unsupported-content" });
  }
  assert.equal((await store.listProjects({ owner: principal.email })).projects.length, before);
});

test("untyped comparison extensions refuse before creating a project, history or receipt", async () => {
  const args = await source({ deck: { title: "Options", slides: [{ type: "vs", headline: "Choose", left: { title: "A", body: { detail: "Do not lose" } }, right: { title: "B" } }] } });
  const counts = () => ["v2_projects", "v2_project_revisions", "v2_project_imports"].map(table => getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
  const before = counts();
  await assert.rejects(importGeneratedProject(args), error => error.code === "unsupported-content" && error.details.some(d => d.path.endsWith("left.body")));
  assert.deepEqual(counts(), before);
});

test("effective identity includes inherited operator and per-owner settings and refuses their loss", async () => {
  const args = await source();
  const base = path.join(process.env.FORGE_CONFIG_DIR, "identity.example.yaml");
  const operator = path.join(process.env.FORGE_CONFIG_DIR, "identity.yaml");
  const user = userIdentityFile(principal.email);
  await mkdir(path.dirname(user), { recursive: true });
  const before = (await store.listProjects({ owner: principal.email })).projects.length;
  for (const [file, value] of [[base, { institution: { name: "Inherited institution" } }], [operator, { brand: { banner: "brand/banner.png" } }], [user, { team: { label: "Remembered presenter" } }]]) {
    await writeFile(file, YAML.stringify(value));
    try { await assert.rejects(importGeneratedProject(args), { code: "unsupported-content" }); }
    finally { await rm(file, { force: true }); }
  }
  assert.equal((await store.listProjects({ owner: principal.email })).projects.length, before);
});

test("presenter remains locked furniture; effective chrome changes conflict and suppressed metadata refuses", async () => {
  const deck = structuredClone(sourceDeck); deck.slides[1].presenter = "Presenter A";
  const args = await source({ deck }); const original = await importGeneratedProject(args);
  const presenter = original.project.scenes[1].elements.find(e => e.id.endsWith(":chrome:presenter"));
  assert.equal(presenter.paragraphs[0].runs[0].text, "Presenter A");
  assert.equal(presenter.locked, true); assert.equal(presenter.semanticRef, undefined);
  assert.equal(presenter.provenance, "compiler");
  const operator = path.join(process.env.FORGE_CONFIG_DIR, "identity.yaml");
  await writeFile(operator, YAML.stringify({ chrome: { slide_numbers: false } }));
  try {
    await assert.rejects(importGeneratedProject(args), { code: "import-source-changed" });
    const next = await importGeneratedProject({ ...args, requestId: "request-two" });
    assert.ok(!next.project.scenes.some(scene => scene.elements.some(e => e.id.endsWith(":chrome:slide-number"))));
    assert.ok(next.project.scenes[1].elements.some(e => e.id.endsWith(":chrome:presenter")));
  } finally { await rm(operator, { force: true }); }
  for (const chrome of [{ branding: "none" }, { presenter_on_slides: false }, { unknown: true }]) {
    await assert.rejects(importGeneratedProject(await source({ deck, meta: { chrome } })), { code: "unsupported-content" });
  }
  const divider = structuredClone(sourceDeck); divider.slides[0].presenter = "Do not drop";
  await assert.rejects(importGeneratedProject(await source({ deck: divider })), { code: "unsupported-content" });
});

test("filesystem symlinks, traversal and YAML alias inputs cannot bypass the source boundary", async () => {
  await assert.rejects(importGeneratedProject({ slug: "../private", requestId: "request-one", principal }), { code: "not-found" });
  const args = await source();
  await rm(path.join(args.dir, "deck.yaml")); await symlink(path.join(scratch, "forge.db"), path.join(args.dir, "deck.yaml"));
  await assert.rejects(importGeneratedProject(args), { code: "invalid-source" });
  const aliased = await source({ raw: "title: Aliased\nslides: &slides [*slides]\n" });
  await assert.rejects(importGeneratedProject(aliased), { code: "invalid-source" });
});

test("history failure rolls back the project and request reservation so retry succeeds", async () => {
  const args = await source();
  getDb().exec("CREATE TRIGGER fail_import_history BEFORE INSERT ON v2_project_revisions BEGIN SELECT RAISE(FAIL, 'import history fault'); END");
  await assert.rejects(importGeneratedProject(args), { code: "storage-unavailable" });
  getDb().exec("DROP TRIGGER fail_import_history");
  const result = await importGeneratedProject(args);
  assert.equal(result.reused, false);
});

test("a receipt read failure is storage-unavailable, leaves state intact and permits retry after recovery", async () => {
  const args = await source(); const created = await importGeneratedProject(args);
  getDb().exec("ALTER TABLE v2_project_imports RENAME TO held_import_receipts; CREATE VIEW v2_project_imports AS SELECT * FROM missing_import_receipts");
  try { await assert.rejects(importGeneratedProject(args), { code: "storage-unavailable" }); }
  finally { getDb().exec("DROP VIEW v2_project_imports; ALTER TABLE held_import_receipts RENAME TO v2_project_imports"); }
  const recovered = await importGeneratedProject(args);
  assert.equal(recovered.reused, true); assert.deepEqual(recovered.project, created.project);
});

test("separate CLI processes share durable retry identity across restart", async () => {
  const args = await source({ owner: null });
  const run = () => exec(process.execPath, ["src/projects/import-cli.js", args.slug, "--request-id", args.requestId], { env: { ...process.env, FORGE_IMPORT_TOKEN: "" }, timeout: 20000 });
  const results = await Promise.all([run(), run()]);
  const parsed = results.map(r => JSON.parse(r.stdout));
  assert.equal(parsed[0].project.id, parsed[1].project.id);
  assert.equal(parsed.filter(r => !r.reused).length, 1);
  assert.equal(JSON.parse((await run()).stdout).reused, true);
});
