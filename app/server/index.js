/** Express route composition; business behavior remains in src/. */

import express from "express";
import cors from "cors";
import { readFile, writeFile, readdir, mkdir, stat, access, rm } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { ROOT, DECKS, THEMES, CONFIG, BRAND } from "../../src/paths.js";
import { readCredits, isCitable } from "../../src/credits.js";
import { loadTheme, listThemes, loadStyle, listStyles } from "../../src/theme.js";
import { validateDeck } from "../../src/validate.js";
import { render } from "../../src/render.js";
import { placeholderSlides } from "../../src/placeholders.js";
import { preview, reportPreview } from "../../src/preview.js";
import { renderReport, validateReport, donorStatus, donorDirForDeck } from "../../src/report.js";
import { loadIdentity } from "../../src/ai/identity.js";
import { runAsAccount } from "../../src/account.js";
import { isAutoProviderId } from "../../src/autoid.js";
import { newMeter, withMeter, meterTotal, meterSummary, estimateTokens } from "../../src/usage.js";
import { deckSchema, typeDescriptions } from "../../src/ai/catalog.js";
import { createDeck, generateFromPlan, resumeGeneration, finalizeDeck, createReport, createDeckFromReport, sweepDensity, convertSlideType, insertDeckSlide, generationStatus, reportUnavailable } from "../../src/ai/pipeline.js";
import { generateScript } from "../../src/ai/script.js";
import { ingestUpload, stageUpload, sweepStagedUploads, UPLOAD_MAX_BYTES, UPLOAD_EXT } from "../../src/ai/upload.js";
import { generateReport } from "../../src/ai/report.js";
import { researchSummary } from "../../src/ai/research.js";
import { deckFigures } from "../../src/ai/grounding.js";
import { runChatTurn, loadThread, resetThread } from "../../src/ai/chat.js";
import { modelChoices } from "../../src/ai/ollama.js";
import { routingPreference, autoProvider, isHosted } from "../../src/cloud.js";
import { userForToken, bearerToken, isAdmin, canAccessDeck, getUserId, verificationRequired, verifiedRequestOnly } from "../../src/auth.js";
import { reserveAuto, settleAuto, limitConfig } from "../../src/limits.js";
import { registerAuthRoutes, resolveUser } from "./auth-routes.js";
import { fail, ok, wrap } from "./http.js";
import { registerAccountRoutes } from "./account-routes.js";
import { configureLifecycle, reportBootGaps } from "./lifecycle.js";
import { registerWorkspaceSettingsRoutes } from "./workspace-settings-routes.js";
import { registerAdminRoutes } from "./admin-routes.js";



const app = express();
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
const UI_ORIGIN = (process.env.FORGE_UI_ORIGIN ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (UI_ORIGIN.length) {
  app.use(cors({ origin: UI_ORIGIN }));
} else {
  app.use(cors({ origin: true }));
}
if (process.env.FORGE_TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

app.use(express.json({ limit: "8mb" }));


app.use(async (req, _res, next) => {
  let account = null;
  try {
    const user = await resolveUser(req, { allowCookie: true });
    if (user) account = { email: user.email, userId: getUserId(user.email) };
  } catch { /* an unreadable token is simply an anonymous request */ }
  req.meter = newMeter();
  const run = () => withMeter(req.meter, () => next());
  if (!account) return run();
  runAsAccount(account, run);
});
const PORT = process.env.FORGE_API_PORT || 5174;


async function isAutoRoute(model, userEmail = null) {
  const ap = await autoProvider();
  const isTcet = isAutoProviderId(ap?.kind) && ap?.keySet;
  if (!isTcet) return false;
  if (model && ap.models?.includes(String(model))) return true;
  if (model) return false;
  const route = await routingPreference(userEmail ? getUserId(userEmail) : null);
  return route === "auto";
}

function reserveAutoOrThrow(userEmail, upcomingSlides = 0, tokens = null) {
  const uid = getUserId(userEmail);
  if (!uid) return { allowed: true };
  const upcomingTokens = tokens ?? estimateTokens({ slides: upcomingSlides, research: true });
  const chk = reserveAuto({ userId: uid, upcomingSlides, upcomingTokens });
  if (!chk.allowed) {
    const e = new Error(chk.errors.join(" · "));
    e.status = 429;
    e.limits = { plan: chk.plan, remaining: chk.remaining, usage: chk.usage };
    throw e;
  }
  return chk;
}


function settleRequest(req, reservation, { slides = null } = {}) {
  if (!reservation?.eventId || !req?.meter) return;
  try {
    settleAuto({ eventId: reservation.eventId, tokens: meterTotal(req.meter), slides });
  } catch { /* metering must never be the reason a response fails */ }
}


const RENDER_MAX_WAIT = 3 * 60 * 1000;
const RENDER_MAX_QUEUE = 2;


let renderTail = Promise.resolve();
let renderQueued = 0;
function renderSlot() {
  if (renderQueued >= RENDER_MAX_QUEUE) {
    return Promise.reject(new Error("server is busy rendering — try again shortly"));
  }
  const prev = renderTail;
  let release;
  renderTail = new Promise((r) => { release = r; });
  renderQueued += 1;
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    renderQueued -= 1;
  };
  const timer = setTimeout(() => {
    settle();
    release();
  }, RENDER_MAX_WAIT);
  return prev.then(() => {
    clearTimeout(timer);
    settle();
    return release;
  });
}
const withRenderSlot = (fn) => async (req, res) => {
  let release;
  try {
    release = await renderSlot();
  } catch (err) {
    return fail(res, 429, err.message);
  }
  try {
    await fn(req, res);
  } catch (err) {
    fail(res, 500, err.message);
  } finally {
    release();
  }
};


const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,99}$/;


