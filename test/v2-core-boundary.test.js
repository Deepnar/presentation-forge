// Dependency-boundary enforcement for deterministic packages. Uses the
// TypeScript parser (no regex, no new dependency): every static import,
// re-export source, and literal dynamic import inside packages/ is
// resolved and checked against the package direction matrix. Anything
// else suspicious (require(), non-literal dynamic import, unresolvable
// specifier) fails closed.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const PACKAGES = ["model", "core", "compiler", "renderer-pptx", "renderer-docx", "editor"];

// Relative-import scope per package: where a file may point.
const RELATIVE_SCOPE = {
  model: ["packages/model"],
  core: ["packages/model", "packages/core"],
  compiler: ["packages/model", "packages/core", "packages/compiler"],
  "renderer-pptx": ["packages/model", "packages/core", "packages/renderer-pptx"],
  "renderer-docx": ["packages/model", "packages/renderer-docx"],
  editor: ["packages/model", "packages/core", "packages/editor"],
};

// Bare specifiers allowed per package. Everything else fails.
const BARE_ALLOW = {
  model: ["ajv"],
  core: [],
  compiler: [],
  "renderer-pptx": ["pptxgenjs"],
  "renderer-docx": ["jszip"],
  editor: [],
};

// node: builtins allowed per package. Core stays dependency-free; the
// renderer-pptx Node adapter is the single narrow exception.
const NODE_ALLOW = {
  model: ["node:fs/promises", "node:crypto"],
  core: [],
  compiler: [],
  "renderer-pptx": [],
  "renderer-docx": [],
  editor: [],
};

// Per-file exceptions inside otherwise-restricted packages. Each entry
// names the exact file and why it exists.
const FILE_ALLOW = [
  {
    file: "packages/renderer-pptx/node.ts",
    bare: ["node:fs/promises", "node:path"],
    why: "explicit Node-only persistence adapter; canonical render.ts stays fs-free",
  },
];

// Banned everywhere under packages/, regardless of matrix.
const GLOBAL_BAN = [
  "sharp", "docx", "yaml", "typescript",
  "openai", "anthropic", "openrouter", "ollama",
  "@google/generative-ai", "@google/genai",
  "@neondatabase/serverless", "@vercel/blob", "next", "express", "tldraw", "@tldraw/tldraw",
];

const ALLOWLIST = [];


