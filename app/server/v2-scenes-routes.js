// V2 live scenes: stateless DeckIntent → SlideScene compilation over
// HTTP. Thin transport only — every step below reuses the accepted
// pipeline the fixture drivers run (theme loading, design
// normalization, plate backgrounds, composition planning, chrome,
// compileDeckDetailed, scene validation). No AI, no persistence, no
// auth, no planning of its own: the browser posts meaning, the
// server returns scenes, and the viewer renders them through the
// same createViewer/sceneToSvg path as fixtures.
//
// Exposure: public like /api/themes (deterministic, CPU-cheap,
// tightly bounded). Documented in docs/V2-4F-EVAL.md §12; a hosted
// deployment should sit this behind the existing session gate.
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fail, ok } from "./http.js";
import { validateDeckIntent, normalizeIntent } from "../../packages/model/intent.ts";
import { validateScene } from "../../packages/model/scene.ts";
import { loadThemeDocument } from "../../src/theme-loader.js";
import { normalizeDesign } from "../../packages/core/design.ts";
import { planDeckComposition } from "../../packages/compiler/composition.ts";
import { compileDeckDetailed } from "../../packages/compiler/compile.js";
import { resolvePlateBackgrounds, slideBackgrounds } from "../../src/v2-plates.js";
import { benchmarkChrome } from "../../tools/v2-benchmark.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const THEMES_DIR = path.join(HERE, "..", "..", "themes");

// Request bounds: the intent schema caps structure (1..60 slides,
// 1..12 blocks each, string maxLengths) and the body cap below
// backstops total size, so a hostile body cannot turn a
// millisecond compile into a large one.
const MAX_BODY_CHARS = 512 * 1024;
const VARIANTS = new Set(["plain", "chromed"]);

let themeCache = null;
async function v2Themes() {
  if (!themeCache) {
    const files = await readdir(THEMES_DIR);
    themeCache = new Set(files.filter((f) => f.endsWith(".yaml")).map((f) => f.slice(0, -5)).sort());
  }
  return themeCache;
}

// Curated deterministic example intents served to the viewer for
// local evaluation (GET /api/v2/examples): real compiler input,
// no fixture JSON involved. Small on purpose — each exercises a
// distinct contract corner (comparison, truthful charts,
// multi-series pie fallback, status/uncertainty semantics).
export function liveExamples() {
  return [
    {
      id: "mechanism",
      title: "Solid-state cells (technical)",
      theme: "warm-humanist",
      variant: "plain",
      intent: {
        id: "live-mechanism", title: "Solid-state cells", audience: "Materials class", objective: "Explain the cell",
        slides: [
          { id: "s1", purpose: "Open", title: "Solid-state cells", blocks: [{ id: "s1b1", kind: "text", text: "Why the next cell has no liquid inside" }], layoutHint: { recipe: "title" } },
          { id: "s2", purpose: "Problem", title: "Liquids leak", blocks: [{ id: "s2b1", kind: "list", items: ["Flammable solvents", "Dendrites pierce separators", "Narrow thermal window"] }], layoutHint: { recipe: "content" } },
          { id: "s3", purpose: "Evidence", title: "Conductivity", blocks: [{ id: "s3c", kind: "chart", chartKind: "bar", categories: ["Oxide", "Sulfide"], series: [{ name: "mS/cm", values: [1.2, 12.5] }], caption: "Room temperature" }], layoutHint: { recipe: "chart" } },
        ],
      },
    },
    {
      id: "decision",
      title: "Cell choice (comparison)",
      theme: "swiss-international",
      variant: "plain",
      intent: {
        id: "live-decision", title: "Cell choice", audience: "Review panel", objective: "Recommend a chemistry",
        slides: [
          { id: "s1", purpose: "Frame", title: "Liquid vs solid", blocks: [{ id: "s1l", kind: "text", label: "Liquid", text: "Mature and cheap" }, { id: "s1r", kind: "text", label: "Solid", text: "Safe and dense" }, { id: "s1v", kind: "callout", text: "Solid wins on safety" }], layoutHint: { recipe: "comparison" } },
          { id: "s2", purpose: "Numbers", title: "Scores", blocks: [{ id: "s2t", kind: "table", header: true, rows: [["Chemistry", "Safety", "Cost"], ["Liquid", "Low", "Low"], ["Solid", "High", "High"]] }], layoutHint: { recipe: "content" } },
        ],
      },
    },
    {
      id: "data",
      title: "Cell data (charts + fallback)",
      theme: "warm-humanist",
      variant: "plain",
      intent: {
        id: "live-data", title: "Cell data", audience: "Lab meeting", objective: "Report measurements",
        slides: [
          { id: "s1", purpose: "Trend", title: "Capacity fade", blocks: [{ id: "s1c", kind: "chart", chartKind: "line", categories: ["0", "100", "200"], series: [{ name: "Ah", values: [3.0, 2.8, 2.5] }] }], layoutHint: { recipe: "chart" } },
          { id: "s2", purpose: "Shares", title: "Two mixes", blocks: [{ id: "s2c", kind: "chart", chartKind: "pie", categories: ["A", "B"], series: [{ name: "Mix 1", values: [60, 40] }, { name: "Mix 2", values: [30, 70] }] }], layoutHint: { recipe: "chart" } },
        ],
      },
    },
    {
      id: "status",
      title: "Cell program (status)",
      theme: "editorial-magazine",
      variant: "plain",
      intent: {
        id: "live-status", title: "Cell program", audience: "Sponsors", objective: "Report standing",
        slides: [
          { id: "s1", purpose: "Standing", title: "Where we stand", blocks: [{ id: "s1a", kind: "text", text: "Prototype cells cycle", status: "implemented", outcome: "favorable" }, { id: "s1b", kind: "text", text: "Pouch line scales", status: "planned", uncertainty: "qualified" }], layoutHint: { recipe: "content" } },
          { id: "s2", purpose: "Risk", title: "Open question", blocks: [{ id: "s2a", kind: "callout", text: "Sulfide moisture sensitivity unresolved", uncertainty: "contested", outcome: "mixed" }], layoutHint: { recipe: "content" } },
        ],
      },
    },
  ];
}