const MEDIA_PATH = /^\/([^/]+)\/(preview|download|assets)\//;

const deckWorkspace = async (req, res, next) => {
  const media = req.path.match(MEDIA_PATH);
  if (media && !SLUG_RE.test(media[1])) return fail(res, 404, "no such deck");
  const user = await resolveUser(req, { allowCookie: Boolean(media) });
  if (!user) return fail(res, 401, "log in to use the deck workspace");
  if (!user.verified && verificationRequired() && verifiedRequestOnly({ method: req.method, path: req.path })) {
    return res.status(403).json({
      ok: false,
      error: "confirm your email address to start creating — check your inbox for the link",
      code: "email_unverified",
    });
  }
  req.user = user;
  next();
};
app.use("/api/decks", deckWorkspace);
app.use("/api/reports", deckWorkspace);
app.use("/api/presets", deckWorkspace);
app.use("/api/briefing", deckWorkspace);


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
      let owner = null;
      try {
        owner = YAML.parse(await readFile(path.join(DECKS, e.name, "meta.yaml"), "utf8"))?.owner ?? null;
      } catch { /* legacy folder */ }
      if (!canAccessDeck(req.user, owner)) continue;
      const text = await readFile(path.join(DECKS, e.name, "deck.yaml"), "utf8");
      if (text.toLowerCase().includes(q)) hits.push(e.name);
    } catch { /* no deck.yaml */ }
  }
  ok(res, { hits });
}));


async function assertDeckAccess(slug, user) {
  if (!slug || /[\/\\]|\.\./.test(slug)) throw new Error("no such deck");
  const dir = path.join(DECKS, slug);
  let meta = {};
  try {
    meta = YAML.parse(await readFile(path.join(dir, "meta.yaml"), "utf8")) ?? {};
  } catch { /* folder predates meta — legacy, operator-owned */ }
  if (!canAccessDeck(user, meta.owner)) throw new Error("no such deck");
}
app.use("/api/decks/:slug", async (req, res, next) => {
  if (!SLUG_RE.test(req.params.slug)) return fail(res, 404, "no such deck");
  try {
    await assertDeckAccess(req.params.slug, req.user);
    next();
  } catch (err) {
    fail(res, 404, err.message);
  }
});


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
      plate: t.plate?.enabled === true,
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
const LANDING_DIR = path.join(ROOT, "app", "gallery", "landing");
const LANDING_FILE = /^[a-z0-9][a-z0-9._-]{0,99}\.(webp|json)$/;

app.get("/api/landing/:file", wrap(async (req, res) => {
  if (!LANDING_FILE.test(req.params.file)) return res.status(404).end();
  const file = path.join(LANDING_DIR, req.params.file);
  try {
    await stat(file);
    if (req.params.file.endsWith(".webp")) res.set("Cache-Control", "public, max-age=604800");
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
async function dirSize(dir) {
  let total = 0;
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) total += await dirSize(full);
    else if (e.isFile()) { try { total += (await stat(full)).size; } catch { /* raced a delete */ } }
  }
  return total;
}

async function deckMeta(slug) {
  const dir = path.join(DECKS, slug);
  const deckFile = path.join(dir, "deck.yaml");
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
  let research = false;
  let script = false;
  try { await access(path.join(dir, "research", "notes.md")); research = true; } catch { /* none */ }
  try { await access(path.join(dir, "script.md")); script = true; } catch { /* none */ }
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
    research,
    script,
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
      if (!canAccessDeck(req.user, entry.owner)) continue;
      decks.push(entry);
    } catch { /* folder without a valid deck.yaml — skip */ }
  }
  decks.sort((a, b) => b.updated - a.updated);
  ok(res, { decks });
}));


app.get("/api/decks/:slug/project", wrap(async (req, res) => {
  try {
    const m = await deckMeta(req.params.slug);
    ok(res, { project: { slug: m.slug, title: m.title, theme: m.theme, slides: m.slides, updated: m.updated, deck: m.deck, report: m.report, research: m.research, script: m.script } });
  } catch {
    return fail(res, 404, "no such deck");
  }
}));