function parseImports(text, filename) {
  const found = [];
  const violations = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      if (spec && ts.isStringLiteralLike(spec)) found.push(spec.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) found.push(arg.text);
      else violations.push(`non-literal dynamic import in ${filename}`);
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require") {
      violations.push(`require() call in ${filename}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true));
  return { found, violations };
}

import { existsSync } from "node:fs";

function resolveRelative(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const cand of [base, `${base}.ts`, `${base}.js`, `${base}.mjs`, path.join(base, "index.ts"), path.join(base, "index.js")]) {
    if (existsSync(cand)) return cand;
  }
  return null;
}

function edgeAllowed(fromPkg, fromFile, target, spec) {
  if (target === null) return `unresolvable specifier "${spec}"`;
  const rel = path.relative(ROOT, target);
  // Narrow temporary allowlist first.
  for (const a of ALLOWLIST) {
    if (fromFile === path.join(ROOT, a.from) && rel === a.to) return null;
  }
  if (!rel.startsWith("packages/")) return `escapes packages/: "${spec}"`;
  const ok = (RELATIVE_SCOPE[fromPkg] ?? []).some((d) => rel === d || rel.startsWith(`${d}/`));
  if (!ok) return `forbidden direction: ${fromPkg} -> ${rel}`;
  return null;
}

function bareAllowed(fromPkg, spec, file) {
  if (spec.startsWith("node:")) {
    for (const a of FILE_ALLOW) {
      if (file === path.join(ROOT, a.file) && a.bare.includes(spec)) return null;
    }
    return (NODE_ALLOW[fromPkg] ?? []).includes(spec)
      ? null
      : `node builtin "${spec}" not allowed in ${fromPkg} (only named adapter files)`;
  }
  for (const banned of GLOBAL_BAN) {
    if (spec === banned || spec.startsWith(`${banned}/`)) return `banned dependency "${spec}" in ${fromPkg}`;
  }
  if (!(BARE_ALLOW[fromPkg] ?? []).includes(spec)) return `bare specifier "${spec}" not allowed in ${fromPkg}`;
  return null;
}

async function scanFile(file) {
  const fromPkg = path.relative(path.join(ROOT, "packages"), file).split(path.sep)[0];
  const text = await readFile(file, "utf8");
  const { found, violations } = parseImports(text, file);
  const problems = [...violations];
  for (const spec of found) {
    if (spec.startsWith(".")) {
      const problem = edgeAllowed(fromPkg, file, resolveRelative(file, spec), spec);
      if (problem) problems.push(`${path.relative(ROOT, file)}: ${problem}`);
    } else {
      const problem = bareAllowed(fromPkg, spec, file);
      if (problem) problems.push(`${path.relative(ROOT, file)}: ${problem}`);
    }
  }
  return problems;
}

async function allPackageFiles() {
  const out = [];
  const walk = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (/\.(ts|js|mjs)$/.test(e.name)) out.push(p);
    }
  };
  for (const p of PACKAGES) await walk(path.join(ROOT, "packages", p));
  return out;
}

describe("v2 core boundary", () => {
  it("detects static, re-export, and literal dynamic imports", () => {
    const { found, violations } = parseImports(
      `import a from "./x.ts";\nexport { b } from "../model/y.ts";\nconst c = await import("ajv");`,
      "probe.ts",
    );
    assert.deepEqual(found, ["./x.ts", "../model/y.ts", "ajv"]);
    assert.deepEqual(violations, []);
  });

  it("fails closed on require() and non-literal dynamic import", () => {
    const r1 = parseImports(`const x = require("fs");`, "probe.js");
    assert.match(r1.violations.join(" "), /require/);
    const r2 = parseImports(`const m = await import(name);`, "probe.js");
    assert.match(r2.violations.join(" "), /non-literal/);
  });

  it("enforces package directions on synthetic edges", () => {
    const coreChrome = path.join(ROOT, "src/chrome.js");
    const fakeCore = path.join(ROOT, "packages/core/probe.ts");
    assert.match(edgeAllowed("core", fakeCore, coreChrome, "../src/chrome.js") ?? "", /escapes packages/);
    assert.equal(edgeAllowed("compiler", fakeCore, path.join(ROOT, "packages/core/fit.ts"), "../core/fit.ts"), null);
    assert.match(bareAllowed("core", "sharp") ?? "", /banned/);
    assert.equal(bareAllowed("renderer-pptx", "pptxgenjs", path.join(ROOT, "packages/renderer-pptx/render.ts")), null);
    assert.match(bareAllowed("renderer-pptx", "jszip", path.join(ROOT, "packages/renderer-pptx/render.ts")) ?? "", /not allowed/);
  });

  it("confines node builtins to the named renderer adapter", () => {
    const render = path.join(ROOT, "packages/renderer-pptx/render.ts");
    const adapter = path.join(ROOT, "packages/renderer-pptx/node.ts");
    assert.match(bareAllowed("renderer-pptx", "node:fs", render) ?? "", /only named adapter/);
    assert.match(bareAllowed("renderer-pptx", "node:fs/promises", render) ?? "", /only named adapter/);
    assert.equal(bareAllowed("renderer-pptx", "node:fs/promises", adapter), null);
    assert.equal(bareAllowed("renderer-pptx", "node:path", adapter), null);
    assert.match(bareAllowed("renderer-pptx", "node:os", adapter) ?? "", /only named adapter/);
  });

  it("allows jszip only in renderer-docx", () => {
    const docx = path.join(ROOT, "packages/renderer-docx/render.ts");
    const pptx = path.join(ROOT, "packages/renderer-pptx/render.ts");
    const core = path.join(ROOT, "packages/core/fit.ts");
    const model = path.join(ROOT, "packages/model/validate.ts");
    assert.equal(bareAllowed("renderer-docx", "jszip", docx), null);
    assert.match(bareAllowed("renderer-pptx", "jszip", pptx) ?? "", /not allowed/);
    assert.match(bareAllowed("core", "jszip", core) ?? "", /not allowed/);
    assert.match(bareAllowed("model", "jszip", model) ?? "", /not allowed/);
    assert.match(bareAllowed("renderer-docx", "node:fs", docx) ?? "", /not allowed/);
    assert.match(bareAllowed("renderer-docx", "node:path", docx) ?? "", /not allowed/);
    assert.match(bareAllowed("renderer-docx", "node:os", docx) ?? "", /not allowed/);
    assert.match(bareAllowed("renderer-docx", "child_process", docx) ?? "", /not allowed/);
  });

  it("repository packages contain zero boundary violations", async () => {
    const problems = [];
    for (const f of await allPackageFiles()) problems.push(...(await scanFile(f)));
    assert.deepEqual(problems, []);
  });
});
