import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * A report run on a box with no template must fail before it spends anything.
 *
 * The whole run is a web research pass, a full model write and then a render.
 * The donor was only reached at the render, so the failure arrived after every
 * minute of that and after the account's Auto budget was gone — to report
 * something that was knowable before the first request went out.
 */
const scratch = await mkdtemp(path.join(tmpdir(), "forge-donorguard-"));
process.env.FORGE_REFERENCE_DIR = path.join(scratch, "reference");
process.env.FORGE_DECKS_DIR = path.join(scratch, "decks");
await mkdir(process.env.FORGE_REFERENCE_DIR, { recursive: true });
await mkdir(process.env.FORGE_DECKS_DIR, { recursive: true });

const { createReport } = await import("../src/ai/pipeline.js");

test.after(() => rm(scratch, { recursive: true, force: true }));

test("a report refuses before it spends anything when no template is installed", async () => {
  await assert.rejects(
    createReport({ brief: "anything at all" }),
    /no report template installed/,
  );
  // Nothing was created. The guard has to sit above uniqueSlug and mkdir, or
  // it is just a nicer message on the same wasted run.
  assert.deepEqual(await readdir(process.env.FORGE_DECKS_DIR), []);
});