app.get("/api/decks/:slug", wrap(async (req, res) => {
  const dir = path.join(DECKS, req.params.slug);
  const deck = YAML.parse(await readFile(path.join(dir, "deck.yaml"), "utf8"));
  let meta = {};
  try {
    meta = YAML.parse(await readFile(path.join(dir, "meta.yaml"), "utf8")) ?? {};
  } catch { /* optional */ }
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
  let dirty = true;
  try {
    const deckStat = await stat(path.join(dir, "deck.yaml"));
    const outStat = await stat(path.join(dir, "out", "deck.pptx"));
    dirty = deckStat.mtimeMs > outStat.mtimeMs;
  } catch { /* no render yet — render needed */ }
  const onDisk = await generationStatus(req.params.slug);
  const live = generationRunInfo(req.params.slug);
  const imageCredits = (await readCredits(dir)).map((c) => ({ ...c, citable: isCitable(c) }));

  ok(res, {
    deck, meta, slides, thumbs, placeholders: placeholderSlides(deck), dirty, imageCredits,
    run: {
      ...onDisk,
      ...live,
      resumable: onDisk.partial,
      needsFinalize: onDisk.unfinalised && live.active === false,
    },
  });
}));

app.put("/api/decks/:slug", wrap(async (req, res) => {
  const { deck, meta } = req.body ?? {};
  if (!deck) return fail(res, 400, "body must include `deck`");

  const { ok: valid, errors } = await validateDeck(deck);
  if (!valid) return res.status(422).json({ ok: false, error: "validation failed", errors });

  const dir = path.join(DECKS, req.params.slug);
  await mkdir(dir, { recursive: true });
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


app.delete("/api/decks/:slug", wrap(async (req, res) => {
  await rm(path.join(DECKS, req.params.slug), { recursive: true, force: true });
  ok(res, {});
}));


app.post("/api/sweep", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user) return fail(res, 401, "log in to run the sweep");
  if (!isAdmin(user)) return fail(res, 403, "the sweep is an operator tool");
  const { sweep } = await import("../../src/sweep.js");
  const dryRun = req.body?.dryRun !== false;
  const olderThanDays = Number(req.body?.olderThanDays || NaN);
  const r = await sweep({ dryRun, ...(Number.isFinite(olderThanDays) && olderThanDays > 0 ? { olderThanDays } : {}) });
  ok(res, r);
}));

registerAdminRoutes(app, { deckMeta, dirSize });


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


app.post("/api/decks/:slug/versions/:file/restore", wrap(async (req, res) => {
  const file = path.join(DECKS, req.params.slug, "backups", path.basename(req.params.file));
  if (!/^deck\.\d{4}-\d{2}-\d{2}T.+\.yaml$/.test(path.basename(req.params.file))) {
    return fail(res, 400, "unrecognised version file");
  }
  const data = await readFile(file, "utf8");
  await writeFile(path.join(DECKS, req.params.slug, "deck.yaml"), data, "utf8");
  ok(res, {});
}));


app.post("/api/validate", wrap(async (req, res) => {
  const { ok: valid, errors } = await validateDeck(req.body?.deck ?? {});
  ok(res, { valid, errors });
}));
const DECK_IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif"]);
const DECK_IMAGE_MAX = 15 * 1024 * 1024; // 15 MB — a slide image, not a photo library


function sniffImage(buf, ext) {
  const h = buf.slice(0, 16);
  switch (ext) {
    case "png":
      return h.length >= 8 && h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47;
    case "jpg":
    case "jpeg":
      return h.length >= 3 && h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff;
    case "gif":
      return h.length >= 4 && h[0] === 0x47 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x38;
    case "webp":
      return h.length >= 12 && h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46
        && h[8] === 0x57 && h[9] === 0x45 && h[10] === 0x42 && h[11] === 0x50;
    case "avif":
      return h.length >= 12 && h[4] === 0x66 && h[5] === 0x74 && h[6] === 0x79 && h[7] === 0x70
        && h[8] === 0x61 && h[9] === 0x76 && h[10] === 0x69;
    case "tiff":
      return (h.length >= 4 && h[0] === 0x49 && h[1] === 0x49 && h[2] === 0x2a && h[3] === 0x00)
        || (h.length >= 4 && h[0] === 0x4d && h[1] === 0x4d && h[2] === 0x00 && h[3] === 0x2a);
    default:
      return false;
  }
}



app.post("/api/decks/:slug/assets", (req, res) => {
  const ext = String(req.headers["x-file-ext"] ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!DECK_IMAGE_EXT.has(ext)) {
    return fail(res, 400, `unsupported image extension — allowed: ${[...DECK_IMAGE_EXT].join(", ")}`);
  }
  const maxMB = Math.round(DECK_IMAGE_MAX / 1024 / 1024);
  express.raw({ type: () => true, limit: DECK_IMAGE_MAX })(req, res, (err) => {
    if (err) return fail(res, 413, `image too large — max ${maxMB} MB`);
    (async () => {
      try {
        if (!req.body?.length) return fail(res, 400, "empty upload");
        if (!sniffImage(req.body, ext)) {
          return fail(res, 400, `file does not look like a ${ext} image`);
        }
        const dir = path.join(DECKS, req.params.slug, "assets");
        await mkdir(dir, { recursive: true });
        const name = `image-${Date.now().toString(36)}.${ext}`;
        await writeFile(path.join(dir, name), req.body);
        ok(res, { file: `assets/${name}`, url: `/api/decks/${req.params.slug}/assets/${name}` });
      } catch (err) {
        fail(res, 500, err.message);
      }
    })();
  });
});


app.get("/api/decks/:slug/assets/:file", wrap(async (req, res) => {
  const file = path.join(DECKS, req.params.slug, "assets", path.basename(req.params.file));
  try {
    await stat(file);
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; img-src data: blob:");
    res.sendFile(file);
  } catch {
    res.status(404).end();
  }
}));


