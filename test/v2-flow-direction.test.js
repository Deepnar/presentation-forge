// A flow authored top-to-bottom stays top-to-bottom in the editable scene.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compileDeck } from "../packages/compiler/compile.js";
import { validateScene } from "../packages/model/scene.ts";
import { convertGeneratedDeck } from "../src/projects/legacy-conversion.js";
import { warmDesign } from "./v2-fixture.js";

const steps = [
  { title: "Collect", body: "Gather readings from every cell" },
  { title: "Clean", body: "Drop sensor faults" },
  { title: "Model", body: "Fit the degradation curve" },
  { title: "Report", body: "Publish the ranking" },
];
const flow = direction => ({ title: "Flows", slides: [{ type: "flow", headline: "Pipeline", steps, ...(direction ? { direction } : {}) }] });

test("direction converts to a flow hint, and across stays the default", async () => {
  assert.deepEqual((await convertGeneratedDeck(flow("ttb"))).intent.slides[0].layoutHint, { flowDirection: "down" });
  assert.equal((await convertGeneratedDeck(flow("ltr"))).intent.slides[0].layoutHint, undefined);
  assert.equal((await convertGeneratedDeck(flow())).intent.slides[0].layoutHint, undefined);
});

test("a downward flow stacks its steps on a numbered rail, keeping across's element IDs", async () => {
  const design = await warmDesign();
  const down = compileDeck((await convertGeneratedDeck(flow("ttb"))).intent, design)[0];
  const across = compileDeck((await convertGeneratedDeck(flow("ltr"))).intent, design)[0];
  assert.ok((await validateScene(down)).ok);
  const downIds = new Set(down.elements.map(e => e.id));
  assert.ok(across.elements.every(e => downIds.has(e.id)), "every across element keeps its ID going down");
  assert.ok([...downIds].filter(id => !across.elements.some(e => e.id === id)).every(id => id.endsWith(":link")), "down only adds rail links");

  const chips = down.elements.filter(e => e.id.endsWith(":frame"));
  assert.equal(chips.length, 4);
  assert.ok(chips.every(c => c.shape.form === "ellipse" && c.x === chips[0].x), "chips share one rail");
  for (let i = 1; i < chips.length; i++) assert.ok(chips[i].y > chips[i - 1].y + chips[i - 1].h, "each step sits below the last");
  const links = down.elements.filter(e => e.id.endsWith(":link"));
  assert.equal(links.length, 3, "rail segments join consecutive chips");
  assert.ok(links.every(l => l.line.x2 === l.x), "the rail is vertical");

  const text = down.elements.filter(e => e.kind === "text" && e.semanticRef && !e.id.endsWith(":badge"));
  for (const step of steps) assert.ok(JSON.stringify(text).includes(step.body), step.title);
  const body = text.filter(e => !e.id.includes(":title:"));
  assert.ok(body.every(e => e.x > chips[0].x + chips[0].w), "step text sits beside the rail");
  assert.ok(down.elements.every(e => e.x >= 0 && e.y >= 0 && e.x + e.w <= down.width + 1e-9 && e.y + e.h <= down.height + 1e-9));

  const acrossChips = across.elements.filter(e => e.id.endsWith(":frame"));
  assert.ok(acrossChips.every(c => c.y === acrossChips[0].y), "across keeps its row");
});
