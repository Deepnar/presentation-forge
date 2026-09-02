import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * What a newly minted slug is allowed to tell its caller.
 *
 * `decks/` is one flat namespace shared by every account, and the collision
 * counter answered from all of it: asking for a title someone else already had
 * returned `-2`, `-4`, and on the dev box `-19`. That is a readout of how many
 * strangers hold the same title, handed to anyone who can create a deck.
 *
 * The fix is not a better counter. A suffix that appears only when something
 * collided still answers the question one bit at a time, so an owned deck
 * carries a token unconditionally and its presence means nothing.
 */

const scratch = await mkdtemp(path.join(tmpdir(), "forge-slug-"));
process.env.FORGE_DECKS_DIR = path.join(scratch, "decks");
await mkdir(process.env.FORGE_DECKS_DIR, { recursive: true });

const DECKS = process.env.FORGE_DECKS_DIR;
const { uniqueSlug, slugify } = await import("../src/ai/pipeline.js");

async function seed(...slugs) {
  for (const s of slugs) await mkdir(path.join(DECKS, s), { recursive: true });
}
async function clear() {
  for (const e of await readdir(DECKS)) await rm(path.join(DECKS, e), { recursive: true, force: true });
}

test("an ownerless mint keeps the readable counter", async () => {
  await clear();
  assert.equal(await uniqueSlug("Solar Microgrids"), "solar-microgrids");
  await seed("solar-microgrids");
  assert.equal(await uniqueSlug("Solar Microgrids"), "solar-microgrids-2");
  await seed("solar-microgrids-2", "solar-microgrids-3");
  assert.equal(await uniqueSlug("Solar Microgrids"), "solar-microgrids-4");
});

test("an owned mint carries a token whether or not anything collided", async () => {
  await clear();
  // Nothing on disk: the token is still there. This is the whole property —
  // a clean slug would mean "nobody else has this title".
  const fresh = await uniqueSlug("Solar Microgrids", "a@example.com");
  assert.match(fresh, /^solar-microgrids-[a-z0-9]{4}$/);

  await seed("solar-microgrids", "solar-microgrids-2", "solar-microgrids-3");
  const crowded = await uniqueSlug("Solar Microgrids", "b@example.com");
  assert.match(crowded, /^solar-microgrids-[a-z0-9]{4}$/);
});

test("the minted slug is independent of what other accounts hold", async () => {
  // The observable a probe would read: the shape of the answer must not change
  // as the box fills up with other people's decks on the same title.
  await clear();
  const empty = [];
  for (let i = 0; i < 40; i++) empty.push(await uniqueSlug("Shared Title", "a@example.com"));

  await seed(...Array.from({ length: 30 }, (_, i) => `shared-title-${i + 2}`), "shared-title");
  const crowded = [];
  for (let i = 0; i < 40; i++) crowded.push(await uniqueSlug("Shared Title", "b@example.com"));

  const shape = (s) => s.replace(/[a-z0-9]{4}$/, "#");
  assert.deepEqual(new Set(empty.map(shape)), new Set(["shared-title-#"]));
  assert.deepEqual(new Set(crowded.map(shape)), new Set(["shared-title-#"]));

  // And it is not a counter wearing a costume: 40 mints, 40 different answers.
  assert.ok(new Set(empty).size > 35, `expected distinct tokens, got ${new Set(empty).size}/40`);
});

test("an owned mint never returns a directory that already exists", async () => {
  await clear();
  // Exhaust the token space the only way a test can: seed every one it draws.
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    const s = await uniqueSlug("Collide", "a@example.com");
    assert.equal(seen.has(s), false, `${s} was minted twice`);
    seen.add(s);
    await seed(s);
  }
});

test("cloning an owned deck stays in the owner's namespace", async () => {
  await clear();
  const { cloneDeck } = await import("../src/ai/pipeline.js");

  await mkdir(path.join(DECKS, "owned-deck"), { recursive: true });
  await writeFile(path.join(DECKS, "owned-deck", "meta.yaml"), "slug: owned-deck\nowner: a@example.com\n");
  await writeFile(path.join(DECKS, "owned-deck", "deck.yaml"), "slides: []\n");
  const owned = await cloneDeck({ slug: "owned-deck" });
  assert.match(owned.slug, /^owned-deck-copy-[a-z0-9]{4}$/);

  // A CLI deck has no owner and keeps the readable name.
  await mkdir(path.join(DECKS, "cli-deck"), { recursive: true });
  await writeFile(path.join(DECKS, "cli-deck", "meta.yaml"), "slug: cli-deck\n");
  await writeFile(path.join(DECKS, "cli-deck", "deck.yaml"), "slides: []\n");
  assert.equal((await cloneDeck({ slug: "cli-deck" })).slug, "cli-deck-copy");
});

test("the token cannot escape the slug character set", async () => {
  await clear();
  const s = await uniqueSlug("Ünïcödé — Tïtlé!", "a@example.com");
  assert.match(s, /^[a-z0-9][a-z0-9_-]{0,99}$/, "must satisfy the server's SLUG_RE");
  assert.ok(s.startsWith(slugify("Ünïcödé — Tïtlé!")));
});

test.after(() => rm(scratch, { recursive: true, force: true }));