app.post("/api/briefing/upload", (req, res, next) => {
  const ext = String(req.headers["x-file-ext"] ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  let name = "";
  try { name = decodeURIComponent(String(req.headers["x-file-name"] ?? "")); } catch { name = ""; }
  name = name.replace(/[^\w .()-]/g, "").slice(0, 120);
  if (!UPLOAD_EXT.has(ext)) {
    return fail(res, 400, `unsupported file type — upload a .md, .txt, .docx or .pdf`);
  }
  express.raw({ type: () => true, limit: UPLOAD_MAX_BYTES })(req, res, (err) => {
    if (err) return fail(res, 413, `file too large — max ${Math.round(UPLOAD_MAX_BYTES / 1024 / 1024)} MB`);
    (async () => {
      try {
        const ingested = await ingestUpload(req.body, { name, ext });
        const staged = await stageUpload(ingested);
        ok(res, { ...staged, preview: ingested.text.slice(0, 500) });
      } catch (err) {
        fail(res, 400, err.message);
      }
    })();
  });
});


sweepStagedUploads().catch(() => {});

app.post("/api/decks/:slug/render", withRenderSlot(async (req, res) => {
  const dir = path.join(DECKS, req.params.slug);
  const deckFile = path.join(dir, "deck.yaml");
  const themeName = req.body?.theme;
  const style = req.body?.style;
  let metaMode = null;
  try {
    metaMode = YAML.parse(await readFile(path.join(dir, "meta.yaml"), "utf8"))?.mode ?? null;
  } catch { /* optional */ }
  const mode = req.body?.mode ?? metaMode ?? "light";

  let r;
  try {
    r = await render({ deckFile, themeName, style, mode });
  } catch (err) {
    if (/render refused/i.test(err.message)) return fail(res, 422, err.message);
    throw err;
  }
  const p = await preview(r.outFile, { dpi: req.body?.dpi ?? 110 });
  const base = `/api/decks/${req.params.slug}/preview`;

  let deck = null;
  try { deck = YAML.parse(await readFile(deckFile, "utf8")); } catch { /* unreachable — just rendered */ }
  ok(res, {
    slides: p.pages.map((f) => `${base}/${path.basename(f)}`),
    thumbs: p.thumbs.map((f) => `${base}/thumbs/${path.basename(f)}`),
    problems: r.problems,
    placeholders: placeholderSlides(deck ?? {}),
    pptx: `/api/decks/${req.params.slug}/download/deck.pptx`,
  });
}));


app.post("/api/decks/:slug/sweep", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { density, theme, model } = req.body ?? {};
  if (!["sparse", "balanced", "dense"].includes(density)) {
    sse.send("error", { error: "density must be one of sparse|balanced|dense" });
    return sse.close();
  }

  let reservation = null;
  (async () => {
    if (await isAutoRoute(model, req.user.email)) {
      reservation = reserveAutoOrThrow(req.user.email, 0, estimateTokens({ slides: 12 }));
    }
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
  })().finally(() => settleRequest(req, reservation)).catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});


app.post("/api/decks/:slug/script", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { index, model } = req.body ?? {};
  let reservation = null;
  (async () => {
    if (await isAutoRoute(model, req.user.email)) {
      reservation = reserveAutoOrThrow(
        req.user.email, 0,
        index != null ? estimateTokens({}) : estimateTokens({ slides: 12 }),
      );
    }
    const r = await generateScript({
      slug: req.params.slug,
      index: index != null ? Number(index) : null,
      model,
      signal: ctrl.signal,
      onProgress: (p) => sse.send("status", p),
    });
    sse.send("result", {
      slides: r.slides,
      regenerated: r.regenerated,
      problems: r.problems,
      file: `/api/decks/${req.params.slug}/download/script.md`,
    });
    sse.close();
  })().finally(() => settleRequest(req, reservation)).catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});


