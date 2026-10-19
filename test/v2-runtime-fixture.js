import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setDbPathForTest } from "../src/db.js";
import * as sqlite from "../src/projects/store.js";
import { createRuntime } from "../packages/agent/runtime.ts";
import { seed, target, edit } from "./v2-tool-fixture.js";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const spec = (overrides = {}) => ({
  requestId: "request-1",
  projectRevision: 0,
  scope: {
    mode: "edit",
    readableSlides: ["s1"],
    editableTargets: ["text", "chart", "table"].map((id) => target(id)),
    selection: [target("text")],
  },
  steps: [edit()],
  maxSteps: 8,
  maxFailures: 2,
  deadlineAt: Date.now() + 60000,
  ...overrides,
});
export async function scenario(t, store = sqlite, overrides = {}) {
  let env;
  if (store === sqlite) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "forge-run-"));
    const file = path.join(dir, "forge.db");
    setDbPathForTest(file);
    t.after(async () => {
      store.closeProjectStore();
      await rm(dir, { recursive: true, force: true });
    });
    env = {
      FORGE_DB_PATH: file,
      FORGE_CONFIG_DIR: dir,
      FORGE_PROJECTS_BACKEND: "sqlite",
    };
  } else
    env = {
      FORGE_PROJECTS_DATABASE_URL: process.env.FORGE_PROJECTS_DATABASE_URL,
      FORGE_PROJECTS_BACKEND: "postgres",
    };
  const { doc } = await store.createProject({
    owner: "owner",
    title: "Durable tools",
    scenes: seed(),
  });
  const runtime = createRuntime(store),
    binding = { owner: "owner", id: doc.id },
    plan = spec(overrides);
  const run = await runtime.start(binding, plan);
  return { runtime, binding, run, doc, plan, store, env };
}
