import express from "express";
import cors from "cors";
import { readFile, writeFile, readdir, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { ROOT, DECKS, THEMES, CONFIG } from "../../src/paths.js";
import { loadTheme, listThemes } from "../../src/theme.js";
import { validateDeck } from "../../src/validate.js";
import { render } from "../../src/render.js";
import { preview } from "../../src/preview.js";

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
  const mode = req.body?.mode ?? "light";

  const r = await render({ deckFile, themeName, mode });
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
