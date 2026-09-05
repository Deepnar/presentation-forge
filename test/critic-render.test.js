import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import YAML from "yaml";
import JSZip from "jszip";

// finalizeDeck reads DECKS from src/paths.js at import time, so point the env
// at a scratch dir before importing the pipeline.
const scratch = await mkdtemp(path.join(tmpdir(), "forge-critic-"));
process.env.FORGE_DECKS_DIR = scratch;
// Pinned for the same reason FORGE_DECKS_DIR is: finalize now records the
// deck's score, and an unpinned config dir writes that row into the real
// config/scores.jsonl — a test polluting the operator's history.
process.env.FORGE_CONFIG_DIR = process.env.FORGE_CONFIG_DIR ?? path.join(scratch, "config");

const { finalizeDeck } = await import("../src/ai/pipeline.js");
const { render } = await import("../src/render.js");

const fakeChat = async () => ({ data: { findings: [] } });

/**
 * The text of each slide in the rendered .pptx, in deck order, so an assertion
 * can ask what the file people actually open says — and say it about the RIGHT
 * slide. Deck-wide matching is useless here: the title slide lists every team
 * member, so "is this presenter in the file" is true however the footers came
 * out. Numeric order matters too — slide10.xml sorts before slide2.xml.
 */
async function pptxSlides(file) {
  const zip = await JSZip.loadAsync(await readFile(file));
  const names = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const parts = await Promise.all(names.map((f) => zip.files[f].async("string")));
  return parts.map((x) => x.replace(/<[^>]+>/g, " "));
}

async function makeDeck(slug) {
  const dir = path.join(scratch, slug);
  await mkdir(path.join(dir, "research"), { recursive: true });
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify({
    slug,
    brief: "critic render test",
    theme: "warm-humanist",
    slidesPerMember: 1,
    team: {
      label: "Group T",
      members: [
        { name: "Ada Lovelace", roll: "1", presenting: true },
        { name: "Alan Turing", roll: "2", presenting: true },
      ],
    },
  }));
  await writeFile(path.join(dir, "plan.yaml"), YAML.stringify({
    title: "critic render test",
    sections: ["Intro", "Body"],
    slides: [
      { type: "title", section: 0, purpose: "open" },
      { type: "section", section: 0, purpose: "intro part" },
      { type: "bullets", section: 0, purpose: "key points" },
      { type: "bullets", section: 1, purpose: "body points" },
      { type: "closing", section: 1, purpose: "close" },
    ],
  }));
  await writeFile(path.join(dir, "deck.yaml"), YAML.stringify({
    title: "critic render test",
    sections: ["Intro", "Body"],
    theme: "warm-humanist",
    slides: [
      { type: "title", headline: "critic render test", subtitle: "s" },
      { type: "section", section: 0, headline: "Intro" },
      { type: "bullets", section: 0, headline: "Before the critic", bullets: ["a", "b", "c", "d"] },
      { type: "bullets", section: 1, headline: "Body points", bullets: ["a", "b", "c", "d"] },
      { type: "closing", headline: "Thanks" },
    ],
  }));
  return dir;
}

/**
 * The critic edits the deck and finalize keeps editing after it — a trim, a
 * grounding pass and the presenter re-assignment all run on its output. The
 * critic renders inside its own loop, so unless finalize draws the deck again
 * the .pptx is the deck as it stood BEFORE those passes: a different deck from
 * the deck.yaml beside it, and missing the presenters the ops layer dropped.
 */
test("a deck the critic changed is drawn again — the .pptx is the deck.yaml", async () => {
  const dir = await makeDeck("critic-render");
  // Stands in for the vision loop, and behaves like it in the two ways that
  // matter: the fix goes through the ops layer, which does not carry
  // `presenter` and so drops it; and the loop RENDERS what it hands back, so
  // the .pptx on disk is the critic's own last render, not a stale one.
  const critique = async ({ slug, deck }) => {
    const fixed = structuredClone(deck);
    const at = fixed.slides.findIndex((s) => s.headline === "Before the critic");
    fixed.slides[at].headline = "Shortened by the critic";
    for (const s of fixed.slides) delete s.presenter;
    const deckFile = path.join(scratch, slug, "deck.yaml");
    await writeFile(deckFile, YAML.stringify(fixed));
    await render({ deckFile, themeName: fixed.theme });
    return {
      slug,
      rounds: [{ round: 0, findings: [{ slide: at + 1, kind: "overflow", detail: "headline runs off" }], fixed: true }],
      deck: fixed,
    };
  };

  try {
    const r = await finalizeDeck({ slug: "critic-render", model: "mock", chat: fakeChat, critic: true, critique });

    const persisted = YAML.parse(await readFile(path.join(dir, "deck.yaml"), "utf8"));
    assert.ok(
      persisted.slides.some((s) => s.headline === "Shortened by the critic"),
      "the critic's edit is on disk",
    );
    const named = persisted.slides.filter((s) => s.presenter);
    assert.ok(named.length, "and finalize put the presenters back after it");

    const drawn = await pptxSlides(path.join(dir, "out", "deck.pptx"));
    assert.equal(drawn.length, persisted.slides.length, "every slide was drawn");
    assert.ok(drawn.some((x) => x.includes("Shortened by the critic")), "the .pptx is post-critic");

    // The load-bearing half, and it needs an exact assertion rather than a
    // containment one. The critic's own render happened BEFORE finalize
    // restored the presenters, and a slide with no `presenter` does not draw a
    // blank footer — chrome falls back to every presenting member joined by
    // "·". So the undrawn state still CONTAINS the right name; what it does is
    // print the whole team on every slide. Assert the others are absent.
    const roster = ["Ada Lovelace", "Alan Turing"];
    for (const [i, slide] of persisted.slides.entries()) {
      if (!slide.presenter) continue;
      const footer = drawn[i].replace(/\s+/g, " ").trim();
      assert.ok(footer.includes(slide.presenter), `slide ${i + 1} names ${slide.presenter}`);
      for (const other of roster.filter((n) => n !== slide.presenter)) {
        assert.ok(
          !footer.includes(other),
          `slide ${i + 1} presents as ${slide.presenter} alone, but drew: ${footer.slice(0, 120)}`,
        );
      }
    }
    assert.ok(r.critic?.rounds?.length, "the critic report is returned");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