app.get("/api/decks/:slug/script", wrap(async (req, res) => {
  const file = path.join(DECKS, req.params.slug, "script.md");
  let markdown = null;
  try {
    markdown = await readFile(file, "utf8");
  } catch { /* no script yet */ }

  if (markdown == null) return ok(res, { exists: false, slides: [] });

  let deck = {};
  try { deck = YAML.parse(await readFile(path.join(DECKS, req.params.slug, "deck.yaml"), "utf8")) ?? {}; } catch { /* legacy */ }
  const deckSlides = deck.slides ?? [];

  const blocks = parseScriptBlocks(markdown);
  const slides = deckSlides.map((s, i) => {
    const raw = blocks.get(i);
    return {
      index: i,
      presenter: s.presenter ?? null,
      type: s.type,
      headline: s.headline ?? s.quote ?? s.title ?? s.type,
      written: Boolean(raw),
      body: raw
        ? raw
            .replace(/^<!-- slide:\d+ -->\s*/, "")
            .replace(/\s*<!-- \/slide:\d+ -->$/, "")
            .replace(/^##[^\n]*\n+\s*_[^\n]*_\s*\n*/m, "") // drop the heading + presenter line; the card shows those from deck.yaml
            .trim()
        : "",
    };
  });
  ok(res, { exists: true, title: deck.title ?? "", slides });
}));

function parseScriptBlocks(markdown) {
  const blocks = new Map();
  const re = /<!-- slide:(\d+) -->([\s\S]*?)<!-- \/slide:\1 -->/g;
  let m;
  while ((m = re.exec(markdown))) blocks.set(Number(m[1]), m[0]);
  return blocks;
}


app.get("/api/decks/:slug/preview/report/thumbs/:file", wrap(async (req, res) => {
  const file = path.join(DECKS, req.params.slug, "out", "report-preview", "thumbs", path.basename(req.params.file));
  try {
    await stat(file);
    res.sendFile(file);
  } catch {
    res.status(404).end();
  }
}));

app.get("/api/decks/:slug/preview/report/:file", wrap(async (req, res) => {
  const file = path.join(DECKS, req.params.slug, "out", "report-preview", path.basename(req.params.file));
  try {
    await stat(file);
    res.sendFile(file);
  } catch {
    res.status(404).end();
  }
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



app.post("/api/decks/:slug/slides/:index/insert", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { type, purpose, model } = req.body ?? {};
  let reservation = null;
  (async () => {
    if (await isAutoRoute(model, req.user.email)) {
      reservation = reserveAutoOrThrow(req.user.email, 1, estimateTokens({ slides: 1 }));
    }
    const r = await insertDeckSlide({
      slug: req.params.slug,
      index: Number(req.params.index),
      type: type ?? null,
      purpose: purpose ?? null,
      model,
      signal: ctrl.signal,
      onProgress: (p) => sse.send("status", p),
    });
    sse.send("result", r);
    sse.close();
  })().finally(() => settleRequest(req, reservation)).catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message, limits: err.limits });
    sse.close();
  });
});

app.post("/api/decks/:slug/slides/:index/convert", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { type, model } = req.body ?? {};
  if (!type) {
    sse.send("error", { error: "body must include a target `type`" });
    return sse.close();
  }

  let reservation = null;
  (async () => {
    if (await isAutoRoute(model, req.user.email)) {
      reservation = reserveAutoOrThrow(req.user.email, 0, estimateTokens({}));
    }
    const r = await convertSlideType({
      slug: req.params.slug,
      index: Number(req.params.index),
      type,
      model,
      signal: ctrl.signal,
      onProgress: (p) => sse.send("status", p),
    });
    sse.send("result", {
      slug: r.slug,
      index: r.index,
      slide: r.slide,
      method: r.method,
      slides: r.slides,
      thumbs: r.thumbs,
      problems: r.problems,
    });
    sse.close();
  })().finally(() => settleRequest(req, reservation)).catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});

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
  let file = path.join(DECKS, req.params.slug, "out", path.basename(req.params.file));
  try {
    await stat(file);
  } catch {
    file = path.join(DECKS, req.params.slug, path.basename(req.params.file));
  }
  try {
    await stat(file);
    let title = "";
    try {
      const meta = YAML.parse(await readFile(path.join(DECKS, req.params.slug, "meta.yaml"), "utf8"));
      title = String(meta.title ?? "").trim();
    } catch { /* no meta */ }
    if (!title) {
      try {
        const deck = YAML.parse(await readFile(path.join(DECKS, req.params.slug, "deck.yaml"), "utf8"));
        title = String(deck.title ?? "").trim();
      } catch { /* no deck */ }
    }
    const ext = path.extname(req.params.file);
    const base = path.basename(req.params.file, ext);
    const name = (title || base).replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || base;
    res.setHeader("Content-Disposition", `attachment; filename="${name}${ext}"`);
    res.download(file, `${name}${ext}`);
  } catch {
    res.status(404).end();
  }
}));


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


app.post("/api/decks/:slug/clone", wrap(async (req, res) => {
  const { cloneDeck } = await import("../../src/ai/pipeline.js");
  const r = await cloneDeck({ slug: req.params.slug });
  ok(res, r);
}));


app.post("/api/decks/:slug/bundle", wrap(async (req, res) => {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const dir = path.join(DECKS, req.params.slug);
  const include = ["deck.yaml", "meta.yaml", "plan.yaml", "report.yaml", "script.md", "research", "out"];
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

  let figures = [];
  try {
    const deck = YAML.parse(await readFile(path.join(DECKS, req.params.slug, "deck.yaml"), "utf8")) ?? {};
    figures = deckFigures(deck);
  } catch { /* no deck — a report-only folder has nothing to verify yet */ }
  const imageCredits = (await readCredits(path.join(DECKS, req.params.slug)))
    .map((c) => ({ ...c, citable: isCitable(c) }));

  ok(res, { exists: notes != null, notes, sources, summary: researchSummary(sources, notes), figures, imageCredits });
}));


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
  let identity = {};
  try {
    identity = await loadIdentity(dir);
  } catch { /* identity may be absent on a bare clone */ }
  let rendered = false;
  try { await access(path.join(dir, "out", "report.docx")); rendered = true; } catch { /* not yet */ }
  ok(res, { report, identity, rendered });
}));


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


