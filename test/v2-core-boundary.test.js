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
const PACKAGES = ["model", "core", "compiler", "renderer-pptx", "editor"];

// Relative-import scope per package: where a file may point.
const RELATIVE_SCOPE = {
  model: ["packages/model"],
  core: ["packages/model", "packages/core"],
  compiler: ["packages/model", "packages/core", "packages/compiler"],
  "renderer-pptx": ["packages/model", "packages/core", "packages/renderer-pptx"],
  editor: ["packages/model", "packages/core", "packages/editor"],
};

// Bare specifiers allowed per package. Everything else fails.
const BARE_ALLOW = {
  model: ["ajv"],
  core: [],
  compiler: [],
  "renderer-pptx": ["pptxgenjs"],
  editor: [],
};

// node: builtins allowed per package. Core stays dependency-free.
const NODE_ALLOW = { model: true, core: false, compiler: false, "renderer-pptx": false, editor: false };

// Banned everywhere under packages/, regardless of matrix.
const GLOBAL_BAN = [
  "sharp", "jszip", "docx", "yaml", "typescript",
  "openai", "anthropic", "openrouter", "ollama",
  "@google/generative-ai", "@google/genai",
  "@neondatabase/serverless", "@vercel/blob", "next", "express", "tldraw", "@tldraw/tldraw",
];

// Narrow temporary allowlist. Each entry names the exact file and why it
// exists; entries die when their seam is eliminated.
const ALLOWLIST = [
  {
    from: "packages/model/design.js",
    to: "src/theme.js",
    why: "transitional V2-0 theme seam; eliminated by V2-2B normalization",
  },
];

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

function bareAllowed(fromPkg, spec) {
  if (spec.startsWith("node:")) {
    return NODE_ALLOW[fromPkg] ? null : `node builtin "${spec}" not allowed in ${fromPkg}`;
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
      const problem = bareAllowed(fromPkg, spec);
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
    assert.equal(bareAllowed("renderer-pptx", "pptxgenjs"), null);
    assert.match(bareAllowed("renderer-pptx", "jszip") ?? "", /banned/);
  });

  it("repository packages contain zero boundary violations", async () => {
    const problems = [];
    for (const f of await allPackageFiles()) problems.push(...(await scanFile(f)));
    assert.deepEqual(problems, []);
  });
});
