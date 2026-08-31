import { test } from "node:test";
import assert from "node:assert/strict";
import { fieldLengthPass, fieldInventory } from "../src/ai/fieldlength.js";
import { slideCatalog, catalogForType } from "../src/ai/catalog.js";
import { readFile } from "node:fs/promises";

/** The schema's own cap for a field, so a corrected cap does not fail a test
 *  that is about the inventory rather than about the number. */
async function schemaCap(type, path) {
  const schema = JSON.parse(await readFile(new URL("../schema/deck.schema.json", import.meta.url), "utf8"));
  const rule = schema.definitions.slide.allOf.find((r) => r.if?.properties?.type?.const === type);
  let node = rule.then.properties;
  for (const seg of path) node = seg === "[]" ? node.items : (node.properties ?? node)[seg];
  return node.maxLength;
}

const DECK = {
  title: "Field length",
  theme: "warm-humanist",
  slides: [
    {
      type: "framework",
      headline: "One Node, Four Parallel Levels",
      concept: { title: "Hybrid Node Layout", body: "MPI ranks own NUMA domains, OpenMP…" },
      elements: [
        { title: "MPI Ranks", body: "One rank per NUMA domain, not per core…" },
        { title: "OpenMP Threads", body: "Threads inside a rank share its memory…" },
        { title: "CUDA", body: "GPUs attached per rank" },
      ],
    },
    {
      type: "flow",
      headline: "Decompose",
      direction: "ltr",
      steps: [
        { title: "Decompose", body: "Split the application into fine-grained tasks that carry their own data use." },
        { title: "Express", body: "Task inputs and outputs form a directed acyclic graph (DAG) the…" },
      ],
    },
  ],
};

/** A fake chat returning a full-slide update_slide op (the shape this local
 *  model actually drifts toward) for both flagged slides. */
function fakeChat() {
  return async ({ schema }) => {
    const type = schema.properties.ops.items.properties.slide.properties.type.enum[0];
    if (type === "framework") {
      return {
        data: {
          ops: [{
            op: "update_slide",
            slide: {
              type: "framework",
              concept: { title: "Hybrid Node Layout", body: "MPI ranks own NUMA domains, OpenMP threads share rank memory." },
              elements: [
                { title: "MPI Ranks", body: "One rank per NUMA domain, not per core." },
                { title: "OpenMP Threads", body: "Threads inside a rank share its memory." },
                { title: "CUDA", body: "GPUs attached per rank" },
              ],
            },
          }],
        },
      };
    }
    return {
      data: {
        ops: [{
          op: "update_slide",
          slide: {
            type: "flow",
            headline: "Decompose",
            direction: "ltr",
            steps: [
              { title: "Decompose", body: "Split the application into fine-grained tasks that carry their own data use." },
              { title: "Express", body: "Task inputs and outputs form a directed acyclic graph the scheduler orders." },
            ],
          },
        }],
      },
    };
  };
}

test("fieldInventory states the schema cap per field — the writer's budget", async () => {
  const slide = DECK.slides[0];
  const inv = await fieldInventory(slide);
  const concept = inv.find((f) => f.path === "concept.body");
  assert.ok(concept, "concept.body is inventoried");
  assert.equal(concept.cap, await schemaCap("framework", ["concept", "body"]));
  const elem = inv.find((f) => f.path === "elements[].body");
  const elemCap = await schemaCap("framework", ["elements", "[]", "body"]);
  assert.equal(elem.cap, elemCap, "nested element bodies carry their own cap");
  assert.notEqual(elem.cap, concept.cap, "and not the parent's");
});

test("the catalog spells out the per-field caps, not just per-type", async () => {
  const catalog = await slideCatalog();
  assert.ok(catalog.includes("concept"), "framework concept field named");
  assert.ok(catalog.includes("≤120"), "a char cap is in the catalog");
  const flow = await catalogForType("flow");
  assert.ok(flow.includes("body ≤120") || flow.includes("≤120"), "flow step body cap reaches the writer");
});

test("fieldLengthPass rewrites mid-sentence ellipses into complete sentences", async () => {
  const r = await fieldLengthPass({ deck: DECK, model: "mock", chat: fakeChat() });
  const s6 = r.deck.slides[0];
  assert.ok(!s6.concept.body.includes("…"), "no ellipsis left in the concept body");
  assert.ok(s6.concept.body.length <= 120, "within the cap");
  assert.equal(s6.concept.body, "MPI ranks own NUMA domains, OpenMP threads share rank memory.");
  const rep = r.repaired.filter((x) => x.index === 0);
  assert.ok(rep.length >= 1, "the repair is recorded");
  assert.ok(r.problems.length === 0);
  // The flow slide's mid-sentence ellipsis is repaired too.
  assert.ok(!r.deck.slides[1].steps[1].body.includes("…"), "no ellipsis left in the flow step");
  assert.ok(r.deck.slides[1].steps[1].body.length <= 120);
});

test("fieldLengthPass leaves a deck with nothing overlong alone", async () => {
  const clean = {
    title: "t",
    theme: "warm-humanist",
    slides: [{ type: "bullets", headline: "Points", bullets: ["one", "two", "three", "four"] }],
  };
  const r = await fieldLengthPass({ deck: clean, model: "mock", chat: () => { throw new Error("no model call expected"); } });
  assert.deepEqual(r.repaired, []);
  assert.deepEqual(r.deck, clean);
});