app.post("/api/decks/:slug/report/render", withRenderSlot(async (req, res) => {
  const reportFile = path.join(DECKS, req.params.slug, "report.yaml");
  let saved = true;
  try { await access(reportFile); } catch { saved = false; }
  if (!saved) {
    return fail(res, 404, "no report.yaml saved for this deck — save report content first");
  }
  const donor = await donorStatus(await donorDirForDeck(path.join(DECKS, req.params.slug)));
  if (!donor.ok) {
    return res.status(503).json({ ok: false, error: reportUnavailable(donor), code: "no_donor" });
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


app.post("/api/decks/:slug/report/preview", withRenderSlot(async (req, res) => {
  const docx = path.join(DECKS, req.params.slug, "out", "report.docx");
  try { await access(docx); } catch {
    return fail(res, 404, "no rendered report — render it first");
  }
  const base = `/api/decks/${req.params.slug}/preview`;
  try {
    const p = await reportPreview(docx);
    ok(res, {
      previewPages: p.pages.map((f) => `${base}/report/${path.basename(f)}`),
      previewThumbs: p.thumbs.map((f) => `${base}/report/thumbs/${path.basename(f)}`),
    });
  } catch (err) {
    fail(res, 500, `report preview failed: ${err.message}`);
  }
}));


app.post("/api/decks/:slug/report/generate", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { depth, model } = req.body ?? {};
  let reservation = null;
  (async () => {
    if (await isAutoRoute(model, req.user.email)) {
      reservation = reserveAutoOrThrow(
        req.user.email, 0,
        estimateTokens({ slides: 8, depth: depth ?? "full" }),
      );
    }
    const r = await generateReport({
      slug: req.params.slug,
      depth,
      model,
      signal: ctrl.signal,
      onProgress: (p) => sse.send("status", p),
    });
    sse.send("result", { sections: r.sections, skipped: r.skipped, depth: r.depth });
    sse.close();
  })().finally(() => settleRequest(req, reservation)).catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});
app.get("/api/types", wrap(async (_req, res) => {
  const schema = await deckSchema();
  const descriptions = await typeDescriptions();
  ok(res, {
    types: schema.definitions.slide.properties.type.enum,
    descriptions,
  });
}));


app.get("/api/types/:theme/specimens", withRenderSlot(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user) return fail(res, 401, "log in to use the deck workspace");
  const themeName = req.params.theme === "default" ? "warm-humanist" : req.params.theme;
  if (!(await listThemes()).includes(themeName)) return fail(res, 404, `unknown theme "${themeName}"`);
  const schema = await deckSchema();
  const types = schema.definitions.slide.properties.type.enum;
  const { specimenDeck } = await import("../../src/specimens.js");
  const deck = await specimenDeck();
  deck.theme = themeName;
  deck.slides.forEach((s) => { delete s.presenter; });

  const cacheDir = path.join(ROOT, "decks", ".specimen-cache", themeName);
  const previewDir = path.join(cacheDir, "preview");
  const expected = deck.slides.length;
  let rendered = false;
  try {
    const existing = await readdir(path.join(previewDir, "thumbs"));
    rendered = existing.length >= expected;
  } catch { /* render below */ }
  if (!rendered) {
    const deckFile = path.join(cacheDir, "specimen.yaml");
    await mkdir(cacheDir, { recursive: true });
    await writeFile(deckFile, YAML.stringify(deck), "utf8");
    const r = await render({ deckFile, themeName });
    await preview(r.outFile, { outDir: previewDir, dpi: 60 });
  }

  ok(res, {
    types,
    previews: buildSpecimenUrls(themeName, types.length),
  });
}));


app.get("/api/specimens/:theme", withRenderSlot(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user) return fail(res, 401, "log in to use the deck workspace");
  const themeName = req.params.theme === "default" ? "warm-humanist" : req.params.theme;
  if (!(await listThemes()).includes(themeName)) return fail(res, 404, `unknown theme "${themeName}"`);
  const { specimenDeck } = await import("../../src/specimens.js");
  const deck = await specimenDeck();
  deck.theme = themeName;
  deck.slides.forEach((s) => { delete s.presenter; });
  const cacheDir = path.join(ROOT, "decks", ".specimen-cache", themeName);
  const previewDir = path.join(cacheDir, "preview");
  const expected = deck.slides.length;
  try {
    const existing = await readdir(path.join(previewDir, "thumbs"));
    if (existing.length >= expected) {
      return ok(res, { previews: buildSpecimenUrls(themeName, expected) });
    }
  } catch { /* need to render */ }

  const deckFile = path.join(cacheDir, "specimen.yaml");
  await mkdir(cacheDir, { recursive: true });
  await writeFile(deckFile, YAML.stringify(deck), "utf8");
  const r = await render({ deckFile, themeName });
  await preview(r.outFile, { outDir: previewDir, dpi: 60 });

  ok(res, { previews: buildSpecimenUrls(themeName, expected) });
}));

function buildSpecimenUrls(themeName, count) {
  const base = `/api/specimens/${encodeURIComponent(themeName)}/`;
  return Array.from({ length: count }, (_, i) => `${base}slide-${String(i + 1).padStart(2, "0")}.png`);
}

