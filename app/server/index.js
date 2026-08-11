import express from "express";
import cors from "cors";
import { readFile, writeFile, readdir, mkdir, stat, access } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { ROOT, DECKS, THEMES, CONFIG } from "../../src/paths.js";
import { loadTheme, listThemes, loadStyle, listStyles } from "../../src/theme.js";
import { validateDeck } from "../../src/validate.js";
import { render } from "../../src/render.js";
import { preview } from "../../src/preview.js";
import { renderReport, validateReport } from "../../src/report.js";
import { deckSchema } from "../../src/ai/catalog.js";
import { createDeck, generateFromPlan } from "../../src/ai/pipeline.js";
import { runChatTurn, loadThread, resetThread } from "../../src/ai/chat.js";
import { modelChoices } from "../../src/ai/ollama.js";

/**
 * Thin HTTP wrapper over the existing pipeline modules. Deliberately holds no
 * logic of its own — everything here also has to work from the CLI, so the
 * server must stay a transport, not a second implementation.
 */

const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" }));

// Deliberately NOT `PORT` — dev harnesses inject that for the frontend, and the
// API silently stealing Vite's port produces a very confusing "Cannot GET /".
const PORT = process.env.FORGE_API_PORT || 5174;
const ok = (res, data) => res.json({ ok: true, ...data });
const fail = (res, code, message) => res.status(code).json({ ok: false, error: message });

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => fail(res, 500, err.message));

/**
 * Server-sent events over a POST body. The chat panel inherits this transport,
 * so it is chosen once here rather than as a per-endpoint hack.
 *
 * `send` is a no-op once the socket is gone, which lets a cancelled request
 * unwind without throwing; `done` rejects on disconnect so the pipeline can be
 * aborted instead of burning a model for a client that left.
 */
function startSSE(res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event, data) => {
    if (res.writableEnded || res.destroyed) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  const done = new Promise((resolve, reject) => {
    res.on("close", () => reject(new Error("client disconnected")));
    res.on("error", reject);
  });
  const close = () => { if (!res.destroyed) res.end(); };
  return { send, done, close };
}

/* ------------------------------------------------------------------ themes */

app.get("/api/themes", wrap(async (_req, res) => {
  const names = await listThemes();
  const themes = await Promise.all(names.map(async (name) => {
    const t = await loadTheme(name);
    const raw = YAML.parse(await readFile(path.join(THEMES, `${name}.yaml`), "utf8"));
    return {
      name: t.name,
      label: t.label,
      summary: raw.summary ?? "",
      palette: t.palette,
      surfaces: t.surfaces,
      fonts: {
        heading: t.type.heading?.family,
        body: t.type.body?.family,
      },
      voice: t.voice,
      // Gallery thumbnails, if `npm run gallery` has been run.
      thumb: `/api/themes/${name}/thumb.png`,
    };
  }));
  ok(res, { themes });
}));

app.get("/api/themes/:name/thumb.png", wrap(async (req, res) => {
  const file = path.join(ROOT, "app", "gallery", `${req.params.name}.png`);
  try {
    await stat(file);
    res.sendFile(file);
  } catch {
    res.status(404).end();
  }
}));

app.get("/api/styles", wrap(async (_req, res) => {
  const styles = await Promise.all((await listStyles()).map(async (name) => {
    const s = await loadStyle(name);
    return { name: s.name, label: s.label };
  }));
  ok(res, { styles });
}));

/* ------------------------------------------------------------------- decks */

async function deckMeta(slug) {
  const dir = path.join(DECKS, slug);
  const deckFile = path.join(dir, "deck.yaml");
  const deck = YAML.parse(await readFile(deckFile, "utf8"));
  let meta = {};
  try {
    meta = YAML.parse(await readFile(path.join(dir, "meta.yaml"), "utf8")) ?? {};
  } catch { /* optional */ }
  const s = await stat(deckFile);
  return {
    slug,
    title: deck.title,
    theme: deck.theme,
    slides: deck.slides?.length ?? 0,
    updated: s.mtime,
    meta,
  };
}

app.get("/api/decks", wrap(async (_req, res) => {
  let entries = [];
  try {
    entries = await readdir(DECKS, { withFileTypes: true });
  } catch {
    return ok(res, { decks: [] });
  }
  const decks = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      decks.push(await deckMeta(e.name));
    } catch { /* folder without a valid deck.yaml — skip */ }
  }
  decks.sort((a, b) => b.updated - a.updated);
  ok(res, { decks });
}));