// The one compilation entry: validated intent + allowlisted theme
// in, real scenes plus honest diagnostics out. Mirrors the
// fixture drivers exactly (plates included), so live decks and
// fixture decks can never disagree about what the compiler does.
export async function compileLiveDeck({ intent, theme = "warm-humanist", variant = "plain" }) {
  const themes = await v2Themes();
  if (!themes.has(theme)) {
    const err = new Error(`unsupported theme "${theme}"`);
    err.code = "bad-theme";
    throw err;
  }
  if (!VARIANTS.has(variant)) {
    const err = new Error(`unsupported variant "${variant}"`);
    err.code = "bad-variant";
    throw err;
  }
  const verdict = await validateDeckIntent(intent);
  if (!verdict.ok) {
    const err = new Error("deck intent invalid");
    err.code = "bad-intent";
    err.details = verdict.errors;
    throw err;
  }
  const clean = normalizeIntent(intent);
  const design = normalizeDesign({ theme: await loadThemeDocument(theme), mode: "light" });
  const backgrounds = await resolvePlateBackgrounds({ themeName: theme, mode: "light", design });
  const { plan } = planDeckComposition(clean, design);
  const chrome = variant === "chromed" ? benchmarkChrome(clean, design, { backgrounds, plan }) : null;
  const { scenes, findings, fitDiagnostics } = compileDeckDetailed(clean, design, chrome, slideBackgrounds(backgrounds));
  // A scene that fails its own contract is a compiler failure,
  // never a response: 500 with a sanitized message, details logged.
  for (const scene of scenes) {
    const sv = await validateScene(scene);
    if (!sv.ok) {
      console.error(`live compile scene failed validation: ${sv.errors.join("; ")}`);
      const err = new Error("compiler produced an invalid scene");
      err.code = "compile-failed";
      throw err;
    }
  }
  return {
    deck: { name: clean.id, title: clean.title, theme, variant, slideCount: scenes.length },
    scenes,
    findings,
    fitDiagnostics,
  };
}

export function registerV2ScenesRoutes(app) {
  app.get("/api/v2/themes", async (_req, res) => {
    ok(res, { themes: [...(await v2Themes())] });
  });

  // Full intents ride the list response: examples are tiny by
  // design (a few KB), and one fetch keeps the panel simple.
  app.get("/api/v2/examples", async (_req, res) => {
    ok(res, { examples: liveExamples() });
  });

  app.post("/api/v2/scenes", async (req, res) => {
    if (req.body && JSON.stringify(req.body).length > MAX_BODY_CHARS) {
      return fail(res, 413, "request too large");
    }
    const { intent, theme, variant } = req.body ?? {};
    if (intent === undefined || intent === null || typeof intent !== "object") {
      return fail(res, 422, "deck intent invalid");
    }
    try {
      const out = await compileLiveDeck({ intent, theme: theme ?? "warm-humanist", variant: variant ?? "plain" });
      ok(res, out);
    } catch (err) {
      if (err.code === "bad-intent") return res.status(422).json({ ok: false, error: err.message, errors: err.details });
      if (err.code === "bad-theme" || err.code === "bad-variant") {
        return fail(res, 422, err.message);
      }
      console.error(`live compile failed: ${err.message}`);
      return fail(res, 500, "compilation failed");
    }
  });
}