app.get("/api/specimens/:theme/:file", wrap(async (req, res) => {
  const themeName = req.params.theme === "default" ? "warm-humanist" : req.params.theme;
  const file = path.join(ROOT, "decks", ".specimen-cache", themeName, "preview", path.basename(req.params.file));
  try {
    await stat(file);
    res.sendFile(file, { dotfiles: "allow" });
  } catch {
    res.status(404).end();
  }
}));


app.post("/api/decks", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { brief, briefing, sources, research, papers, researchSource, upload, theme, maxSlides, model, identity, slidesPerMember, density, imageSupply } = req.body ?? {};
  let reservation = null;
  (async () => {
    if (await isAutoRoute(model, req.user.email)) {
      const upcoming = Number(maxSlides) > 0 ? Number(maxSlides) : 12;
      reservation = reserveAutoOrThrow(req.user.email, 0, estimateTokens({ research: Boolean(research) }));
      settleAuto({ eventId: reservation.eventId, slides: upcoming });
    }
    const r = await createDeck({
      brief, briefing, sources, research, papers, researchSource, upload, theme, maxSlides, model, identity, slidesPerMember, density, imageSupply,
      owner: req.user.email,
      signal: ctrl.signal,
      onProgress: (p) => sse.send("status", p),
    });
    sse.send("plan", { slug: r.slug, plan: r.plan, stats: r.stats });
    sse.close();
  })().finally(() => settleRequest(req, reservation)).catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});
app.get("/api/models", wrap(async (_req, res) => {
  const { models, default: def, cloud, auto, route } = await modelChoices();
  ok(res, { models, default: def, cloud, auto, route, hosted: isHosted() });
}));


app.get("/api/decks/:slug/chat", wrap(async (req, res) => {
  const thread = await loadThread(path.join(DECKS, req.params.slug));
  ok(res, thread);
}));


app.delete("/api/decks/:slug/chat", wrap(async (req, res) => {
  await resetThread(path.join(DECKS, req.params.slug));
  ok(res, {});
}));


