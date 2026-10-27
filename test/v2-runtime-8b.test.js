import { runtimeContract } from "./v2-runtime-contract.js";
import { scenario } from "./v2-runtime-fixture.js";
runtimeContract("SQLite", scenario);

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("persisted semantic plan schemas retain the canonical tool contract", async () => {
  const read = async (name) =>
    JSON.parse(await readFile(new URL(name, import.meta.url), "utf8"));
  const tool = await read("../packages/tools/request.schema.json");
  tool.oneOf = tool.oneOf.filter(b => ['get_project','get_slide','get_selected_elements','edit_content'].includes(b.properties.tool.const));
  delete tool.$schema;
  delete tool.title;
  const plan = await read("../packages/agent/run-plan.schema.json"),
    record = await read("../packages/agent/run.schema.json");
  assert.deepEqual(plan.properties.steps.items, tool);
  delete plan.$schema;
  delete plan.title;
  assert.deepEqual(record.definitions.plan, plan);
});