app.get("/api/decks/:slug", wrap(async (req, res) => {
  const dir = path.join(DECKS, req.params.slug);
  const deck = YAML.parse(await readFile(path.join(dir, "deck.yaml"), "utf8"));
  let meta = {};
  try {
    meta = YAML.parse(await readFile(path.join(dir, "meta.yaml"), "utf8")) ?? {};
  } catch { /* optional */ }

  // Report any existing rendered slides so the UI can show them immediately.
  const base = `/api/decks/${req.params.slug}/preview`;
  let slides = [];
  let thumbs = [];
  try {
    const names = (await readdir(path.join(dir, "out", "preview")))
      .filter((f) => /^slide-\d+\.png$/.test(f))
      .sort();
    slides = names.map((f) => `${base}/${f}`);
    thumbs = names.map((f) => `${base}/thumbs/${f}`);
  } catch { /* not rendered yet */ }

  ok(res, { deck, meta, slides, thumbs });
}));

app.put("/api/decks/:slug", wrap(async (req, res) => {
  const { deck, meta } = req.body ?? {};
  if (!deck) return fail(res, 400, "body must include `deck`");

  const { ok: valid, errors } = await validateDeck(deck);
  if (!valid) return res.status(422).json({ ok: false, error: "validation failed", errors });

  const dir = path.join(DECKS, req.params.slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "deck.yaml"), YAML.stringify(deck), "utf8");
  if (meta) await writeFile(path.join(dir, "meta.yaml"), YAML.stringify(meta), "utf8");
  ok(res, {});
}));

/** Validate without saving — lets the editor show errors as you type. */
app.post("/api/validate", wrap(async (req, res) => {
  const { ok: valid, errors } = await validateDeck(req.body?.deck ?? {});
  ok(res, { valid, errors });
}));

app.post("/api/decks/:slug/render", wrap(async (req, res) => {
  const dir = path.join(DECKS, req.params.slug);
  const deckFile = path.join(dir, "deck.yaml");
  const themeName = req.body?.theme;
  const style = req.body?.style;
  const mode = req.body?.mode ?? "light";

  const r = await render({ deckFile, themeName, style, mode });
  const p = await preview(r.outFile, { dpi: req.body?.dpi ?? 110 });
  const base = `/api/decks/${req.params.slug}/preview`;

  ok(res, {
    slides: p.pages.map((f) => `${base}/${path.basename(f)}`),
    thumbs: p.thumbs.map((f) => `${base}/thumbs/${path.basename(f)}`),
    problems: r.problems,
    pptx: `/api/decks/${req.params.slug}/download/deck.pptx`,
  });
}));

app.get("/api/decks/:slug/preview/thumbs/:file", wrap(async (req, res) => {
  const file = path.join(DECKS, req.params.slug, "out", "preview", "thumbs", path.basename(req.params.file));
  try {
    await stat(file);
    res.sendFile(file);
  } catch {
    res.status(404).end();
  }
}));

app.get("/api/decks/:slug/preview/:file", wrap(async (req, res) => {
  const file = path.join(DECKS, req.params.slug, "out", "preview", path.basename(req.params.file));
  try {
    await stat(file);
    res.sendFile(file);
  } catch {
    res.status(404).end();
  }
}));

app.get("/api/decks/:slug/download/:file", wrap(async (req, res) => {
  const file = path.join(DECKS, req.params.slug, "out", path.basename(req.params.file));
  try {
    await stat(file);
    res.download(file);
  } catch {
    res.status(404).end();
  }
}));

/* ---------------------------------------------------------------- reports */

app.get("/api/decks/:slug/report", wrap(async (req, res) => {
  const file = path.join(DECKS, req.params.slug, "report.yaml");
  const report = YAML.parse(await readFile(file, "utf8"));
  ok(res, { report });
}));

/** Validate and save report content — same shape as the deck PUT. */
app.put("/api/decks/:slug/report", wrap(async (req, res) => {
  const { report } = req.body ?? {};
  if (!report) return fail(res, 400, "body must include `report`");

  const { ok: valid, errors } = await validateReport(report);
  if (!valid) return res.status(422).json({ ok: false, error: "validation failed", errors });

  const dir = path.join(DECKS, req.params.slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "report.yaml"), YAML.stringify(report), "utf8");
  ok(res, {});
}));

/** Draw report.yaml on the institutional donor → decks/<slug>/out/report.docx. */
app.post("/api/decks/:slug/report/render", wrap(async (req, res) => {
  const reportFile = path.join(DECKS, req.params.slug, "report.yaml");
  let saved = true;
  try { await access(reportFile); } catch { saved = false; }
  if (!saved) {
    return fail(res, 404, "no report.yaml saved for this deck — save report content first");
  }
  const toc = req.body?.toc !== false;
  const r = await renderReport({ reportFile, toc });
  ok(res, {
    sections: r.sections,
    pages: r.pages,
    problems: r.problems,
    docx: `/api/decks/${req.params.slug}/download/report.docx`,
  });
}));

