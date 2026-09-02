import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Whose letterhead a report is drawn on.
 *
 * The donor decides the headers, margins, footer and watermark a report is
 * graded against — it is institutional in exactly the way identity and brand
 * marks are, and it was the last of the three still install-wide. A box
 * serving two colleges put one college's template on the other's submission,
 * and nothing failed: the .docx renders, it is simply the wrong document.
 */

const scratch = await mkdtemp(path.join(tmpdir(), "forge-donor-tenancy-"));
process.env.FORGE_REFERENCE_DIR = path.join(scratch, "reference");
process.env.FORGE_DECKS_DIR = path.join(scratch, "decks");
await mkdir(process.env.FORGE_REFERENCE_DIR, { recursive: true });
await mkdir(process.env.FORGE_DECKS_DIR, { recursive: true });

const REFERENCE = process.env.FORGE_REFERENCE_DIR;
const DECKS = process.env.FORGE_DECKS_DIR;

const { donorDirFor, donorDirForDeck, donorStatus, resolveDonor } = await import("../src/report.js");
const { userReferenceDir } = await import("../src/tenant.js");

/** A .docx only has to be findable here; nothing in this file opens one. */
async function putDonor(dir, name) {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), "PK");
}

async function deck(slug, meta) {
  const dir = path.join(DECKS, slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "meta.yaml"), meta);
  return dir;
}

test("an account with no template of its own uses the operator's", async () => {
  await putDonor(REFERENCE, "institute-template.docx");
  assert.equal(await donorDirFor("nobody@example.com"), REFERENCE);
  assert.equal(await donorDirFor(null), REFERENCE);
});

test("an account's own template overrides the operator's", async () => {
  const mine = userReferenceDir("a@example.com");
  await putDonor(mine, "my-college.docx");

  assert.equal(await donorDirFor("a@example.com"), mine);
  assert.equal((await donorStatus(await donorDirFor("a@example.com"))).detail, "my-college.docx");

  // And the account beside it is untouched — the failure this exists to stop.
  assert.equal(await donorDirFor("b@example.com"), REFERENCE);
  assert.equal((await donorStatus(await donorDirFor("b@example.com"))).detail, "institute-template.docx");
});

test("an empty account directory is not a template", async () => {
  // Uploading and then removing leaves the directory behind. Falling into it
  // would turn "I removed mine" into "reports stopped working".
  const dir = userReferenceDir("c@example.com");
  await mkdir(dir, { recursive: true });
  assert.equal(await donorDirFor("c@example.com"), REFERENCE);
});

test("a deck resolves the donor from its own owner, not the caller", async () => {
  // An admin rendering someone else's report must still draw it on THEIR
  // template. The deck records the owner, which is why renderReport needs no
  // user threaded through it.
  const owned = await deck("owned", "slug: owned\nowner: a@example.com\n");
  assert.equal(await donorDirForDeck(owned), userReferenceDir("a@example.com"));

  const cli = await deck("cli-run", "slug: cli-run\n");
  assert.equal(await donorDirForDeck(cli), REFERENCE);

  // A folder from before meta.yaml existed is the operator's, like every other
  // ownerless deck.
  const legacy = path.join(DECKS, "legacy");
  await mkdir(legacy, { recursive: true });
  assert.equal(await donorDirForDeck(legacy), REFERENCE);
});

test("the not-found error names the directory actually searched", async () => {
  // Pointing a user at the install-wide reference/ when their own account
  // directory is the empty one sends them to fix the wrong thing.
  const dir = path.join(scratch, "empty-somewhere");
  await mkdir(dir, { recursive: true });
  await assert.rejects(resolveDonor(null, dir), (err) => err.message.includes(dir));
});

test("the operator's own status still ignores the per-account subtree", async () => {
  // reference/users/ sits inside REFERENCE. donorStatus filters to .docx, so a
  // directory of accounts must not read as a second template and trip the
  // "multiple donors" refusal for everybody.
  const status = await donorStatus(REFERENCE);
  assert.equal(status.ok, true);
  assert.deepEqual(status.donors, ["institute-template.docx"]);
});

test.after(() => rm(scratch, { recursive: true, force: true }));
