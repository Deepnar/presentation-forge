import { test } from "node:test";
import assert from "node:assert/strict";
import { listPresets, savePreset, updatePreset, deletePreset, clearPresets } from "../src/presets.js";

// Presets are per-user files under the gitignored config/presets/. Tests use a
// dedicated email so they never collide with real accounts, and clean up after
// themselves. The config dir is the real one because paths.CONFIG is a
// constant — harmless, since the directory only ever holds test files here.
const EMAIL = "preset-test@forge.local";

test("presets CRUD: save, list, update, delete per user", async () => {
  await clearPresets(EMAIL);

  assert.deepEqual(await listPresets(EMAIL), []);

  const p = await savePreset(EMAIL, {
    name: "IE preset",
    team: { label: "Group 2b", members: [{ name: "A", presenting: true }] },
    maxSlides: 16,
    theme: "swiss-international",
    density: "dense",
    branding: "minimal",
    slidesPerMember: 2,
  });
  assert.ok(p.id);
  assert.equal(p.name, "IE preset");
  assert.equal(p.maxSlides, 16);

  const list = await listPresets(EMAIL);
  assert.equal(list.length, 1);
  assert.equal(list[0].density, "dense");
  assert.equal(list[0].branding, "minimal");
  assert.equal(list[0].maxSlides, 16);

  const updated = await updatePreset(EMAIL, p.id, { name: "IE preset", density: "balanced", maxSlides: 12 });
  assert.equal(updated.density, "balanced");
  assert.equal((await listPresets(EMAIL))[0].density, "balanced");
  assert.equal((await listPresets(EMAIL))[0].maxSlides, 12);

  await deletePreset(EMAIL, p.id);
  assert.deepEqual(await listPresets(EMAIL), []);
});

test("presets drop the pre-redesign guide/academic fields and keep only identity keys", async () => {
  await clearPresets(EMAIL);
  const p = await savePreset(EMAIL, {
    name: "old shape",
    team: {},
    guide: { name: "Dr. A. Sharma" },
    academic: { subject: "CG", year: "2026-27" },
    maxSlides: 0,            // a blank/zero count normalises to null
    slidesPerMember: 0,
  });
  assert.equal(p.guide, undefined);
  assert.equal(p.academic, undefined);
  assert.equal(p.maxSlides, null);
  assert.equal(p.slidesPerMember, null);
});

test("a stored pre-redesign file migrates on read", async () => {
  await clearPresets(EMAIL);
  const { writeFile, mkdir, rm } = await import("node:fs/promises");
  const path = await import("node:path");
  const { CONFIG } = await import("../src/paths.js");
  const dir = path.join(CONFIG, "presets");
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, `${EMAIL}.json`),
    JSON.stringify([{ id: "old", name: "legacy", team: {}, guide: { name: "G" }, academic: { subject: "S" }, maxSlides: 10 }]),
    "utf8",
  );
  const list = await listPresets(EMAIL);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "legacy");
  assert.equal(list[0].guide, undefined);
  assert.equal(list[0].academic, undefined);
  assert.equal(list[0].maxSlides, 10);
  await rm(dir, { recursive: true, force: true });
});

test("presets reject unnamed saves and unknown ids", async () => {
  await clearPresets(EMAIL);
  await assert.rejects(savePreset(EMAIL, { name: "  " }), /needs a name/);
  await assert.rejects(deletePreset(EMAIL, "missing"), /no such preset/);
  await assert.rejects(updatePreset(EMAIL, "missing", { name: "x" }), /no such preset/);
});

test("presets are scoped per user — one account's save is invisible to another", async () => {
  await clearPresets(EMAIL);
  await clearPresets("other@forge.local");
  await savePreset(EMAIL, { name: "A", team: {} });
  assert.equal((await listPresets(EMAIL)).length, 1);
  assert.deepEqual(await listPresets("other@forge.local"), []);
});