/* ------------------------------------------------------------- generation */

app.get("/api/types", wrap(async (_req, res) => {
  const schema = await deckSchema();
  ok(res, { types: schema.definitions.slide.properties.type.enum });
}));

/** Brief → outline. Long-running; streams research/planning progress as SSE. */
app.post("/api/decks", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { brief, sources, research, theme, maxSlides, model, identity } = req.body ?? {};
  (async () => {
    const r = await createDeck({
      brief, sources, research, theme, maxSlides, model, identity,
      signal: ctrl.signal,
      onProgress: (p) => sse.send("status", p),
    });
    sse.send("plan", { slug: r.slug, plan: r.plan, stats: r.stats });
    sse.close();
  })().catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});

/* --------------------------------------------------------------- chat panel */

app.get("/api/models", wrap(async (_req, res) => {
  const { models, default: def } = await modelChoices();
  ok(res, { models, default: def });
}));

/** The deck's thread: rolling summary, recent turns, durable decisions. */
app.get("/api/decks/:slug/chat", wrap(async (req, res) => {
  const thread = await loadThread(path.join(DECKS, req.params.slug));
  ok(res, thread);
}));

/** Forget the transcript but keep standing decisions. */
app.delete("/api/decks/:slug/chat", wrap(async (req, res) => {
  await resetThread(path.join(DECKS, req.params.slug));
  ok(res, {});
}));

/**
 * One chat turn. Same SSE transport as generation — the pipeline aborts when
 * the socket closes, so a vanished client stops burning model time.
 */
app.post("/api/decks/:slug/chat", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { instruction, model } = req.body ?? {};
  if (!instruction?.trim()) {
    sse.send("error", { error: "body must include an `instruction`" });
    return sse.close();
  }

  (async () => {
    const r = await runChatTurn({
      slug: req.params.slug,
      instruction,
      model,
      signal: ctrl.signal,
      onToken: (text) => sse.send("token", { text }),
      onProgress: (p) => sse.send("status", p),
    });
    if (!r.ok) {
      sse.send("error", { error: r.errors?.join("; ") });
      return sse.close();
    }
    const base = `/api/decks/${req.params.slug}/preview`;
    sse.send("result", {
      changes: r.changes,
      diff: r.diff,
      stats: r.stats,
      decisions: r.decisions,
      summary: r.summary,
      slides: (r.slides ?? []).map((f) => `${base}/${f}`),
      thumbs: (r.thumbs ?? []).map((f) => `${base}/thumbs/${f}`),
      problems: r.problems,
    });
    sse.close();
  })().catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});

/** Approved outline → deck, rendered and rasterised. Same SSE transport. */
app.post("/api/decks/:slug/generate", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { plan, theme, model } = req.body ?? {};
  if (!plan || !Array.isArray(plan.slides) || !plan.slides.length) {
    sse.send("error", { error: "body must include an approved `plan` with slides" });
    return sse.close();
  }

  (async () => {
    const r = await generateFromPlan({
      slug: req.params.slug, plan, theme, model,
      signal: ctrl.signal,
      onProgress: (p) => sse.send("status", p),
    });
    const base = `/api/decks/${req.params.slug}/preview`;
    sse.send("result", {
      slug: r.slug,
      slides: r.slides.map((f) => `${base}/${f}`),
      thumbs: r.thumbs.map((f) => `${base}/thumbs/${f}`),
      problems: r.problems,
      skipped: r.skipped,
      stats: r.stats,
    });
    sse.close();
  })().catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});

/* ---------------------------------------------------------------- identity */

app.get("/api/identity", wrap(async (_req, res) => {
  // Falls back to the committed template: identity.yaml is gitignored because
  // it holds real personal and institutional details.
  let raw;
  try {
    raw = await readFile(path.join(CONFIG, "identity.yaml"), "utf8");
  } catch {
    raw = await readFile(path.join(CONFIG, "identity.example.yaml"), "utf8");
  }
  ok(res, { identity: YAML.parse(raw) });
}));

app.put("/api/identity", wrap(async (req, res) => {
  const { identity } = req.body ?? {};
  if (!identity || typeof identity !== "object") return fail(res, 400, "body must include `identity`");
  await writeFile(path.join(CONFIG, "identity.yaml"), YAML.stringify(identity), "utf8");
  ok(res, {});
}));

/* -------------------------------------------------------------------- boot */

app.get("/api/health", (_req, res) => ok(res, { root: ROOT }));

app.listen(PORT, () => {
  console.log(`  api   http://localhost:${PORT}`);
});
