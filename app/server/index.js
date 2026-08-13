import express from "express";
import cors from "cors";
import { readFile, writeFile, readdir, mkdir, stat, access, rm } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { ROOT, DECKS, THEMES, CONFIG, BRAND } from "../../src/paths.js";
import { loadTheme, listThemes, loadStyle, listStyles } from "../../src/theme.js";
import { validateDeck } from "../../src/validate.js";
import { render } from "../../src/render.js";
import { preview } from "../../src/preview.js";
import { renderReport, validateReport } from "../../src/report.js";
import { loadIdentity } from "../../src/ai/identity.js";
import { deckSchema, typeDescriptions } from "../../src/ai/catalog.js";
import { createDeck, generateFromPlan, createReport, createDeckFromReport, sweepDensity } from "../../src/ai/pipeline.js";
import { generateReport } from "../../src/ai/report.js";
import { runChatTurn, loadThread, resetThread } from "../../src/ai/chat.js";
import { modelChoices } from "../../src/ai/ollama.js";
import { cloudStatus, setApiKey, clearApiKey, cloudKeyName, testCloudConnection, setRoutingPreference, routingPreference } from "../../src/cloud.js";
import { register, authenticate, startSession, endSession, userForToken, bearerToken, publicUser } from "../../src/auth.js";
import { listPresets, savePreset, updatePreset, deletePreset } from "../../src/presets.js";
import { normalizeBrand } from "../../tools/prep-brand.mjs";

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
 * Auth-first workspace. Everything under /api/decks and /api/reports needs a
 * session, so an unauthenticated browser sees a login screen and can never
 * reach the deck store. Two deliberate exemptions keep <img> tags working:
 * the raster and download GET routes key off a slug that is only discoverable
 * through the gated deck list, and a bare <img> cannot send the Authorization
 * header — so those stay open and the UI is never told a URL it cannot load.
 */
const deckWorkspace = async (req, res, next) => {
  if (/^\/([^/]+)\/(preview|download)\//.test(req.path)) return next();
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user) return fail(res, 401, "log in to use the deck workspace");
  req.user = user;
  next();
};
app.use("/api/decks", deckWorkspace);
app.use("/api/reports", deckWorkspace);
app.use("/api/presets", deckWorkspace);

/**
 * Per-slug ownership. An owned deck belongs to exactly one account; a folder
 * whose meta.yaml has no owner is a legacy deck (or a headless CLI run) and is
 * shared. The error is "no such deck", not "not yours", so a stranger cannot
 * even learn a slug exists. Same preview/download exemption as the gate above.
 */
async function assertDeckAccess(slug, user) {
  if (!slug || /[\/\\]|\.\./.test(slug)) throw new Error("no such deck");
  const dir = path.join(DECKS, slug);
  let meta = {};
  try {
    meta = YAML.parse(await readFile(path.join(dir, "meta.yaml"), "utf8")) ?? {};
  } catch { /* folder predates meta — legacy, shared */ }
  if (meta.owner && meta.owner !== user.email) throw new Error("no such deck");
}
app.use("/api/decks/:slug", async (req, res, next) => {
  if (/^\/(preview|download)\//.test(req.path)) return next();
  try {
    await assertDeckAccess(req.params.slug, req.user);
    next();
  } catch (err) {
    fail(res, 404, err.message);
  }
});

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

/** Slide templates — reusable partial slides to drop into a deck. */
app.get("/api/templates", wrap(async (_req, res) => {
  const { readdir, readFile } = await import("node:fs/promises");
  const dir = path.join(ROOT, "templates");
  let files = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".yaml"));
  } catch { /* no templates dir */ }
  const templates = await Promise.all(files.map(async (f) => ({
    name: f.replace(/\.yaml$/, ""),
    slide: YAML.parse(await readFile(path.join(dir, f), "utf8")),
  })));
  ok(res, { templates });
}));

/* ------------------------------------------------------------------- decks */

