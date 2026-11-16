// The container must carry every source directory the server and the UI
// build reach. V2 lives in packages/, which neither Dockerfile stage copied:
// the UI build could not resolve the editor and the server's first V2 import
// would fail — on a box where nobody runs the source tree to notice. This
// walks the import graph from both entry points (static and dynamic string
// imports) and checks each top-level directory is copied into its stage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']+)["']/g;

async function reach(entries) {
  const seen = new Set();
  const queue = entries.map((e) => path.join(ROOT, e));
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    let text;
    try { text = await readFile(file, "utf8"); } catch { continue; }
    seen.add(file);
    if (!/\.(m?js|jsx|ts)$/.test(file)) continue;
    for (const m of text.matchAll(IMPORT)) queue.push(path.resolve(path.dirname(file), m[1]));
  }
  return seen;
}

const topDir = (file) => path.relative(ROOT, file).split(path.sep)[0];

// Directories (or files) each stage copies, from its COPY lines.
function stageCopies(dockerfile) {
  const stages = dockerfile.split(/^FROM /m).slice(1);
  return stages.map((stage) => new Set(stage.split("\n")
    .filter((l) => /^COPY\s/.test(l) && !/--from=/.test(l))
    .flatMap((l) => l.replace(/^COPY\s+(--\S+\s+)*/, "").trim().split(/\s+/).slice(0, -1))
    .map((src) => src.replace(/^\.\//, "").split("/")[0])));
}

test("every directory the server and the UI build import is in the image", async () => {
  const dockerfile = await readFile(path.join(ROOT, "docker/Dockerfile"), "utf8");
  const [build, runtime] = stageCopies(dockerfile);
  const server = new Set([...(await reach(["app/server/index.js"]))].map(topDir));
  const ui = new Set([...(await reach(["app/web/src/main.jsx"]))].map(topDir));
  assert.ok(server.has("packages") && ui.has("packages"), "the walk reaches V2");
  for (const dir of server) {
    if (dir === "app") continue;
    assert.ok(runtime.has(dir), `the runtime stage copies ${dir}/ (the server imports it)`);
  }
  for (const dir of ui) {
    if (dir === "app") continue;
    assert.ok(build.has(dir), `the build stage copies ${dir}/ (the UI build imports it)`);
  }
});
