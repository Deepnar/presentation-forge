// V2-4F: live compilation API contract, loader state machine,
// and PPTX parity. API tests run against a minimal express app
// mounting only the v2-scenes routes (no auth, no lifecycle) —
// the route module is transport-thin by design, so this exercises
// the real contract. Loader tests inject fake compiles, no DOM.
// Fails on the V2-4E baseline `1a52170` (no such routes).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import JSZip from "jszip";
import { validateDeckIntent } from "../packages/model/intent.ts";
import { validateScene } from "../packages/model/scene.ts";
import { renderPptxToFile } from "../packages/renderer-pptx/node.ts";
import { registerV2ScenesRoutes, compileLiveDeck, liveExamples } from "../app/server/v2-scenes-routes.js";
import { createLiveDeckLoader } from "../app/web/src/lib/liveDeck.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let base = null;
let server = null;

before(async () => {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  registerV2ScenesRoutes(app);
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
});

after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
});

async function post(body) {
  const res = await fetch(`${base}/api/v2/scenes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

function walkEls(els, out = []) {
  for (const el of els ?? []) {
    out.push(el);
    walkEls(el.group?.children ?? [], out);
  }
  return out;
}

describe("v2-4f live compilation contract", () => {
  before(async () => {
    const addr = server.address();
    base = `http://127.0.0.1:${addr.port}`;
  });

  it("serves the V2 theme allowlist", async () => {
    const res = await fetch(`${base}/api/v2/themes`);
    const body = await res.json();
    assert.equal(body.ok, true);
    for (const t of ["warm-humanist", "swiss-international", "editorial-magazine", "sci-fi-hud", "gradient-mesh-dark"]) {
      assert.ok(body.themes.includes(t), `${t} listed`);
    }
  });

  it("serves deterministic example intents that all validate", async () => {
    const parche = await fetch(`${base}/api/v2/examples`).then((r) => r.json());
    assert.equal(parche.ok, true);
    assert.ok(parche.examples.length >= 4, "covers technical/decision/data/status");
    for (const ex of parche.examples) {
      assert.ok(ex.id && ex.title && ex.theme && ex.variant, `${ex.id} described`);
      assert.ok(ex.intent && Array.isArray(ex.intent.slides), `${ex.id} carries its intent`);
    }
    for (const full of liveExamples()) {
      const v = await validateDeckIntent(full.intent);
      assert.equal(v.ok, true, `${full.id} validates: ${v.errors.join(";")}`);
    }
  });

  it("valid request compiles real scenes with diagnostics", async () => {
    const ex = liveExamples().find((e) => e.id === "mechanism");
    const { status, json } = await post({ intent: ex.intent, theme: ex.theme, variant: ex.variant });
    assert.equal(status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.deck.theme, "warm-humanist");
    assert.equal(json.deck.slideCount, json.scenes.length);
    assert.ok(Array.isArray(json.findings) && Array.isArray(json.fitDiagnostics));
    for (const scene of json.scenes) {
      assert.equal((await validateScene(scene)).ok, true, `${scene.id} is contract-valid`);
    }
  });

  it("invalid intent returns 422 with useful errors, not a 500", async () => {
    const { status, json } = await post({ intent: { id: "bad", title: "x" }, theme: "warm-humanist" });
    assert.equal(status, 422);
    assert.equal(json.ok, false);
    assert.ok(json.errors.length > 0, "slide-scoped messages");
  });

  it("unsupported theme and variant are 422, never stack traces", async () => {
    const ex = liveExamples()[0];
    for (const body of [{ intent: ex.intent, theme: "../secret" }, { intent: ex.intent, theme: "nope" }, { intent: ex.intent, variant: "hologram" }]) {
      const { status, json } = await post(body);
      assert.equal(status, 422, JSON.stringify(body));
      assert.ok(!JSON.stringify(json).includes("at "), "no stack trace leaks");
    }
  });

  it("oversized decks are refused with an explicit bound", async () => {
    const ex = liveExamples().find((e) => e.id === "mechanism");
    const slides = Array.from({ length: 61 }, (_, i) => ({
      id: `s${i}`, purpose: "fill", title: `Slide ${i}`,
      blocks: [{ id: `s${i}b`, kind: "text", text: "filler" }],
    }));
    const r1 = await post({ intent: { ...ex.intent, slides }, theme: "warm-humanist" });
    assert.equal(r1.status, 422, "61 slides refused by the schema cap");
    const big = { ...ex.intent };
    big.slides = Array.from({ length: 60 }, (_, i) => ({
      id: `s${i}`, purpose: "fill", title: `Slide ${i}`,
      blocks: Array.from({ length: 12 }, (_, j) => ({ id: `s${i}b${j}`, kind: "text", text: "x".repeat(2000) })),
    }));
    const res = await fetch(`${base}/api/v2/scenes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: big, theme: "warm-humanist" }),
    });
    assert.equal(res.status, 413, "megabyte body refused before compiling");
  });

  it("identical inputs compile deterministically", async () => {
    const ex = liveExamples().find((e) => e.id === "decision");
    const body = { intent: ex.intent, theme: ex.theme, variant: ex.variant };
    const a = await post(body);
    const b = await post(body);
    assert.deepEqual(a.json.scenes, b.json.scenes, "byte-identical scenes");
  });

  it("chart values survive exactly and pies fall back honestly", async () => {
    const mech = liveExamples().find((e) => e.id === "mechanism");
    const { json: m } = await post({ intent: mech.intent, theme: mech.theme });
    const bar = m.scenes.flatMap((s) => walkEls(s.elements)).find((e) => e.kind === "chart");
    assert.deepEqual(bar.chart.series[0].values, [1.2, 12.5]);
    const ex = liveExamples().find((e) => e.id === "data");
    const { json } = await post({ intent: ex.intent, theme: ex.theme });
    const els = json.scenes.flatMap((s) => walkEls(s.elements));
    const line = els.find((e) => e.kind === "chart");
    assert.deepEqual(line.chart.series[0].values, [3.0, 2.8, 2.5]);
    const fallback = els.find((e) => e.kind === "table" && JSON.stringify(e).includes("Mix 1"));
    assert.ok(fallback, "multi-series pie preserved as an editable table");
    assert.ok(json.fitDiagnostics.some((d) => d.kind === "chart-fallback-table"), "fallback diagnosed, not silent");
  });

  it("status and uncertainty semantics compile with diagnostics intact", async () => {
    const ex = liveExamples().find((e) => e.id === "status");
    const { status, json } = await post({ intent: ex.intent, theme: ex.theme });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.findings), "quality findings propagate as data");
    const texts = JSON.stringify(json.scenes);
    assert.ok(texts.includes("Prototype cells cycle") && texts.includes("Pouch line scales"));
  });

  it("chromed variant emits locked chrome like fixtures", async () => {
    const ex = liveExamples().find((e) => e.id === "mechanism");
    const { json } = await post({ intent: ex.intent, theme: ex.theme, variant: "chromed" });
    const locked = json.scenes.flatMap((s) => walkEls(s.elements)).filter((e) => e.locked);
    assert.ok(locked.length > 0, "chromed scenes carry locked chrome");
    assert.ok(locked.every((e) => e.provenance === "compiler" && !e.semanticRef), "chrome carries no authored refs");
  });

  it("live scenes render to native PPTX with authored content intact", async (t) => {
    const ex = liveExamples().find((e) => e.id === "mechanism");
    const out = await compileLiveDeck({ intent: ex.intent, theme: ex.theme, variant: "plain" });
    const dir = mkdtempSync(path.join(tmpdir(), "v24f-"));
    const pptx = path.join(dir, "live.pptx");
    await renderPptxToFile(out.scenes, pptx);
    const { readFileSync } = await import("node:fs");
    const zip = await JSZip.loadAsync(readFileSync(pptx));
    const slides = Object.keys(zip.files).filter((n) => n.startsWith("ppt/slides/slide"));
    assert.equal(slides.length, out.scenes.length, "one native slide per scene");
    let xml = "";
    for (const n of slides) xml += await zip.files[n].async("string");
    assert.ok(xml.includes("Conductivity"), "authored title in slide XML");
    const charts = Object.keys(zip.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
    assert.ok(charts.length >= 1, "native chart parts");
    assert.match(await zip.files[charts[0]].async("string"), /12\.5/, "chart value in chart XML");
  }, { timeout: 120000 });
});

describe("v2-4f live loader state machine", () => {
  const deck = { deck: { name: "d", theme: "t", variant: "plain" }, scenes: [{ id: "s" }] };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("loads, resolves, and notifies", async () => {
    const seen = [];
    const loader = createLiveDeckLoader({ compile: async () => deck });
    loader.subscribe((s) => seen.push(s.status));
    assert.equal(loader.snapshot().status, "idle");
    await loader.load({ intent: {}, theme: "t" });
    assert.equal(loader.snapshot().status, "ready");
    assert.equal(loader.snapshot().deck, deck);
    assert.deepEqual(seen, ["loading", "ready"]);
  });

  it("rapid replacement keeps only the newest response", async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    let calls = 0;
    const loader = createLiveDeckLoader({
      compile: async (input) => {
        calls += 1;
        if (input.theme === "slow") await gate;
        return { ...deck, theme: input.theme };
      },
    });
    const slow = loader.load({ intent: {}, theme: "slow" });
    await tick();
    const fast = await loader.load({ intent: {}, theme: "fast" });
    assert.equal(fast.status, "ready");
    assert.equal(fast.deck.theme, "fast");
    release();
    await slow;
    assert.equal(loader.snapshot().deck.theme, "fast", "stale slow response discarded");
    assert.equal(calls, 2);
  });

  it("errors surface with messages and keep prior state", async () => {
    const loader = createLiveDeckLoader({ compile: async () => { throw new Error("deck intent invalid: slide 1: missing title"); } });
    const r = await loader.load({ intent: {} });
    assert.equal(r.status, "error");
    assert.match(r.error, /deck intent invalid/);
  });

  it("empty responses are errors, not blank decks", async () => {
    const loader = createLiveDeckLoader({ compile: async () => ({ deck: {}, scenes: null }) });
    assert.equal((await loader.load({})).status, "error");
  });

  it("abort during flight settles to idle without landing", async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const loader = createLiveDeckLoader({ compile: async () => { await gate; return deck; } });
    const pending = loader.load({});
    await tick();
    loader.abort();
    assert.equal(loader.snapshot().status, "idle");
    release();
    await pending;
    assert.equal(loader.snapshot().status, "idle");
    assert.equal(loader.snapshot().deck, null);
  });
});
