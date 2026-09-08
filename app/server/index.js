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
import { registerArtifactRoutes, sniffImage } from "./artifact-routes.js";
import { generationRunInfo, registerGenerationRoutes } from "./generation-routes.js";



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


registerArtifactRoutes(app, { withRenderSlot, startSSE, isAutoRoute, reserveAutoOrThrow, settleRequest });

registerGenerationRoutes(app, { withRenderSlot, startSSE, isAutoRoute, reserveAutoOrThrow, settleRequest });

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
