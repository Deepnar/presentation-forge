// Regenerate schema-backed TypeScript types for packages/model.
// JSON Schema is the source of truth; AJV validates at runtime; these
// files provide compile-time types only. Do not hand-edit the outputs.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const ROOT = new URL("..", import.meta.url);

function banner(schemaPath) {
  return `/* DO NOT EDIT — generated from ${schemaPath} by tools/v2-types.mjs.
 * JSON Schema is the source of truth; AJV owns runtime validation. */`;
}

export async function generateTypes({ write = true } = {}) {
  const targets = [
    { schema: "packages/model/intent.schema.json", out: "packages/model/intent.generated.ts", name: "DeckIntent" },
    { schema: "packages/model/scene.schema.json", out: "packages/model/scene.generated.ts", name: "SlideScene" },
  ];
  const results = [];
  for (const t of targets) {
    const schema = JSON.parse(await readFile(new URL(t.schema, ROOT), "utf8"));
    const ts = await compile(schema, t.name, { bannerComment: banner(t.schema) });
    results.push({ ...t, ts: ts.endsWith("\n") ? ts : ts + "\n" });
    if (write) await writeFile(path.join(new URL(ROOT).pathname, t.out), results.at(-1).ts);
  }
  return results;
}

const run = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (run) {
  await generateTypes();
  console.log("v2 types generated");
}
