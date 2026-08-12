import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDeck } from "../src/validate.js";
import { slideCatalog, deckSchema } from "../src/ai/catalog.js";
import { buildOpsSchema } from "../src/ai/ops.js";

const base = { title: "T", slides: [{ type: "title" }] };

const VALID = {
  "big-number": { value: "180 GW", label: "capacity by 2030", body: "A long claim about capacity.", sub: "source line" },
  agenda: { items: [{ title: "Intro" }, { title: "Method", desc: "how" }, { title: "Results" }] },
  milestone: { milestones: [{ when: "2021", title: "First plant", body: "opened" }, { when: "2026", title: "Scale-up" }] },
  "pros-cons": { pros: ["Cheap to run", "Clean output"], cons: ["Costly build", "Needs grid"] },
  emphasis: { body: "The one point that matters.", label: "Key point" },
  definition: { term: "Overpotential", definition: "Extra voltage beyond the ideal.", example: "e.g. 1.23 V ideal, ~1.8 V real" },
};

for (const [type, payload] of Object.entries(VALID)) {
  test(`${type}: a valid slide passes, wrong field types are rejected`, async () => {
    const ok = await validateDeck({ ...base, slides: [...base.slides, { type, ...payload }] });
    assert.equal(ok.ok, true, JSON.stringify(ok.errors));

    // The same field with the wrong shape must fail with a type message.
    const wrong = await validateDeck({
      ...base,
      slides: [...base.slides, { type, ...payload, ...badField(type) }],
    });
    assert.equal(wrong.ok, false);
    assert.ok(wrong.errors.some((e) => /must be/.test(e)), wrong.errors.join("; "));
  });
}

function badField(type) {
  const scalar = "not-an-array";
  switch (type) {
    case "big-number": return { value: 180 };            // value is a string
    case "agenda": return { items: [{ title: 5 }] };     // title is a string
    case "milestone": return { milestones: [{ when: "2021", title: 5 }] };
    case "pros-cons": return { pros: [5] };              // strings only
    case "emphasis": return { body: 5 };
    case "definition": return { term: 5 };
    default: return { items: scalar };
  }
}

test("new types are missing required fields and fail clearly", async () => {
  const r = await validateDeck({ ...base, slides: [...base.slides, { type: "big-number" }] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("missing required field \"value\"")));
  assert.ok(r.errors.some((e) => e.includes("missing required field \"label\"")));
});

test("the catalog picks up the new types and their families", async () => {
  const cat = await slideCatalog();
  const schema = await deckSchema();
  const enumTypes = schema.definitions.slide.properties.type.enum;

  for (const t of Object.keys(VALID)) assert.ok(enumTypes.includes(t));
  // Family categorisation is present and groups the new arrivals.
  assert.ok(cat.includes("DATA & STATS: stats, big-number"));
  assert.ok(cat.includes("COMPARISON: compare, pros-cons"));
  assert.ok(cat.includes("DEFINITIONS & FAQ: definition"));
  // Per-type detail auto-derives the fields from the schema.
  assert.ok(cat.includes("- big-number: value"));
  assert.ok(cat.includes("- milestone: milestones"));
});

test("the per-slide ops schema constrains to one new type's fields", async () => {
  const schema = await deckSchema();
  const ops = buildOpsSchema(schema, { slideCount: 2, onlyTypes: ["pros-cons"] });
  const slide = ops.properties.ops.items.properties.slide;
  assert.deepEqual(slide.required.sort(), ["cons", "pros", "type"]);
  assert.ok(slide.properties.pros.maxItems === 8);
});
