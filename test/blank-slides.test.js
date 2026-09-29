import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDeck } from "../src/validate.js";
import { blankSlideForType } from "../app/web/src/lib/blankSlides.js";
import { TYPE_FIELDS } from "../app/web/src/components/slideEditorFields.js";

test("every editor type has a blank that validates", async () => {
  const failures = [];
  for (const type of Object.keys(TYPE_FIELDS)) {
    if (type === "title") continue;
    const slide = blankSlideForType(type);
    const deck = { title: "Blank check", slides: [slide] };
    const r = await validateDeck(deck);
    if (!r.ok) failures.push(`${type}: ${r.errors.slice(0, 2).join(" | ")}`);
  }
  // illustrated-points has no editor descriptor yet; blank still validates.
  const extra = blankSlideForType("illustrated-points");
  const re = await validateDeck({ title: "Blank check", slides: [extra] });
  if (!re.ok) failures.push(`illustrated-points: ${re.errors.slice(0, 2).join(" | ")}`);
  assert.equal(failures.length, 0, `invalid blanks:\n  - ${failures.join("\n  - ")}`);
});

test("blank bullets meets the raised 4-item floor", async () => {
  const slide = blankSlideForType("bullets");
  assert.ok(slide.bullets.length >= 4);
  const r = await validateDeck({ title: "t", slides: [slide] });
  assert.equal(r.ok, true);
});