async function deckMeta(slug) {
  const dir = path.join(DECKS, slug);
  const deckFile = path.join(dir, "deck.yaml");

  // A report-only folder (standalone report, no deck yet) is still a deck
  // entry — it must show up in the Reports tab. Reads report.yaml instead.
  let deck = null;
  try {
    deck = YAML.parse(await readFile(deckFile, "utf8"));
  } catch { /* may be report-only */ }

  let meta = {};
  try {
    meta = YAML.parse(await readFile(path.join(dir, "meta.yaml"), "utf8")) ?? {};
  } catch { /* optional */ }

  let report = false;
  let title = deck?.title;
  try { await access(path.join(dir, "report.yaml")); report = true; } catch { /* none */ }
  if (!title) {
    try {
      const reportFile = YAML.parse(await readFile(path.join(dir, "report.yaml"), "utf8"));
      title = reportFile.title;
    } catch { /* nothing at all — skip below */ }
  }
  if (!deck && !report) throw new Error(`no deck.yaml or report.yaml for ${slug}`);

  let updated = null;
  for (const f of ["deck.yaml", "report.yaml", "meta.yaml"]) {
    try {
      const s = await stat(path.join(dir, f));
      updated = s.mtime;
      break;
    } catch { /* try next */ }
  }

  return {
    slug,
    title,
    theme: deck?.theme,
    slides: deck?.slides?.length ?? 0,
    updated,
    report,
    deck: Boolean(deck),
    meta,
    owner: meta.owner ?? null,
  };
}

