import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDeckTheme } from "../src/ai/pipeline.js";

test("stored briefing theme survives separate generate and finalize commands", () => {
  assert.equal(resolveDeckTheme({ meta: { theme: "blueprint" } }), "blueprint");
});

test("an explicit theme wins and an existing deck remains self-describing", () => {
  assert.equal(resolveDeckTheme({ explicit: "letterpress", deck: { theme: "sci-fi-hud" }, meta: { theme: "blueprint" } }), "letterpress");
  assert.equal(resolveDeckTheme({ deck: { theme: "sci-fi-hud" }, meta: { theme: "blueprint" } }), "sci-fi-hud");
});

test("theme resolution retains the documented fallback", () => {
  assert.equal(resolveDeckTheme(), "warm-humanist");
});