app.post("/api/decks/:slug/chat", async (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { instruction, model, slides } = req.body ?? {};
  if (!instruction?.trim()) {
    sse.send("error", { error: "body must include an `instruction`" });
    return sse.close();
  }
  const onlySlides = Array.isArray(slides)
    ? slides.filter((n) => Number.isInteger(n) && n >= 0)
    : null;
  let reservation = null;
  if (await isAutoRoute(model, req.user.email)) {
    try { reservation = reserveAutoOrThrow(req.user.email, 0); } catch (e) {
      sse.send("error", { error: e.message, limits: e.limits }); return sse.close();
    }
  }

  (async () => {
    const r = await runChatTurn({
      slug: req.params.slug,
      instruction,
      model,
      onlySlides,
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
  })().finally(() => settleRequest(req, reservation)).catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});


app.post("/api/reports", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { brief, sources, research, papers, researchSource, upload, depth, density, model, identity } = req.body ?? {};
  if (!brief?.trim()) {
    sse.send("error", { error: "body must include a `brief`" });
    return sse.close();
  }

  let reservation = null;
  (async () => {
    if (await isAutoRoute(model, req.user.email)) {
      reservation = reserveAutoOrThrow(
        req.user.email, 0,
        estimateTokens({ slides: 8, research: true, depth: depth ?? "full" }),
      );
    }
    const r = await createReport({
      brief, sources, research, papers, researchSource, upload, depth, density, model, identity,
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
  })().finally(() => settleRequest(req, reservation)).catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});


app.post("/api/decks/:slug/report/deck", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { theme, model } = req.body ?? {};
  let reservation = null;
  (async () => {
    if (await isAutoRoute(model, req.user.email)) {
      reservation = reserveAutoOrThrow(req.user.email, 0, estimateTokens({}));
    }
    const r = await createDeckFromReport({
      slug: req.params.slug, theme, model,
      signal: ctrl.signal,
      onProgress: (p) => sse.send("status", p),
    });
    sse.send("plan", { slug: r.slug, plan: r.plan, stats: r.stats });
    sse.close();
  })().finally(() => settleRequest(req, reservation)).catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});


const generationRuns = new Map(); // slug -> run record

function generationRunInfo(slug) {
  const run = generationRuns.get(slug);
  return {
    active: Boolean(run && !run.finished),
    status: run?.statusData?.status ?? null,
    runId: run?.runId ?? null,
    kind: run?.kind ?? null,
  };
}


function startDeckRun({ slug, kind, plan, theme, model, reservation = null }) {
  const ctrl = new AbortController();
  const run = {
    slug,
    runId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    plan,
    abort: () => ctrl.abort(),
    statusData: { status: "Queued…" },
    subscribers: new Set(),
    finished: false,
    error: null,
    result: null,
  };
  generationRuns.set(slug, run);

  const broadcast = (event, data) => {
    if (event === "status") run.statusData = data;
    for (const s of run.subscribers) s.send(event, data);
  };
  const meter = newMeter();
  run.meter = meter;

  withMeter(meter, () => (async () => {
    const job = kind === "finalize"
      ? () => finalizeDeck({ slug, theme, model, signal: ctrl.signal, onProgress: (p) => broadcast("status", p) })
      : kind === "resume"
        ? () => resumeGeneration({ slug, theme, model, signal: ctrl.signal, onProgress: (p) => broadcast("status", p) })
        : () => generateFromPlan({ slug, plan, theme, model, signal: ctrl.signal, onProgress: (p) => broadcast("status", p) });
    const r = await job();
    const base = `/api/decks/${slug}/preview`;
    run.result = {
      slug,
      slides: (r.slides ?? []).map((f) => `${base}/${f}`),
      thumbs: (r.thumbs ?? []).map((f) => `${base}/thumbs/${f}`),
      problems: r.problems,
      skipped: r.skipped,
      stats: r.stats,
    };
    run.finished = true;
    broadcast("result", run.result);
  })().catch((err) => {
    if (ctrl.signal.aborted) {
      run.error = "Stopped — the deck's progress is preserved; resume from where it left off.";
    } else {
      run.error = err.message;
    }
    run.finished = true;
    broadcast("error", { error: run.error });
  }).finally(() => {
    if (reservation?.eventId) {
      try {
        settleAuto({ eventId: reservation.eventId, tokens: meterTotal(meter) });
      } catch { /* metering must never break a run's teardown */ }
    }
    for (const s of run.subscribers) s.close();
    run.subscribers.clear();
    setTimeout(() => {
      if (generationRuns.get(slug) === run) generationRuns.delete(slug);
    }, 5 * 60 * 1000);
  }));

  return run;
}


function attachToRun(res, run) {
  const sse = startSSE(res);
  const sub = { send: sse.send, close: sse.close };
  run.subscribers.add(sub);
  sse.done.catch(() => run.subscribers.delete(sub));
  if (run.finished) {
    if (run.error) sse.send("error", { error: run.error });
    else sse.send("result", run.result);
    sse.close();
  } else if (run.statusData) {
    sse.send("status", run.statusData);
  }
  return sse;
}


app.post("/api/decks/:slug/generate", async (req, res) => {
  const { plan, theme, model, resume } = req.body ?? {};

  const live = generationRuns.get(req.params.slug);
  if (live && !live.finished) {
    attachToRun(res, live);
    return;
  }
  if (!resume && (!plan || !Array.isArray(plan.slides) || !plan.slides.length)) {
    const sse = startSSE(res);
    sse.send("error", { error: "body must include an approved `plan` with slides" });
    return sse.close();
  }
  let reservation = null;
  if (await isAutoRoute(model, req.user.email)) {
    const slides = plan?.slides?.length ?? 0;
    try {
      reservation = reserveAutoOrThrow(req.user.email, slides, estimateTokens({ slides }));
    } catch (e) {
      const sse = startSSE(res);
      sse.send("error", { error: e.message, limits: e.limits });
      return sse.close();
    }
  }
  startDeckRun({
    slug: req.params.slug,
    kind: resume ? "resume" : "generate",
    plan,
    theme,
    model,
    reservation,
  });
  attachToRun(res, generationRuns.get(req.params.slug));
});


app.post("/api/decks/:slug/generate/resume", async (req, res) => {
  const live = generationRuns.get(req.params.slug);
  if (live && !live.finished) {
    attachToRun(res, live);
    return;
  }
  const { theme, model } = req.body ?? {};
  let reservation = null;
  if (await isAutoRoute(model, req.user.email)) {
    try {
      reservation = reserveAutoOrThrow(req.user.email, 0, estimateTokens({ slides: 8 }));
    } catch (e) {
      const sse = startSSE(res);
      sse.send("error", { error: e.message, limits: e.limits });
      return sse.close();
    }
  }
  startDeckRun({ slug: req.params.slug, kind: "resume", plan: null, theme, model, reservation });
  attachToRun(res, generationRuns.get(req.params.slug));
});


app.post("/api/decks/:slug/finalize", async (req, res) => {
  const live = generationRuns.get(req.params.slug);
  if (live && !live.finished) {
    attachToRun(res, live);
    return;
  }
  const { theme, model } = req.body ?? {};
  let reservation = null;
  if (await isAutoRoute(model, req.user.email)) {
    try {
      reservation = reserveAutoOrThrow(req.user.email, 0, estimateTokens({ slides: 6 }));
    } catch (e) {
      const sse = startSSE(res);
      sse.send("error", { error: e.message, limits: e.limits });
      return sse.close();
    }
  }
  startDeckRun({ slug: req.params.slug, kind: "finalize", plan: null, theme, model, reservation });
  attachToRun(res, generationRuns.get(req.params.slug));
});


app.post("/api/decks/:slug/generate/stop", wrap(async (req, res) => {
  const run = generationRuns.get(req.params.slug);
  if (run && !run.finished) run.abort();
  ok(res, { stopped: Boolean(run && !run.finished) });
}));

registerWorkspaceSettingsRoutes(app, { sniffImage });

registerAuthRoutes(app);

registerAccountRoutes(app);

await configureLifecycle(app);
export const server = app.listen(PORT);
server.once("listening", () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : PORT;
  console.log(`  api   http://localhost:${port}`);
  reportBootGaps().catch(() => { /* a warning that cannot be computed is not worth failing over */ });
});
server.once("error", (err) => {
  console.error(`  api could not listen on ${PORT}: ${err.message}`);
  process.exitCode = 1;
});