app.get("/api/decks", wrap(async (req, res) => {
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
      const entry = await deckMeta(e.name);
      // Per-user workspace: only your decks (and shared ownerless legacy decks).
      if (entry.owner && entry.owner !== req.user.email) continue;
      decks.push(entry);
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

  // Version history: snapshot the current deck.yaml before overwriting, so a
  // destructive chat turn or an accidental delete has a timestamped escape
  // hatch. The first save of a deck has nothing to back up.
  const deckFile = path.join(dir, "deck.yaml");
  try {
    const cur = await readFile(deckFile, "utf8");
    const vdir = path.join(dir, "backups");
    await mkdir(vdir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await writeFile(path.join(vdir, `deck.${stamp}.yaml`), cur, "utf8");
  } catch { /* no deck.yaml yet */ }

  await writeFile(deckFile, YAML.stringify(deck), "utf8");
  if (meta) await writeFile(path.join(dir, "meta.yaml"), YAML.stringify(meta), "utf8");
  ok(res, {});
}));

/**
 * Delete a deck (or report-only folder) server-side. The per-slug access gate
 * above has already answered "no such deck" for anything that is not the
 * owner's, so reaching here is an authorised removal.
 */
app.delete("/api/decks/:slug", wrap(async (req, res) => {
  await rm(path.join(DECKS, req.params.slug), { recursive: true, force: true });
  ok(res, {});
}));

/** The deck's version history — timestamped backups of deck.yaml, newest first. */
app.get("/api/decks/:slug/versions", wrap(async (req, res) => {
  const dir = path.join(DECKS, req.params.slug, "backups");
  let versions = [];
  try {
    const names = (await readdir(dir)).filter((f) => /^deck\.\d{4}-\d{2}-\d{2}T.+\.yaml$/.test(f));
    versions = await Promise.all(names.map(async (f) => {
      const s = await stat(path.join(dir, f));
      return { file: f, at: s.mtime.toISOString() };
    }));
    versions.sort((a, b) => b.at.localeCompare(a.at));
  } catch { /* no backups yet */ }
  ok(res, { versions });
}));

/** Restore a versioned deck.yaml back over the working copy. */
app.post("/api/decks/:slug/versions/:file/restore", wrap(async (req, res) => {
  const file = path.join(DECKS, req.params.slug, "backups", path.basename(req.params.file));
  if (!/^deck\.\d{4}-\d{2}-\d{2}T.+\.yaml$/.test(path.basename(req.params.file))) {
    return fail(res, 400, "unrecognised version file");
  }
  const data = await readFile(file, "utf8");
  await writeFile(path.join(DECKS, req.params.slug, "deck.yaml"), data, "utf8");
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
  // The deck remembers its mode (F17): meta.yaml's `mode` is the default when
  // the request does not override it, so a dark deck stays dark across reloads.
  let metaMode = null;
  try {
    metaMode = YAML.parse(await readFile(path.join(dir, "meta.yaml"), "utf8"))?.mode ?? null;
  } catch { /* optional */ }
  const mode = req.body?.mode ?? metaMode ?? "light";

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

/**
 * The content-density sweep: rewrite the deck's content at a chosen density
 * (sparse/balanced/dense) keeping structure, types, presenters and order.
 * Same SSE transport as the other long runs — one scoped model call per
 * content slide, then a re-render.
 */
app.post("/api/decks/:slug/sweep", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { density, theme, model } = req.body ?? {};
  if (!["sparse", "balanced", "dense"].includes(density)) {
    sse.send("error", { error: "density must be one of sparse|balanced|dense" });
    return sse.close();
  }

  (async () => {
    const r = await sweepDensity({
      slug: req.params.slug, density, theme, model,
      signal: ctrl.signal,
      onProgress: (p) => sse.send("status", p),
    });
    sse.send("result", {
      slug: r.slug,
      density: r.density,
      slides: r.slides,
      thumbs: r.thumbs,
      problems: r.problems,
      swept: r.swept,
    });
    sse.close();
  })().catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});

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

/**
 * Export a deck as PDF or Markdown. PDF re-renders through the LibreOffice
 * converter; Markdown extracts the content from deck.yaml. Both land in
 * decks/<slug>/out/ so the download route serves them.
 */
app.post("/api/decks/:slug/export", wrap(async (req, res) => {
  const { format = "pdf", theme } = req.body ?? {};
  const { exportDeck } = await import("../../src/export.js");
  const deckFile = path.join(DECKS, req.params.slug, "deck.yaml");
  const r = await exportDeck({ deckFile, format, themeName: theme });
  ok(res, {
    format: r.format,
    file: `/api/decks/${req.params.slug}/download/${path.basename(r.outFile)}`,
  });
}));

/** Clone a deck to a fresh slug — try a new theme or regenerate without fear. */
app.post("/api/decks/:slug/clone", wrap(async (req, res) => {
  const { cloneDeck } = await import("../../src/ai/pipeline.js");
  const r = await cloneDeck({ slug: req.params.slug });
  ok(res, r);
}));

/**
 * The sharing bundle: a zip of everything another user needs to unpack the deck
 * into their own decks/ folder — content files plus the rendered pptx.
 */
app.post("/api/decks/:slug/bundle", wrap(async (req, res) => {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const dir = path.join(DECKS, req.params.slug);
  const include = ["deck.yaml", "meta.yaml", "plan.yaml", "report.yaml", "research", "out"];
  for (const name of include) {
    const src = path.join(dir, name);
    let st;
    try {
      st = await stat(src);
    } catch { continue; }
    if (st.isDirectory()) {
      for (const f of await readdir(src, { recursive: true })) {
        try {
          zip.file(path.posix.join(req.params.slug, name, f), await readFile(path.join(src, f)));
        } catch { /* unreadable file — skip */ }
      }
    } else {
      zip.file(path.posix.join(req.params.slug, name), await readFile(src));
    }
  }
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${req.params.slug}.zip"`);
  res.send(buf);
}));

/**
 * Full-text content search across deck.yaml files — the deck list's client-side
 * title filter stops being enough once the count grows past a screen.
 */
app.post("/api/decks/search", wrap(async (req, res) => {
  const q = String(req.body?.q ?? "").trim().toLowerCase();
  if (!q) return ok(res, { hits: [] });
  let entries = [];
  try {
    entries = await readdir(DECKS, { withFileTypes: true });
  } catch {
    return ok(res, { hits: [] });
  }
  const hits = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      // Search is scoped to your workspace like the list is.
      let owner = null;
      try {
        owner = YAML.parse(await readFile(path.join(DECKS, e.name, "meta.yaml"), "utf8"))?.owner ?? null;
      } catch { /* legacy folder */ }
      if (owner && owner !== req.user.email) continue;
      const text = await readFile(path.join(DECKS, e.name, "deck.yaml"), "utf8");
      if (text.toLowerCase().includes(q)) hits.push(e.name);
    } catch { /* no deck.yaml */ }
  }
  ok(res, { hits });
}));

/* ---------------------------------------------------------------- reports */

/** The deck's research artefact — what the model is drawing from. The panel's
 *  whole point is that the user must be able to see and correct it. No research
 *  dir is not an error: it is the "research this deck" hint. */
app.get("/api/decks/:slug/research", wrap(async (req, res) => {
  const dir = path.join(DECKS, req.params.slug, "research");
  let notes = null;
  try {
    notes = await readFile(path.join(dir, "notes.md"), "utf8");
  } catch { /* no research pass yet */ }

  let sources = [];
  try {
    sources = JSON.parse(await readFile(path.join(dir, "sources.json"), "utf8")) ?? [];
  } catch { /* malformed or missing — the notes may still be valid */ }

  ok(res, { exists: notes != null, notes, sources });
}));

/** Save research back to disk — the edit half of the panel. Either or both of
 *  `notes` and `sources` may be given; the next generation reads notes.md, so
 *  an edit here is what the writer sees. */
app.put("/api/decks/:slug/research", wrap(async (req, res) => {
  const { notes, sources } = req.body ?? {};
  if (notes != null && typeof notes !== "string") {
    return fail(res, 400, "notes must be a string");
  }
  if (sources != null && !Array.isArray(sources)) {
    return fail(res, 400, "sources must be an array");
  }

  const dir = path.join(DECKS, req.params.slug, "research");
  await mkdir(dir, { recursive: true });
  if (notes != null) await writeFile(path.join(dir, "notes.md"), notes, "utf8");
  if (sources != null) await writeFile(path.join(dir, "sources.json"), JSON.stringify(sources, null, 2), "utf8");
  ok(res, { exists: true });
}));

app.get("/api/decks/:slug/report", wrap(async (req, res) => {
  const dir = path.join(DECKS, req.params.slug);
  const file = path.join(dir, "report.yaml");
  let report;
  try {
    report = YAML.parse(await readFile(file, "utf8"));
  } catch {
    return fail(res, 404, "no report.yaml saved for this deck");
  }
  // The title-page facts (subject, guide, team) come from the merged identity —
  // config/identity.yaml defaults overridden by meta.yaml, the same merge the
  // .docx renderer performs. The viewer renders them as a cover block.
  let identity = {};
  try {
    identity = await loadIdentity(dir);
  } catch { /* identity may be absent on a bare clone */ }
  ok(res, { report, identity });
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

/**
 * Generate report.yaml from the deck's shared research and approved outline —
 * the report's half of the submission workflow. Same SSE transport and
 * abort-on-disconnect as deck generation.
 */
app.post("/api/decks/:slug/report/generate", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { depth, model } = req.body ?? {};
  (async () => {
    const r = await generateReport({
      slug: req.params.slug,
      depth,
      model,
      signal: ctrl.signal,
      onProgress: (p) => sse.send("status", p),
    });
    sse.send("result", { sections: r.sections, skipped: r.skipped, depth: r.depth });
    sse.close();
  })().catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});

/* ------------------------------------------------------------- generation */

app.get("/api/types", wrap(async (_req, res) => {
  const schema = await deckSchema();
  const descriptions = await typeDescriptions();
  ok(res, {
    types: schema.definitions.slide.properties.type.enum,
    descriptions,
  });
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
      owner: req.user.email,
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
  const { models, default: def, cloud } = await modelChoices();
  ok(res, { models, default: def, cloud });
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

/**
 * Standalone report — brief → research → report.yaml → .docx with NO deck.
 * The Reports tab's "from a brief" path. Same SSE transport and
 * abort-on-disconnect as the other long runs.
 */
app.post("/api/reports", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { brief, sources, research, depth, density, model, identity } = req.body ?? {};
  if (!brief?.trim()) {
    sse.send("error", { error: "body must include a `brief`" });
    return sse.close();
  }

  (async () => {
    const r = await createReport({
      brief, sources, research, depth, density, model, identity,
      owner: req.user.email,
      signal: ctrl.signal,
      onProgress: (p) => sse.send("status", p),
    });
    sse.send("result", {
      slug: r.slug,
      title: r.title,
      sections: r.sections,
      skipped: r.skipped,
      depth: r.depth ?? depth,
      docx: `/api/decks/${r.slug}/download/report.docx`,
    });
    sse.close();
  })().catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});

/**
 * Deck-from-report — the reverse flow. Given an existing report.yaml, plan a
 * companion deck outline from the report's own sections, then route the user
 * through the same outline gate and /generate path. Same SSE transport.
 */
app.post("/api/decks/:slug/report/deck", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { theme, model } = req.body ?? {};
  (async () => {
    const r = await createDeckFromReport({
      slug: req.params.slug, theme, model,
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

/* ---------------------------------------------------------------- presets */

/**
 * Saved briefing formats, per user. A preset is the reusable half of a
 * briefing — the fixed fields (team, guide, academic, theme, density,
 * branding, slides-per-member) — so the briefing's first question can offer
 * "use a saved format?" and pre-fill the rest. Gated by the same session
 * check as the deck workspace.
 */
app.get("/api/presets", wrap(async (req, res) => {
  ok(res, { presets: await listPresets(req.user.email) });
}));

app.post("/api/presets", wrap(async (req, res) => {
  const { name, team, guide, academic, theme, density, branding, slidesPerMember } = req.body ?? {};
  const preset = await savePreset(req.user.email, { name, team, guide, academic, theme, density, branding, slidesPerMember });
  ok(res, { preset });
}));

app.put("/api/presets/:id", wrap(async (req, res) => {
  const { name, team, guide, academic, theme, density, branding, slidesPerMember } = req.body ?? {};
  const preset = await updatePreset(req.user.email, req.params.id, { name, team, guide, academic, theme, density, branding, slidesPerMember });
  ok(res, { preset });
}));

app.delete("/api/presets/:id", wrap(async (req, res) => {
  await deletePreset(req.user.email, req.params.id);
  ok(res, {});
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

/* ------------------------------------------------------------------- brand */

const BRAND_ASSETS = ["crest", "banner", "watermark"];
const BRAND_SRC = path.join(BRAND, "logos");

/** What the Brand panel renders: which marks exist, and whether placeholders
 *  are in use (a fresh clone generates neutral stand-ins). */
async function brandStatus() {
  let entries = [];
  try {
    entries = await readdir(BRAND_SRC, { withFileTypes: true });
  } catch { /* no logos dir yet */ }
  const sources = {};
  for (const name of BRAND_ASSETS) {
    const hit = entries.find((e) => !e.isDirectory() && e.name.startsWith(`${name}.`));
    sources[name] = hit ? hit.name : null;
  }
  const inv = await normalizeBrand();
  return { sources, placeholder: inv.placeholder };
}

app.get("/api/brand", wrap(async (_req, res) => {
  ok(res, { brand: await brandStatus() });
}));

/**
 * Upload a source mark. The body is the raw image bytes; the extension comes
 * from the request, so any raster format works (png/jpg/webp/tiff/gif). The
 * file lands in gitignored brand/logos/ and normalisation re-runs, so the
 * renderer picks it up on the next render — no repo edits, marks stay local.
 */
app.post("/api/brand/:name", (req, res, next) => {
  const name = req.params.name;
  if (!BRAND_ASSETS.includes(name)) return fail(res, 400, `unknown brand asset "${name}"`);
  if (typeof req.headers["x-file-ext"] !== "string" || !/^[a-z0-9]{2,5}$/i.test(req.headers["x-file-ext"])) {
    return fail(res, 400, "missing or invalid X-File-Ext header");
  }
  express.raw({ type: () => true, limit: "20mb" })(req, res, async () => {
    try {
      const ext = req.headers["x-file-ext"].toLowerCase();
      const file = path.join(BRAND_SRC, `${name}.${ext}`);
      await mkdir(BRAND_SRC, { recursive: true });
      // Replace any earlier extension of the same asset (crest.jpg -> crest.png).
      const entries = await readdir(BRAND_SRC).catch(() => []);
      for (const e of entries) {
        if (e.startsWith(`${name}.`) && e !== path.basename(file)) {
          await rm(path.join(BRAND_SRC, e), { force: true });
        }
      }
      await writeFile(file, req.body);
      const inv = await normalizeBrand();
      ok(res, { asset: name, file: path.basename(file), brand: { sources: inv.sources, placeholder: false } });
    } catch (err) {
      fail(res, 500, err.message);
    }
  });
});

/** Remove a source mark and re-normalise — falls back to placeholders. */
app.delete("/api/brand/:name", wrap(async (req, res) => {
  const name = req.params.name;
  if (!BRAND_ASSETS.includes(name)) return fail(res, 400, `unknown brand asset "${name}"`);
  const entries = await readdir(BRAND_SRC).catch(() => []);
  let removed = null;
  for (const e of entries) {
    if (e.startsWith(`${name}.`)) {
      await rm(path.join(BRAND_SRC, e), { force: true });
      removed = e;
    }
  }
  const inv = await normalizeBrand();
  ok(res, { asset: name, removed, brand: await brandStatus() });
}));

/* ------------------------------------------------------------------- auth */

/**
 * Local single-install accounts. Sessions are bearer tokens held server-side;
 * the token rides the Authorization header and nothing sensitive ever leaves
 * the machine. These endpoints protect the Cloud-key surface (and future
 * hosting), not the deck pipeline — everything else stays open.
 */
app.post("/api/auth/register", wrap(async (req, res) => {
  const { name, email, password } = req.body ?? {};
  try {
    const user = await register({ name, email, password });
    // Registration deliberately does not start a session — the visitor logs in
    // with the new credentials explicitly, so creating an account never hands
    // out a token.
    ok(res, { user });
  } catch (err) {
    fail(res, 400, err.message);
  }
}));

app.post("/api/auth/login", wrap(async (req, res) => {
  const { email, password } = req.body ?? {};
  const user = await authenticate(email, password);
  if (!user) return fail(res, 401, "invalid email or password");
  const token = await startSession(user);
  ok(res, { token, user });
}));

app.post("/api/auth/logout", wrap(async (req, res) => {
  await endSession(bearerToken(req.headers.authorization));
  ok(res, {});
}));

app.get("/api/auth/me", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user) return fail(res, 401, "not logged in");
  ok(res, { user });
}));

/** The cloud-key gate — writes and tests require a logged-in session. */
async function requireAuth(req, res) {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user) {
    res.status(401).json({ ok: false, error: "log in to manage the cloud key" });
    return null;
  }
  return user;
}

/* ------------------------------------------------------------------- cloud */

/**
 * The opt-in cloud backend surface. The key is never returned — status gives
 * booleans and labels, test gives a success/failure detail string. The write
 * path lands in gitignored config/local.yaml via src/cloud.js.
 */
app.get("/api/cloud", wrap(async (_req, res) => {
  ok(res, { cloud: await cloudStatus() });
}));

app.put("/api/cloud/key", wrap(async (req, res) => {
  if (!(await requireAuth(req, res))) return;
  const { key } = req.body ?? {};
  if (typeof key !== "string" || !/^sk-[A-Za-z0-9_-]{8,}$/.test(key)) {
    return fail(res, 400, "key must look like an API key (starts with sk-, at least 8 chars)");
  }
  const name = await cloudKeyName();
  if (!name) return fail(res, 400, "no cloud provider configured in config/models.yaml");
  await setApiKey(name, key);
  ok(res, {});
}));

app.delete("/api/cloud/key", wrap(async (req, res) => {
  if (!(await requireAuth(req, res))) return;
  const name = await cloudKeyName();
  if (name) await clearApiKey(name);
  ok(res, {});
}));

app.post("/api/cloud/test", wrap(async (_req, res) => {
  ok(res, await testCloudConnection());
}));

/** The LOCAL/CLOUD routing preference — a gitignored config/local.yaml value. */
app.put("/api/cloud/routing", wrap(async (req, res) => {
  const route = req.body?.route;
  await setRoutingPreference(route);
  ok(res, { route: await routingPreference() });
}));

/* -------------------------------------------------------------------- boot */

/** README as plain text — the shell's docs modal renders it with no parser. */
app.get("/api/docs", wrap(async (_req, res) => {
  const text = await readFile(path.join(ROOT, "README.md"), "utf8");
  res.type("text/plain").send(text);
}));

app.get("/api/health", (_req, res) => ok(res, { root: ROOT }));

app.listen(PORT, () => {
  console.log(`  api   http://localhost:${PORT}`);
});
