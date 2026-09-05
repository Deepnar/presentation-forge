import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import YAML from "yaml";
import { DIVIDER_TYPES } from "../src/ai/team.js";

// finalizeDeck reads DECKS from src/paths.js at import time, so this test
// imports the pipeline fresh after pointing the env at a scratch dir.
const scratch = await mkdtemp(path.join(tmpdir(), "forge-finalize-"));
process.env.FORGE_DECKS_DIR = scratch;
// Pinned for the same reason FORGE_DECKS_DIR is: finalize now records the
// deck's score, and an unpinned config dir writes that row into the real
// config/scores.jsonl — a test polluting the operator's history.
process.env.FORGE_CONFIG_DIR = process.env.FORGE_CONFIG_DIR ?? path.join(scratch, "config");

const { finalizeDeck } = await import("../src/ai/pipeline.js");

/** A fake model client: coherence review finds nothing, field-length rewrites
 *  nothing. A deck with short content never flags, so no model calls occur —
 *  the fake exists to make the pipeline not touch Ollama even if one does. */
const fakeChat = async () => ({ data: { findings: [] } });

async function makeDeck(slug) {
  const dir = path.join(scratch, slug);
  await mkdir(path.join(dir, "research"), { recursive: true });
  const meta = {
    slug,
    brief: "finalize presenter test",
    theme: "warm-humanist",
    slidesPerMember: 1,
    team: {
      label: "Group T",
      members: [
        { name: "A", roll: "1", presenting: true },
        { name: "B", roll: "2", presenting: true },
        { name: "C", roll: "3", presenting: true },
      ],
    },
  };
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify(meta));
  const plan = {
    title: "finalize presenter test",
    sections: ["Intro", "Body", "Close"],
    slides: [
      { type: "title", section: 0, purpose: "open" },
      { type: "section", section: 0, purpose: "intro part" },
      { type: "bullets", section: 0, purpose: "key points" },
      { type: "bullets", section: 1, purpose: "body points" },
      { type: "section", section: 1, purpose: "body part" },
      { type: "bullets", section: 2, purpose: "close points" },
      { type: "closing", section: 2, purpose: "close" },
    ],
  };
  await writeFile(path.join(dir, "plan.yaml"), YAML.stringify(plan));
  // The deck as the resume shortcut would leave it: content written, but with
  // NO presenters — the write half assigns them in memory only at the end, and
  // finalize re-reads deck.yaml from disk.
  const deck = {
    title: plan.title,
    sections: plan.sections,
    theme: "warm-humanist",
    slides: [
      { type: "title", headline: "finalize presenter test", subtitle: "s" },
      { type: "section", section: 0, headline: "Intro" },
      { type: "bullets", section: 0, headline: "Key points", bullets: ["a", "b", "c", "d"] },
      { type: "bullets", section: 1, headline: "Body points", bullets: ["a", "b", "c", "d"] },
      { type: "section", section: 1, headline: "Body" },
      { type: "bullets", section: 2, headline: "Close points", bullets: ["a", "b", "c", "d"] },
      { type: "closing", headline: "Thanks" },
    ],
  };
  await writeFile(path.join(dir, "deck.yaml"), YAML.stringify(deck));
  return dir;
}

test("finalizeDeck assigns presenters to a deck that reached finalize presenter-less", async () => {
  const dir = await makeDeck("finalize-presenters");
  try {
    const r = await finalizeDeck({ slug: "finalize-presenters", model: "mock", chat: fakeChat });
    const content = r.deck.slides.filter((s) => !DIVIDER_TYPES.has(s.type));
    assert.equal(content.length, 3, "three content slides");
    for (const s of content) assert.ok(s.presenter, `content slide gets a presenter (${s.type})`);
    // All three presenters are the team's — one per member, in order.
    assert.deepEqual(content.map((s) => s.presenter), ["A", "B", "C"]);
    // Dividers never carry a presenter.
    for (const s of r.deck.slides) {
      if (DIVIDER_TYPES.has(s.type)) assert.equal(s.presenter, undefined, `divider ${s.type} carries nothing`);
    }

    // The persisted deck.yaml carries the assignment too — finalize re-reads it
    // from disk, so the assignment must be on the file render reads.
    const persisted = YAML.parse(await readFile(path.join(dir, "deck.yaml"), "utf8"));
    const pContent = persisted.slides.filter((s) => !DIVIDER_TYPES.has(s.type));
    for (const s of pContent) assert.ok(s.presenter, `persisted content slide gets a presenter`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
