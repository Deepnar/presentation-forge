import express from "express";
import cors from "cors";
import { readFile, writeFile, readdir, mkdir, stat, access, rm } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { ROOT, DECKS, THEMES, CONFIG, BRAND, REFERENCE } from "../../src/paths.js";
import { loadTheme, listThemes, loadStyle, listStyles } from "../../src/theme.js";
import { validateDeck } from "../../src/validate.js";
import { render } from "../../src/render.js";
import { placeholderSlides } from "../../src/placeholders.js";
import { preview, reportPreview } from "../../src/preview.js";
import { renderReport, validateReport, donorStatus } from "../../src/report.js";
import { loadIdentity, loadUserIdentity, saveUserIdentity, loadBaseIdentity, deepMerge } from "../../src/ai/identity.js";
import { runAsAccount } from "../../src/account.js";
import { userBrandDirs } from "../../src/tenant.js";
import { deckSchema, typeDescriptions } from "../../src/ai/catalog.js";
import { createDeck, generateFromPlan, resumeGeneration, finalizeDeck, createReport, createDeckFromReport, sweepDensity, convertSlideType, generationStatus, reportUnavailable } from "../../src/ai/pipeline.js";
import { generateScript } from "../../src/ai/script.js";
import { ingestUpload, stageUpload, sweepStagedUploads, UPLOAD_MAX_BYTES, UPLOAD_EXT } from "../../src/ai/upload.js";
import { generateReport } from "../../src/ai/report.js";
import { researchSummary } from "../../src/ai/research.js";
import { deckFigures } from "../../src/ai/grounding.js";
import { runChatTurn, loadThread, resetThread } from "../../src/ai/chat.js";
import { modelChoices, roleAudit } from "../../src/ai/ollama.js";
import { cloudStatus, setApiKey, clearApiKey, cloudKeyName, testCloudConnection, testAutoConnection, autoStatus, autoHealth, setUserApiKey, clearUserApiKey, getUserApiKey, setRoutingPreference, routingPreference, autoProvider, isHosted, setHosted } from "../../src/cloud.js";
import { register, authenticate, startSession, endSession, userForToken, bearerToken, publicUser, seedAdmin, promoteToAdmin, isAdmin, canAccessDeck, verifyGoogleIdToken, findOrCreateGoogleUser, getUserId, listUsers, setUserRole, deleteUserAccount, cookieToken, sessionCookie, clearedSessionCookie, verificationRequired, verifiedRequestOnly, issueAuthToken, consumeAuthToken, pruneAuthTokens, markVerified, resetPassword, accountVerificationState, RESET_TTL_MINUTES, VERIFY_TTL_HOURS } from "../../src/auth.js";
import { sendMail, mailConfigured, resetMail, verifyMail } from "../../src/mail.js";
import { listPresets, savePreset, updatePreset, deletePreset } from "../../src/presets.js";
import { normalizeBrand } from "../../tools/prep-brand.mjs";
import { getUsage, checkAutoLimits, recordAutoEvent, limitConfig } from "../../src/limits.js";

/**
 * Thin HTTP wrapper over the existing pipeline modules. Deliberately holds no
 * logic of its own — everything here also has to work from the CLI, so the
 * server must stay a transport, not a second implementation.
 */

const app = express();

// Secure headers — the light hardening for a public-facing box. Without
// helmet's dependency weight: a strict default that blocks framing/MIME-sniff
// and ref leaks, and the API itself never sets cookies.
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// CORS restricted to the UI origin. In dev the Vite server proxies /api so the
// browser is same-origin and this never matters; when the built UI is served
// from the API itself it is same-origin too. The allow-list only matters if
// someone serves the UI from elsewhere, and then it is the ONLY origin allowed.
// With no origin configured we allow localhost/5173 origins for dev so a
// direct :5174 fetch from the Vite shell does not look like a CORS failure
// (which surfaced as "dark blue" blank chat because api.me() treated the
// cors-blocked user as guest).
const UI_ORIGIN = (process.env.FORGE_UI_ORIGIN ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (UI_ORIGIN.length) {
  app.use(cors({ origin: UI_ORIGIN }));
} else {
  app.use(cors({ origin: true }));
}

// When a reverse proxy fronts the box (the documented deployment), req.ip is
// the proxy and the rate limiter would treat every visitor as one IP. Only
// honour X-Forwarded-For when the operator has explicitly opted in — the
// default stays conservative.
if (process.env.FORGE_TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

app.use(express.json({ limit: "8mb" }));

/**
 * Make the caller ambient for the whole request. The model client resolves BYOK
 * keys and the Auto/Cloud route per account, and it sits far below the route
 * handlers — an async-local account is how it finds out who is asking without
 * every intermediate signature growing a user parameter. Anonymous requests run
 * with no account and see the install-wide configuration, as the CLI does.
 */
app.use(async (req, _res, next) => {
  let account = null;
  try {
    const user = await resolveUser(req, { allowCookie: true });
    if (user) account = { email: user.email, userId: getUserId(user.email) };
  } catch { /* an unreadable token is simply an anonymous request */ }
  if (!account) return next();
  runAsAccount(account, () => next());
});

// Deliberately NOT `PORT` — dev harnesses inject that for the frontend, and the
// API silently stealing Vite's port produces a very confusing "Cannot GET /".
const PORT = process.env.FORGE_API_PORT || 5174;
const ok = (res, data) => res.json({ ok: true, ...data });
const fail = (res, code, message) => res.status(code).json({ ok: false, error: message });

/** Auto-tier guard: only the shared TCET gateway is rate-limited;
 *  local fallback (Ollama) is unlimited. */
async function isAutoRoute(model, userEmail = null) {
  const ap = await autoProvider();
  const isTcet = ap?.kind === "tcet" && ap?.keySet;
  if (!isTcet) return false;
  if (model && ap.models?.includes(String(model))) return true;
  if (model) return false;
  const route = await routingPreference(userEmail ? getUserId(userEmail) : null);
  return route === "auto";
}
async function enforceAuto(userEmail, upcomingSlides = 0) {
  const uid = getUserId(userEmail);
  if (!uid) return { allowed: true };
  const chk = checkAutoLimits({ userId: uid, upcomingSlides });
  if (!chk.allowed) {
    const msg = chk.errors.join(" · ");
    const e = new Error(msg);
    e.status = 429;
    throw e;
  }
  return chk;
}
function recordAutoFor(userEmail, slides = 0, tokens = 0) {
  try {
    const uid = getUserId(userEmail);
    if (!uid) return;
    recordAutoEvent({ userId: uid, eventType: "request", slides, tokens });
  } catch {}
}

/**
 * Renderer mutex. A home box has one CPU and LibreOffice/Chrome are single-file
 * processes; two concurrent renders would fight over it and both crawl. Renders
 * behind this queue run one at a time; anything beyond a small wait gets a 429
 * instead of stacking up memory.
 */
const RENDER_MAX_WAIT = 3 * 60 * 1000;
const RENDER_MAX_QUEUE = 2;

/**
 * Serialise renders. A home box has one CPU and LibreOffice/Chrome are
 * single-file processes; two concurrent renders would fight over it and both
 * crawl. This is a promise-chain mutex: each caller waits for the previous
 * slot, and releases its own when the render finishes. A caller that would
 * wait longer than RENDER_MAX_WAIT (or sit behind a queue already that deep)
 * gets a 429 instead of stacking up memory behind a runaway render.
 */
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
  // Exactly one decrement per acquisition, whichever path gets there first.
  // Decrementing in both the timeout and the continuation drove the counter
  // negative, and a negative counter can never reach RENDER_MAX_QUEUE — the
  // backpressure this mutex exists for silently stopped applying after the
  // first render that waited out the timeout.
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

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => fail(res, 500, err.message));

/**
 * Auth-first workspace. Everything under /api/decks, /api/reports, /api/presets
 * and /api/briefing needs a session, so an unauthenticated browser sees a login
 * screen and can never reach the deck store.
 *
 * There are no unauthenticated paths here. Rasters, downloads and uploaded
 * assets authenticate by session cookie rather than bearer header, because that
 * is the only credential an <img> tag can carry — not because they are public.
 * The slug format guard runs first regardless, so nothing can use a media path
 * to reach somewhere that was never meant to be reachable.
 */
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,99}$/;

/**
 * Resolve the caller. Media requests come from `<img src>` and `<a download>`,
 * which cannot set an Authorization header, so those carry the session as an
 * httpOnly cookie instead. Everything else reads the bearer header only — a
 * cookie must never authorise a state-changing request, or widening the
 * credential would widen CSRF exposure with it.
 */
async function resolveUser(req, { allowCookie = false } = {}) {
  const token = bearerToken(req.headers.authorization)
    ?? (allowCookie ? cookieToken(req.headers.cookie) : null);
  return userForToken(token);
}

const MEDIA_PATH = /^\/([^/]+)\/(preview|download|assets)\//;

const deckWorkspace = async (req, res, next) => {
  // Media paths authenticate by cookie as well as bearer, but they DO
  // authenticate. They used to be exempt outright, on the theory that a slug is
  // undiscoverable — but a slug is slugify(title), so "guess the title" was
  // enough to download any account's deck. The ownership check still runs in
  // the per-slug layer below.
  const media = req.path.match(MEDIA_PATH);
  if (media && !SLUG_RE.test(media[1])) return fail(res, 404, "no such deck");
  const user = await resolveUser(req, { allowCookie: Boolean(media) });
  if (!user) return fail(res, 401, "log in to use the deck workspace");
  if (!user.verified && verificationRequired() && verifiedRequestOnly({ method: req.method, path: req.path })) {
    // A distinct code, not a bare 403: the UI turns this one into "check your
    // inbox, resend" rather than the generic refusal it shows for everything
    // else, and a stranger's first blocked click has to explain itself.
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

/**
 * Full-text content search across deck.yaml files — the deck list's client-side
 * title filter stops being enough once the count grows past a screen.
 *
 * THIS ROUTE MUST STAY ABOVE the per-slug middleware below, which is why it is
 * here rather than with the other deck routes. Express matches a path-carrying
 * `app.use` before any route registered later, so registered further down this
 * file it arrived at the ownership gate as a deck named "search", found no
 * decks/search/meta.yaml, and was refused with "no such deck" — for everyone
 * except admins, who pass the ownership check and so never saw it. Any future
 * literal segment under /api/decks/ has the same collision and belongs here
 * too. Fixing it the other way, by teaching the gate a list of words that are
 * not slugs, is worse: a word added to that list without a matching route
 * exempts a whole subtree from ownership, and this failure at least fails
 * closed.
 *
 * It still sits below the workspace gate above, so it has a session and a
 * req.user to scope results with.
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
      if (!canAccessDeck(req.user, owner)) continue;
      const text = await readFile(path.join(DECKS, e.name, "deck.yaml"), "utf8");
      if (text.toLowerCase().includes(q)) hits.push(e.name);
    } catch { /* no deck.yaml */ }
  }
  ok(res, { hits });
}));

/**
 * Per-slug ownership. An owned deck belongs to exactly one account; a folder
 * whose meta.yaml has no owner is a legacy deck (or a headless CLI run) and is
 * the operator's — visible to every logged-in user would leak one account's
 * CLI work to all the others. The error is "no such deck", not "not yours",
 * so a stranger cannot even learn a slug exists. Same preview/download
 * exemption as the gate above.
 */
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
  // Ownership applies to rasters and downloads exactly as it does to the deck
  // itself: they are the deck's content in another format. The middleware above
  // has already accepted the session cookie for those paths, so an <img> tag
  // still loads — for the deck's own owner.
  if (!SLUG_RE.test(req.params.slug)) return fail(res, 404, "no such deck");
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
      plate: t.plate?.enabled === true,
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

/* ----------------------------------------------------------------- landing */

/**
 * The landing page's imagery: real slide renders, produced by tools/landing.mjs
 * and committed under app/gallery/landing.
 *
 * Deliberately unauthenticated — this is the front door, seen before anyone has
 * an account, and the files are derived from committed themes and a committed
 * deck with branding off, so they carry nothing local. The filename guard is
 * what keeps the path from reaching anywhere else.
 */
const LANDING_DIR = path.join(ROOT, "app", "gallery", "landing");
const LANDING_FILE = /^[a-z0-9][a-z0-9._-]{0,99}\.(webp|json)$/;

app.get("/api/landing/:file", wrap(async (req, res) => {
  if (!LANDING_FILE.test(req.params.file)) return res.status(404).end();
  const file = path.join(LANDING_DIR, req.params.file);
  try {
    await stat(file);
    // Immutable in practice: a regenerated cast changes the manifest, and the
    // page asks for the manifest without a cache directive.
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
  // What else this project holds. The project navigation shows all four
  // artefacts whether or not they exist, so it needs to know which are real
  // in one call rather than probing four endpoints per page.
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
      // Per-user workspace: only your decks (and, for the operator, the
      // ownerless legacy/CLI decks nobody else should see).
      if (!canAccessDeck(req.user, entry.owner)) continue;
      decks.push(entry);
    } catch { /* folder without a valid deck.yaml — skip */ }
  }
  decks.sort((a, b) => b.updated - a.updated);
  ok(res, { decks });
}));

/**
 * What this project holds — title, theme, and which of the four artefacts
 * exist. Deliberately separate from GET /api/decks/:slug, which opens deck.yaml
 * unconditionally and therefore throws for a report-first project that has no
 * deck yet. The project navigation is shown on every one of those pages, so it
 * needs an answer that does not depend on the deck being the thing that exists.
 */
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

  // Placeholder slides — the render gate blocks them and the UI must show a
  // badge + regenerate affordance, so the deck payload carries them explicitly.
  // Render-dirty: deck.yaml newer than the rendered deck.pptx means the slides
  // on screen are stale (or there is no render yet). The UI greys Render with
  // "Up to date" when clean; theme/style/mode changes are tracked client-side
  // because they never touch deck.yaml's mtime.
  let dirty = true;
  try {
    const deckStat = await stat(path.join(dir, "deck.yaml"));
    const outStat = await stat(path.join(dir, "out", "deck.pptx"));
    dirty = deckStat.mtimeMs > outStat.mtimeMs;
  } catch { /* no render yet — render needed */ }

  // Generation run state: the live in-memory registry folded over the durable
  // checkpoint, so a reload can tell "a run is in flight", "the deck is N/M
  // written — resume it" and "the deck is complete but was never finalised"
  // apart, instead of offering only a fresh run.
  const onDisk = await generationStatus(req.params.slug);
  const live = generationRunInfo(req.params.slug);
  ok(res, {
    deck, meta, slides, thumbs, placeholders: placeholderSlides(deck), dirty,
    run: {
      ...onDisk,
      ...live,
      // "complete" means every plan slide is written (finalize is all that is
      // left); "resumable" means a partial deck sits on disk to continue.
      resumable: onDisk.partial,
      needsFinalize: onDisk.complete && live.active === false,
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

/**
 * Run the sweep on demand (dry run by default) — the same deletion policy the
 * scheduler runs on its own, exposed so an owner can preview it from the UI
 * before it fires. Operator-only: it can delete the ownerless legacy decks
 * that regular accounts cannot even see, so a non-admin must not be able to
 * fire it.
 */
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

/* --------------------------------------------------------------- admin — RBAC + analytics */
const requireAdmin = async (req, res, next) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user) return fail(res, 401, "log in");
  if (!isAdmin(user)) return fail(res, 403, "admin only");
  req.user = user;
  next();
};

// Hosted toggle — admin flips hosted/local at runtime (persists to config/hosted.json)
app.get("/api/admin/hosted", wrap(async (_req, res) => {
  const user = await userForToken(bearerToken(_req.headers.authorization));
  if (!user || !isAdmin(user)) return fail(res, 403, "admin only");
  ok(res, { hosted: isHosted() });
}));
app.post("/api/admin/hosted", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user || !isAdmin(user)) return fail(res, 403, "admin only");
  const hosted = Boolean(req.body?.hosted);
  await setHosted(hosted);
  ok(res, { hosted: isHosted() });
}));

// Users — RBAC management
app.get("/api/admin/users", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user || !isAdmin(user)) return fail(res, 403, "admin only");
  const users = await listUsers();
  ok(res, { users });
}));
app.post("/api/admin/users/:email/role", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user || !isAdmin(user)) return fail(res, 403, "admin only");
  const role = req.body?.role === "admin" ? "admin" : null;
  // never demote self via this endpoint without explicit confirm? allow but guard last admin in setUserRole
  await setUserRole(req.params.email, role);
  ok(res, {});
}));
app.delete("/api/admin/users/:email", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user || !isAdmin(user)) return fail(res, 403, "admin only");
  if (String(req.params.email).toLowerCase() === String(user.email).toLowerCase()) {
    return fail(res, 400, "cannot delete your own account");
  }
  await deleteUserAccount(req.params.email);
  ok(res, {});
}));

// Decks — admin sees all, not just own
app.get("/api/admin/decks", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user || !isAdmin(user)) return fail(res, 403, "admin only");
  let entries = [];
  try { entries = await readdir(DECKS, { withFileTypes: true }); } catch { return ok(res, { decks: [] }); }
  const decks = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try { decks.push(await deckMeta(e.name)); } catch {}
  }
  decks.sort((a, b) => b.updated - a.updated);
  // enrich with disk size
  for (const d of decks) {
    try {
      const outStat = await stat(path.join(DECKS, d.slug, "out", "deck.pptx"));
      d.size = outStat.size;
    } catch { d.size = 0; }
  }
  ok(res, { decks });
}));

// Stats — overview for graphs
app.get("/api/admin/stats", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user || !isAdmin(user)) return fail(res, 403, "admin only");
  // users
  const users = await listUsers();
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const usersWeek = users.filter((u) => Date.parse(u.createdAt) > weekAgo).length;
  // decks
  let entries = [];
  try { entries = await readdir(DECKS, { withFileTypes: true }); } catch {}
  let totalDecks = 0, totalSlides = 0, totalReports = 0, totalSize = 0;
  const byTheme = {};
  const byOwner = {};
  const recent = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      const m = await deckMeta(e.name);
      totalDecks++;
      totalSlides += m.slides ?? 0;
      if (m.report) totalReports++;
      byTheme[m.theme ?? "none"] = (byTheme[m.theme ?? "none"] ?? 0) + 1;
      byOwner[m.owner ?? "legacy"] = (byOwner[m.owner ?? "legacy"] ?? 0) + 1;
      recent.push(m);
      try { const s = await stat(path.join(DECKS, e.name, "out", "deck.pptx")); totalSize += s.size; } catch {}
    } catch {}
  }
  recent.sort((a, b) => b.updated - a.updated);
  // model usage — aggregate auto_events
  let usageAgg = { totalRequests: 0, totalSlides: 0, totalTokens: 0, byUser: [] };
  let limits = limitConfig();
  try {
    const { getDb } = await import("../../src/db.js");
    const db = getDb();
    const rows = db.prepare("SELECT user_id, COUNT(*) as reqs, COALESCE(SUM(slides),0) as slides, COALESCE(SUM(tokens),0) as tokens FROM auto_events GROUP BY user_id ORDER BY reqs DESC LIMIT 10").all();
    // map user_id -> email
    const userById = new Map();
    for (const u of users) {
      const id = getUserId(u.email);
      if (id) userById.set(id, u.email);
    }
    usageAgg.byUser = rows.map((r) => ({ email: userById.get(r.user_id) ?? `id:${r.user_id}`, requests: r.reqs, slides: r.slides, tokens: r.tokens }));
    const tot = db.prepare("SELECT COUNT(*) as reqs, COALESCE(SUM(slides),0) as slides, COALESCE(SUM(tokens),0) as tokens FROM auto_events").get();
    usageAgg.totalRequests = tot.reqs ?? 0;
    usageAgg.totalSlides = tot.slides ?? 0;
    usageAgg.totalTokens = tot.tokens ?? 0;
  } catch {}
  // system
  let ollamaOk = false, searxngOk = false;
  try { const r = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(2000) }); ollamaOk = r.ok; } catch {}
  try { const searx = process.env.SEARXNG_URL || "http://localhost:8888"; const r = await fetch(`${searx}/healthz`, { signal: AbortSignal.timeout(2000) }); searxngOk = r.ok; } catch {}
  // disk
  let diskFree = null;
  try {
    const { execSync } = await import("node:child_process");
    const out = execSync("df -h / 2>/dev/null | tail -1 || df -h . 2>/dev/null | tail -1", { encoding: "utf8" });
    diskFree = out.trim();
  } catch {}
  ok(res, {
    hosted: isHosted(),
    users: { total: users.length, admins: users.filter((u) => u.admin).length, week: usersWeek, list: users.slice(0, 5) },
    decks: { total: totalDecks, reports: totalReports, slides: totalSlides, size: totalSize, byTheme, byOwner, recent: recent.slice(0, 10) },
    usage: usageAgg,
    limits,
    system: {
      ollamaOk, searxngOk, diskFree, uptime: process.uptime(), node: process.version,
      // The REAL question, not "is a key configured". A gateway that cannot
      // generate used to show green here because a key was present, which is
      // the same healthy-looking box the donor and SMTP rows were hiding.
      auto: await autoHealth(),
      // Half the product 500s without these two, and neither is visible from
      // any screen that works. They belong where the operator already looks.
      donor: await donorStatus(),
      mailOk: mailConfigured(),
      // Which roles are running what they were configured to run. A silent
      // substitution has exactly one symptom — output that is worse than it
      // should be — so it belongs where the operator already looks.
      roles: await roleAudit(),
    },
  });
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

// Raster formats only. SVG is deliberately absent: an uploaded SVG can carry
// a <script> and, served from the app's origin, would execute in the session's
// context — the token lives in localStorage, so that is the app's one real XSS
// surface. Rasters cannot carry executable content, and each is verified below
// by its magic bytes before it is stored.
const DECK_IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif"]);
const DECK_IMAGE_MAX = 15 * 1024 * 1024; // 15 MB — a slide image, not a photo library

/**
 * Verify the leading bytes match the claimed extension. Express has already
 * limited the body size, so the buffer is small; a format mismatch is a
 * smuggled payload (HTML named .png), not a slow-loris concern.
 */
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
      // ISO-BMFF: 'ftyp' box with 'avif'/'avis' brand.
      return h.length >= 12 && h[4] === 0x66 && h[5] === 0x74 && h[6] === 0x79 && h[7] === 0x70
        && h[8] === 0x61 && h[9] === 0x76 && h[10] === 0x69;
    case "tiff":
      return (h.length >= 4 && h[0] === 0x49 && h[1] === 0x49 && h[2] === 0x2a && h[3] === 0x00)
        || (h.length >= 4 && h[0] === 0x4d && h[1] === 0x4d && h[2] === 0x00 && h[3] === 0x2a);
    default:
      return false;
  }
}

/**
 * Upload a slide image for a deck. Lands in decks/<slug>/assets/ (gitignored)
 * so a slide's image field can reference it as `assets/<file>` and the render
 * resolves it relative to the deck folder. Extension, magic bytes and size are
 * validated — the same trust boundary as the brand uploads.
 */
/**
 * Raw-body uploads are parsed by a middleware whose limit error must reach the
 * caller as JSON. body-parser invokes the next function with the error when a
 * body exceeds the declared limit; the call sites below pass their own
 * continuation, so that error used to fall into the handler as a no-op and an
 * oversized file came back as a misleading 200. Each continuation now checks
 * for the parser error first.
 */
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

/**
 * Serve a deck's uploaded image (same open-exemption as preview rasters).
 * A `sandbox` CSP on the response keeps any file that slips past the magic-byte
 * check inert — no scripts, no same-origin access — even though the extension
 * is now a strict raster allowlist.
 */
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

/**
 * Stage a briefing document for upload-only research mode. The file is
 * converted here (so the browser never sees the bytes back) and staged under a
 * token the briefing holds; the plan resolves the token into research/notes.md
 * when the deck's slug exists. Same trust boundary as the brand uploads:
 * extension allowlist + magic-byte sniff + size cap.
 */
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

/** Stale staged briefing documents (abandoned uploads) are dead weight — drop
 *  them at boot so a long-lived box does not accumulate them forever. */
sweepStagedUploads().catch(() => {});

app.post("/api/decks/:slug/render", withRenderSlot(async (req, res) => {
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

  let r;
  try {
    r = await render({ deckFile, themeName, style, mode });
  } catch (err) {
    // The placeholder render gate refuses placeholder content loudly — return
    // the block as a 422 the UI can surface, not a generic 500.
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

/**
 * The deck's speaker script — what each presenter says aloud per slide. One
 * scoped model call per slide, streamed as progress like the sweep; an
 * `index` body field regenerates only that slide's words (the "regen this
 * slide" affordance). Writes decks/<slug>/script.md.
 */
app.post("/api/decks/:slug/script", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { index, model } = req.body ?? {};
  (async () => {
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
  })().catch((err) => {
    if (ctrl.signal.aborted) return;
    sse.send("error", { error: err.message });
    sse.close();
  });
});

/** The deck's script as the panel needs it: per-slide blocks parsed from
 *  script.md so the UI renders one card per slide with its own regenerate
 *  affordance, plus the deck title for the header. A slide without a block
 *  is reported `written: false`, never dropped. */
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

/** The report preview rasters — out/report-preview/page-N.png. */
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

/**
 * The type swap: change one slide's type, preserving section and presenter.
 * Compatible types remap locally; the rest get a scoped model rewrite. Same
 * SSE transport as generation so a slow cloud rewrite streams progress.
 */
app.post("/api/decks/:slug/slides/:index/convert", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { type, model } = req.body ?? {};
  if (!type) {
    sse.send("error", { error: "body must include a target `type`" });
    return sse.close();
  }

  (async () => {
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
  })().catch((err) => {
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
  // Rendered artefacts (deck.pptx, report.docx) live in out/; generated
  // content like script.md lives at the deck root. Try out/ first, then the
  // deck folder, so the same title-naming download route serves both.
  let file = path.join(DECKS, req.params.slug, "out", path.basename(req.params.file));
  try {
    await stat(file);
  } catch {
    file = path.join(DECKS, req.params.slug, path.basename(req.params.file));
  }
  try {
    await stat(file);
    // The saved file is deck.pptx / report.docx; the user should get the
    // deck's title instead. meta.yaml may carry it; the deck's own title
    // (deck.yaml) is the fallback — else the file name.
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

/* ---------------------------------------------------------------- reports */

/** The deck's research artefact — what the model is drawing from. The panel's
 *  whole point is that the user must be able to see and correct it. No research
 *  dir is not an error: it is the "research this deck" hint. `figures` carries
 *  the number-bearing claims the deck's data slides make, so the research view
 *  can list every chart/journey/stat figure for a human to cross-check against
 *  the sources. */
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

  ok(res, { exists: notes != null, notes, sources, summary: researchSummary(sources, notes), figures });
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
  // The rendered .docx is server state, not component state — probing it here
  // is what lets the report view show a Download link on reopen without
  // re-rendering. A stale render (report.yaml changed since) is the user's
  // call; we only report that a file exists.
  let rendered = false;
  try { await access(path.join(dir, "out", "report.docx")); rendered = true; } catch { /* not yet */ }
  ok(res, { report, identity, rendered });
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
app.post("/api/decks/:slug/report/render", withRenderSlot(async (req, res) => {
  const reportFile = path.join(DECKS, req.params.slug, "report.yaml");
  let saved = true;
  try { await access(reportFile); } catch { saved = false; }
  if (!saved) {
    return fail(res, 404, "no report.yaml saved for this deck — save report content first");
  }
  // A missing donor is a server that is not fully installed, not a broken
  // request. It used to surface as a 500 from the renderer, which reads as "the
  // app is broken" to the one person who could actually fix it.
  const donor = await donorStatus();
  if (!donor.ok) {
    return res.status(503).json({ ok: false, error: reportUnavailable(donor), code: "no_donor" });
  }
  const toc = req.body?.toc !== false;
  const r = await renderReport({ reportFile, toc });

  // Answers the moment the .docx exists. Rasterising it costs a SECOND
  // LibreOffice start — measured at 8s on top of the 7s that produced the
  // document — and the page images are for looking at, not for having. The
  // UI downloads the file here and asks for the pictures separately, so the
  // deliverable arrives in half the time it used to.
  ok(res, {
    sections: r.sections,
    pages: r.pages,
    problems: r.problems,
    docx: `/api/decks/${req.params.slug}/download/report.docx`,
  });
}));

/**
 * The report as it opens in Word, one PNG per page. Split out of the render
 * above: it is a second LibreOffice pass over the document the render just
 * produced, and nobody should wait for a picture of a file they already have.
 */
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

/**
 * Specimen previews for every type in the given theme, in enum order. Renders
 * ~75 slides the first time per theme, so it is gated — a stranger must not be
 * able to trigger a LibreOffice+Chrome render loop on the box — and the theme
 * is validated against the known list before anything renders.
 */
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

/**
 * The type-swap gallery: render one specimen slide per type in a given theme
 * and return a per-type preview URL. The specimens are assembled once from the
 * committed demo decks (src/specimens.js), rendered into a gitignored
 * cache dir keyed by theme, and the PNGs are served back — so the gallery
 * shows every type AS IT RENDERS in the current theme, never a stub.
 */
app.get("/api/specimens/:theme", withRenderSlot(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user) return fail(res, 401, "log in to use the deck workspace");
  const themeName = req.params.theme === "default" ? "warm-humanist" : req.params.theme;
  if (!(await listThemes()).includes(themeName)) return fail(res, 404, `unknown theme "${themeName}"`);
  const { specimenDeck } = await import("../../src/specimens.js");
  const deck = await specimenDeck();
  deck.theme = themeName;
  deck.slides.forEach((s) => { delete s.presenter; });

  // Renders land in a gitignored cache: <root>/decks/.specimen-cache/<theme>/.
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
    // res.sendFile's default dotfiles policy ignores files under a dot directory
    // like .specimen-cache; the cache is a legitimate generated artefact, so
    // serve it explicitly.
    res.sendFile(file, { dotfiles: "allow" });
  } catch {
    res.status(404).end();
  }
}));

/** Brief → outline. Long-running; streams research/planning progress as SSE. */
app.post("/api/decks", (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { brief, briefing, sources, research, papers, researchSource, upload, theme, maxSlides, model, identity, slidesPerMember, density } = req.body ?? {};
  (async () => {
    if (await isAutoRoute(model, req.user.email)) {
      const upcoming = Number(maxSlides) > 0 ? Number(maxSlides) : 12;
      await enforceAuto(req.user.email, upcoming);
      recordAutoFor(req.user.email, upcoming, 0);
    }
    const r = await createDeck({
      brief, briefing, sources, research, papers, researchSource, upload, theme, maxSlides, model, identity, slidesPerMember, density,
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
  const { models, default: def, cloud, auto, route } = await modelChoices();
  ok(res, { models, default: def, cloud, auto, route, hosted: isHosted() });
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
app.post("/api/decks/:slug/chat", async (req, res) => {
  const sse = startSSE(res);
  const ctrl = new AbortController();
  sse.done.catch(() => ctrl.abort());

  const { instruction, model } = req.body ?? {};
  if (!instruction?.trim()) {
    sse.send("error", { error: "body must include an `instruction`" });
    return sse.close();
  }
  if (await isAutoRoute(model, req.user.email)) {
    try { await enforceAuto(req.user.email, 0); recordAutoFor(req.user.email, 0, 0); } catch (e) {
      sse.send("error", { error: e.message }); return sse.close();
    }
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

  const { brief, sources, research, papers, researchSource, upload, depth, density, model, identity } = req.body ?? {};
  if (!brief?.trim()) {
    sse.send("error", { error: "body must include a `brief`" });
    return sse.close();
  }

  (async () => {
    if (await isAutoRoute(model, req.user.email)) {
      await enforceAuto(req.user.email, 0);
      recordAutoFor(req.user.email, 0, 0);
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

/**
 * Live generation runs, keyed by slug. A run lives OUTSIDE the SSE response:
 * dropping the socket no longer aborts the pipeline (that was the "refresh
 * restarted from slide 1" bug — the abort-on-disconnect killed the run mid-write
 * and left meta.status "planned" with nothing to resume). A reconnect to the
 * same slug attaches to the SAME run and streams its events, so a reload
 * resumes watching instead of starting over. The AbortController is kept for
 * the explicit Stop button only.
 */
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

/**
 * The generation/finalize pipeline for one deck, tracked in the registry. A
 * reconnecting client that already has a live run for the slug is attached by
 * `attachToRun` instead of starting a second pipeline.
 */
function startDeckRun({ slug, kind, plan, theme, model }) {
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

  (async () => {
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
    // Close every attached response, then drop the record after a grace period
    // so a very late reconnect still reads the terminal frame.
    for (const s of run.subscribers) s.close();
    run.subscribers.clear();
    setTimeout(() => {
      if (generationRuns.get(slug) === run) generationRuns.delete(slug);
    }, 5 * 60 * 1000);
  });

  return run;
}

/** Wire one SSE response into a live (or finished-but-still-recorded) run. */
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

/** Approved outline → deck, rendered and rasterised. Same SSE transport. */
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
  // Auto-tier gate: hourly / weekly caps before burning the shared gateway
  if (await isAutoRoute(model, req.user.email) && plan?.slides?.length) {
    try { await enforceAuto(req.user.email, plan.slides.length); } catch (e) {
      const sse = startSSE(res); sse.send("error", { error: e.message }); return sse.close();
    }
    recordAutoFor(req.user.email, plan.slides.length, 0);
  } else if (await isAutoRoute(model, req.user.email)) {
    try { await enforceAuto(req.user.email, 0); } catch (e) {
      const sse = startSSE(res); sse.send("error", { error: e.message }); return sse.close();
    }
    recordAutoFor(req.user.email, 0, 0);
  }
  startDeckRun({
    slug: req.params.slug,
    kind: resume ? "resume" : "generate",
    plan,
    theme,
    model,
  });
  attachToRun(res, generationRuns.get(req.params.slug));
});

/** Resume a dropped generation from its checkpoint (continues writing the
 *  remaining plan slides, then finalizes). Reconnects to a live run if one
 *  exists, exactly like /generate. */
app.post("/api/decks/:slug/generate/resume", (req, res) => {
  const live = generationRuns.get(req.params.slug);
  if (live && !live.finished) {
    attachToRun(res, live);
    return;
  }
  const { theme, model } = req.body ?? {};
  startDeckRun({ slug: req.params.slug, kind: "resume", plan: null, theme, model });
  attachToRun(res, generationRuns.get(req.params.slug));
});

/** The finalize watchdog — the deck's content is already written and complete
 *  (a dropped run, or a deck whose run died before finalize), so run the
 *  post-write pass and flip it to ready instead of re-writing slides. */
app.post("/api/decks/:slug/finalize", (req, res) => {
  const live = generationRuns.get(req.params.slug);
  if (live && !live.finished) {
    attachToRun(res, live);
    return;
  }
  const { theme, model } = req.body ?? {};
  startDeckRun({ slug: req.params.slug, kind: "finalize", plan: null, theme, model });
  attachToRun(res, generationRuns.get(req.params.slug));
});

/** Stop a live generation — the one explicit abort. The checkpoint survives,
 *  so a later resume continues from where the writer stopped. */
app.post("/api/decks/:slug/generate/stop", wrap(async (req, res) => {
  const run = generationRuns.get(req.params.slug);
  if (run && !run.finished) run.abort();
  ok(res, { stopped: Boolean(run && !run.finished) });
}));

/* ---------------------------------------------------------------- presets */

/**
 * Saved briefing formats, per user. A preset is the reusable half of a
 * briefing — the fixed fields (team, theme, density, branding, slide counts) —
 * so the briefing's first question can offer "use a saved format?" and
 * pre-fill the rest. The long-term facts (institution, guide) live in
 * config/identity.yaml, never in a preset. Gated by the same session check as
 * the deck workspace.
 */
app.get("/api/presets", wrap(async (req, res) => {
  ok(res, { presets: await listPresets(req.user.email) });
}));

app.post("/api/presets", wrap(async (req, res) => {
  const { name, team, maxSlides, theme, density, branding, slidesPerMember } = req.body ?? {};
  const preset = await savePreset(req.user.email, { name, team, maxSlides, theme, density, branding, slidesPerMember });
  ok(res, { preset });
}));

app.put("/api/presets/:id", wrap(async (req, res) => {
  const { name, team, maxSlides, theme, density, branding, slidesPerMember } = req.body ?? {};
  const preset = await updatePreset(req.user.email, req.params.id, { name, team, maxSlides, theme, density, branding, slidesPerMember });
  ok(res, { preset });
}));

app.delete("/api/presets/:id", wrap(async (req, res) => {
  await deletePreset(req.user.email, req.params.id);
  ok(res, {});
}));

/* ---------------------------------------------------------------- identity */

/**
 * The caller's own institution, guide and chrome defaults.
 *
 * This is per account. It used to read and write one install-wide
 * config/identity.yaml, so a second user editing their college in Settings
 * replaced the first user's — and every deck rendered afterwards carried the
 * wrong institution. The install-wide file survives underneath as the
 * operator's default for accounts that have set nothing.
 *
 * Reading it requires a session too: institution, department and guide name are
 * exactly the personal details the file is gitignored to protect.
 */
app.get("/api/identity", wrap(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const base = await loadBaseIdentity();
  const own = await loadUserIdentity(user.email);
  ok(res, { identity: deepMerge(base, own), overrides: own });
}));

app.put("/api/identity", wrap(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const { identity } = req.body ?? {};
  if (!identity || typeof identity !== "object") return fail(res, 400, "body must include `identity`");
  await saveUserIdentity(user.email, identity);
  ok(res, {});
}));

/* ------------------------------------------------------------------- brand */

const BRAND_ASSETS = ["crest", "banner", "watermark"];
const BRAND_IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "tiff"]);

/**
 * Brand marks are per account, for the same reason identity is: a hosted box
 * serves students from more than one institution, and uploading a crest used to
 * overwrite the single install-wide one for everybody. Each account normalises
 * into its own directory and its identity points at those paths; an account
 * that has uploaded nothing falls through to the operator's default marks.
 */
async function brandStatus(email) {
  const dirs = userBrandDirs(email);
  let entries = [];
  try {
    entries = await readdir(dirs.logos, { withFileTypes: true });
  } catch { /* no marks uploaded yet */ }
  const sources = {};
  let any = false;
  for (const name of BRAND_ASSETS) {
    const hit = entries.find((e) => !e.isDirectory() && e.name.startsWith(`${name}.`));
    sources[name] = hit ? hit.name : null;
    if (hit) any = true;
  }
  return { sources, placeholder: !any };
}

/** Point the account's identity at its own marks — or back at the defaults. */
async function syncBrandIdentity(email) {
  const dirs = userBrandDirs(email);
  const status = await brandStatus(email);
  const own = await loadUserIdentity(email);
  const next = { ...own };
  if (status.placeholder) {
    delete next.brand;
  } else {
    next.brand = {
      ...(status.sources.banner ? { banner: dirs.rel.banner } : {}),
      ...(status.sources.crest ? { crest: dirs.rel.crest, crest_light: dirs.rel.crest_light } : {}),
      ...(status.sources.watermark ? { watermark: dirs.rel.watermark } : {}),
    };
  }
  await saveUserIdentity(email, next);
  return status;
}

app.get("/api/brand", wrap(async (req, res) => {
  const user = await requireAuth(req, res, "log in to manage brand marks");
  if (!user) return;
  ok(res, { brand: await brandStatus(user.email) });
}));

/**
 * Upload a source mark. The body is the raw image bytes; the extension comes
 * from the request, so any raster format works (png/jpg/webp/tiff/gif). The
 * file lands in gitignored brand/logos/ and normalisation re-runs, so the
 * renderer picks it up on the next render — no repo edits, marks stay local.
 */
app.post("/api/brand/:name", (req, res) => {
  const name = req.params.name;
  if (!BRAND_ASSETS.includes(name)) return fail(res, 400, `unknown brand asset "${name}"`);
  const ext = typeof req.headers["x-file-ext"] === "string"
    ? req.headers["x-file-ext"].toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";
  if (!BRAND_IMAGE_EXT.has(ext)) {
    return fail(res, 400, `unsupported image extension — allowed: ${[...BRAND_IMAGE_EXT].join(", ")}`);
  }
  express.raw({ type: () => true, limit: "20mb" })(req, res, (err) => {
    if (err) return fail(res, 413, "image too large — max 20 MB");
    (async () => {
      try {
        const user = await requireAuth(req, res, "log in to upload brand marks");
        if (!user) return;
        if (!req.body?.length) return fail(res, 400, "empty upload");
        if (!sniffImage(req.body, ext)) {
          return fail(res, 400, `file does not look like a ${ext} image`);
        }
        const dirs = userBrandDirs(user.email);
        const file = path.join(dirs.logos, `${name}.${ext}`);
        await mkdir(dirs.logos, { recursive: true });
        // Replace any earlier extension of the same asset (crest.jpg -> crest.png).
        const entries = await readdir(dirs.logos).catch(() => []);
        for (const e of entries) {
          if (e.startsWith(`${name}.`) && e !== path.basename(file)) {
            await rm(path.join(dirs.logos, e), { force: true });
          }
        }
        await writeFile(file, req.body);
        // No placeholders for an account: a user with no marks of their own
        // should fall through to the operator's, not get generic stand-ins.
        await normalizeBrand({ srcDir: dirs.logos, outDir: dirs.generated, placeholders: false });
        const status = await syncBrandIdentity(user.email);
        ok(res, { asset: name, file: path.basename(file), brand: status });
      } catch (err) {
        fail(res, 500, err.message);
      }
    })();
  });
});

/** Remove a source mark and re-normalise — falls back to placeholders. */
app.delete("/api/brand/:name", wrap(async (req, res) => {
  const user = await requireAuth(req, res, "log in to manage brand marks");
  if (!user) return;
  const name = req.params.name;
  if (!BRAND_ASSETS.includes(name)) return fail(res, 400, `unknown brand asset "${name}"`);
  const dirs = userBrandDirs(user.email);
  const entries = await readdir(dirs.logos).catch(() => []);
  let removed = null;
  for (const e of entries) {
    if (e.startsWith(`${name}.`)) {
      await rm(path.join(dirs.logos, e), { force: true });
      removed = e;
    }
  }
  await rm(path.join(dirs.generated, `${name}.png`), { force: true });
  if (name === "crest") await rm(path.join(dirs.generated, "crest-light.png"), { force: true });
  await normalizeBrand({ srcDir: dirs.logos, outDir: dirs.generated, placeholders: false });
  const status = await syncBrandIdentity(user.email);
  ok(res, { asset: name, removed, brand: status });
}));

/* ---------------------------------------------------------- report donor */

/**
 * The institutional .docx the report renderer injects generated content into.
 *
 * It is gitignored (it carries third-party names) and excluded from the Docker
 * build context, so a hosted deployment starts with no donor at all and every
 * report render fails. This is the operator's way to supply one without shell
 * access to the volume. Admin-only: it is install-wide, and it is the document
 * every account's report is graded against.
 */
const DONOR_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // a .docx is a zip

app.get("/api/admin/donor", wrap(async (req, res) => {
  if (!(await requireAdminUser(req, res))) return;
  const donor = await donorStatus();
  ok(res, { ...donor, message: donor.ok ? null : reportUnavailable(donor) });
}));

app.post("/api/admin/donor", (req, res) => {
  express.raw({ type: () => true, limit: "25mb" })(req, res, (err) => {
    if (err) return fail(res, 413, "template too large — max 25 MB");
    (async () => {
      try {
        if (!(await requireAdminUser(req, res))) return;
        if (!req.body?.length) return fail(res, 400, "empty upload");
        if (!req.body.subarray(0, 4).equals(DONOR_MAGIC)) {
          return fail(res, 400, "that is not a .docx file");
        }
        let name = "";
        try { name = decodeURIComponent(String(req.headers["x-file-name"] ?? "")); } catch { name = ""; }
        name = path.basename(name).replace(/[^\w .()-]/g, "").slice(0, 120);
        if (!name.toLowerCase().endsWith(".docx")) name = `${name || "template"}.docx`;
        await mkdir(REFERENCE, { recursive: true });
        // resolveDonor refuses to guess between several templates, so a new
        // upload replaces the old rather than accumulating alternatives.
        for (const f of (await readdir(REFERENCE).catch(() => []))) {
          if (f.toLowerCase().endsWith(".docx")) await rm(path.join(REFERENCE, f), { force: true });
        }
        await writeFile(path.join(REFERENCE, name), req.body);
        ok(res, { donor: name });
      } catch (err) {
        fail(res, 500, err.message);
      }
    })();
  });
});

/* ------------------------------------------------------------------- auth */

/**
 * Rate limiting for the credential endpoints — the one thing a public-facing
 * box should never allow to be hammered. In-memory sliding window per IP:
 * a friend's laptop has one or two real users, so 20 attempts / 10 min is
 * generous for humans and useless for a dictionary attack.
 */
const AUTH_LIMIT = Number(process.env.FORGE_AUTH_RATE_LIMIT || 20);
const AUTH_WINDOW_MS = 10 * 60 * 1000;
const authHits = new Map();

// Entries were filtered per request but never removed, so every IP that ever
// touched the login endpoint stayed resident. Behind a trusted proxy the key is
// a client-supplied header, which turns that into a cheap memory-growth vector.
setInterval(() => {
  const cutoff = Date.now() - AUTH_WINDOW_MS;
  for (const [ip, hits] of authHits) {
    const live = hits.filter((t) => t > cutoff);
    if (live.length) authHits.set(ip, live);
    else authHits.delete(ip);
  }
}, AUTH_WINDOW_MS).unref();

function rateLimit(req, res, next) {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  const list = (authHits.get(ip) ?? []).filter((t) => now - t < AUTH_WINDOW_MS);
  if (list.length >= AUTH_LIMIT) {
    return fail(res, 429, "too many attempts — try again later");
  }
  list.push(now);
  authHits.set(ip, list);
  next();
}

/**
 * Local single-install accounts. Sessions are bearer tokens held server-side;
 * the token rides the Authorization header and nothing sensitive ever leaves
 * the machine. These endpoints protect the Cloud-key surface (and future
 * hosting), not the deck pipeline — everything else stays open.
 *
 * Registration is open by default for local dev, but on a public box that is
 * the "friend's server" story: anyone who can reach it can sign up and burn
 * CPU. FORGE_OPEN_REGISTRATION=0 closes it and the owner's account is seeded
 * from FORGE_ADMIN_EMAIL + FORGE_ADMIN_PASSWORD at boot.
 */
const OPEN_REGISTRATION = process.env.FORGE_OPEN_REGISTRATION !== "0";
app.post("/api/auth/register", rateLimit, wrap(async (req, res) => {
  if (!OPEN_REGISTRATION) {
    return fail(res, 403, "registration is closed on this server — ask the owner for an account");
  }
  const { name, email, password } = req.body ?? {};
  try {
    const user = await register({ name, email, password });
    // Registration deliberately does not start a session — the visitor logs in
    // with the new credentials explicitly, so creating an account never hands
    // out a token.
    if (!user.verified && mailConfigured()) {
      const token = issueAuthToken(user.email, "verify");
      if (token) {
        mailThrottled("verify", user.email); // the signup counts against the resend budget
        dispatchMail(verifyMail({ name: user.name, token, hours: VERIFY_TTL_HOURS }), user.email);
      }
    }
    ok(res, { user, verifySent: !user.verified });
  } catch (err) {
    fail(res, 400, err.message);
  }
}));

/** True when the response will travel over TLS, so the cookie can demand it. */
function secureRequest(req) {
  return req.secure || String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim() === "https";
}

app.post("/api/auth/login", rateLimit, wrap(async (req, res) => {
  const { email, password } = req.body ?? {};
  const user = await authenticate(email, password);
  if (!user) return fail(res, 401, "invalid email or password");
  const token = await startSession(user);
  res.setHeader("Set-Cookie", sessionCookie(token, { secure: secureRequest(req) }));
  ok(res, { token, user });
}));

app.post("/api/auth/google", rateLimit, wrap(async (req, res) => {
  const { id_token, credential } = req.body ?? {};
  const token = id_token ?? credential;
  if (!token) return fail(res, 400, "missing Google id_token");
  try {
    const g = await verifyGoogleIdToken(token);
    const user = await findOrCreateGoogleUser(g);
    const bearer = await startSession(user);
    res.setHeader("Set-Cookie", sessionCookie(bearer, { secure: secureRequest(req) }));
    ok(res, { token: bearer, user });
  } catch (err) {
    fail(res, 401, err.message);
  }
}));

app.post("/api/auth/logout", wrap(async (req, res) => {
  await endSession(bearerToken(req.headers.authorization) ?? cookieToken(req.headers.cookie));
  res.setHeader("Set-Cookie", clearedSessionCookie({ secure: secureRequest(req) }));
  ok(res, {});
}));

app.get("/api/auth/me", wrap(async (req, res) => {
  const token = bearerToken(req.headers.authorization);
  const user = await userForToken(token ?? cookieToken(req.headers.cookie));
  if (!user) return fail(res, 401, "not logged in");
  // Re-issue the media cookie for a session that predates it. The UI calls this
  // on boot, so a browser holding only the localStorage token from an older
  // build gets its rasters back without having to log in again.
  if (token && !cookieToken(req.headers.cookie)) {
    res.setHeader("Set-Cookie", sessionCookie(token, { secure: secureRequest(req) }));
  }
  ok(res, { user, verifyRequired: verificationRequired() });
}));

/* --------------------------------------------- reset and verify by email */

/**
 * Per-address throttle for the two endpoints that put a message in someone
 * else's inbox. The IP limiter above stops a dictionary attack; it does nothing
 * about one address being mailbombed from a botnet, and "forgot password"
 * pointed at a stranger is a harassment tool as much as a security one.
 *
 * Two windows: a minimum gap so a double-click sends one message, and an hourly
 * ceiling. Keyed by purpose and address, so a reset request does not eat the
 * budget for a verification resend.
 */
const MAIL_MIN_GAP_MS = 2 * 60 * 1000;
const MAIL_WINDOW_MS = 60 * 60 * 1000;
const MAIL_WINDOW_MAX = 5;
const mailHits = new Map();

setInterval(() => {
  const cutoff = Date.now() - MAIL_WINDOW_MS;
  for (const [key, hits] of mailHits) {
    const live = hits.filter((t) => t > cutoff);
    if (live.length) mailHits.set(key, live);
    else mailHits.delete(key);
  }
}, MAIL_WINDOW_MS).unref();

function mailThrottled(purpose, email) {
  const key = `${purpose}:${String(email).trim().toLowerCase()}`;
  const now = Date.now();
  const hits = (mailHits.get(key) ?? []).filter((t) => now - t < MAIL_WINDOW_MS);
  if (hits.length >= MAIL_WINDOW_MAX) return true;
  if (hits.length && now - hits[hits.length - 1] < MAIL_MIN_GAP_MS) return true;
  hits.push(now);
  mailHits.set(key, hits);
  return false;
}

/**
 * Send without making the caller wait for it.
 *
 * An SMTP dialogue takes seconds and can take twenty-five. Awaiting it would
 * make "this address has an account" measurably slower than "it does not",
 * which hands back exactly the enumeration the generic response is there to
 * prevent. Failures are logged for the operator, not reported to the caller.
 */
function dispatchMail(message, to) {
  sendMail({ ...message, to })
    .then((r) => { if (!r.sent) console.warn(`  ! mail not sent to ${to}: ${r.reason}`); })
    .catch((err) => console.warn(`  ! mail to ${to} failed: ${err.message}`));
}

/**
 * Ask for a reset link. The answer never varies: whether the address has an
 * account, whether that account signs in with Google and has no password to
 * reset, and whether the message was actually accepted are all invisible to the
 * caller. Anything else turns this endpoint into an account-enumeration oracle,
 * which is how "who is registered here" leaks from a box that never listed its
 * users.
 */
app.post("/api/auth/forgot", rateLimit, wrap(async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const generic = () => ok(res, { sent: true });
  if (!email || !mailConfigured()) return generic();
  if (mailThrottled("reset", email)) return generic();
  try {
    pruneAuthTokens();
    const state = accountVerificationState(email);
    // No account, or a Google account with no password: nothing to reset, and
    // the caller is told the same thing either way.
    if (!state?.hasPassword) return generic();
    const token = issueAuthToken(email, "reset");
    if (token) dispatchMail(resetMail({ name: state.name, token, minutes: RESET_TTL_MINUTES }), email);
  } catch (err) {
    console.warn(`  ! reset request failed: ${err.message}`);
  }
  return generic();
}));

/** Spend a reset token and set the new password. Every session for the account
 *  dies with it — see resetPassword in auth.js. */
app.post("/api/auth/reset", rateLimit, wrap(async (req, res) => {
  const { token, password } = req.body ?? {};
  if (!token) return fail(res, 400, "missing reset token");
  const spent = consumeAuthToken(token, "reset");
  if (!spent.ok) {
    if (spent.reason === "unavailable") return fail(res, 503, "the account store is unavailable");
    return fail(res, 400, "that reset link has expired or has already been used — ask for a new one");
  }
  try {
    resetPassword(spent.email, password);
  } catch (err) {
    // A rejected password must not burn the token, or a typo costs the user a
    // second email. Re-issue and hand the replacement back to the same session.
    const replacement = issueAuthToken(spent.email, "reset");
    return res.status(400).json({ ok: false, error: err.message, token: replacement });
  }
  ok(res, { email: spent.email });
}));

/** Spend a verification token. Deliberately does NOT start a session: a link
 *  sitting in an inbox should confirm an address, not be a way into the
 *  account. The visitor logs in as they normally would. */
app.post("/api/auth/verify", rateLimit, wrap(async (req, res) => {
  const { token } = req.body ?? {};
  if (!token) return fail(res, 400, "missing verification token");
  const spent = consumeAuthToken(token, "verify");
  if (!spent.ok) {
    if (spent.reason === "unavailable") return fail(res, 503, "the account store is unavailable");
    return fail(res, 400, "that confirmation link has expired or has already been used — sign in and ask for a new one");
  }
  markVerified(spent.email);
  ok(res, { email: spent.email });
}));

/** Send the confirmation again, to the logged-in account's own address. It can
 *  only ever mail the caller's own address, so it is not a send-mail-to-anyone
 *  endpoint wearing a session. */
app.post("/api/auth/verify/resend", rateLimit, wrap(async (req, res) => {
  const user = await requireAuth(req, res, "log in to resend the confirmation");
  if (!user) return;
  // Already confirmed is the first thing to say. Asked in the other order, an
  // account on a box with no SMTP — which confirms on creation — is told its
  // address cannot be confirmed, which is both false and alarming.
  if (user.verified) return ok(res, { sent: false, verified: true });
  if (!mailConfigured()) return fail(res, 503, "this server cannot send email — ask the owner to confirm your account");
  if (mailThrottled("verify", user.email)) {
    // Not a failure the user caused, and not one they can fix by trying again:
    // the message they want already exists. Coded so the banner can say so
    // calmly instead of in red.
    return res.status(429).json({
      ok: false,
      error: "a confirmation is already on its way — check your inbox, including spam",
      code: "recently_sent",
    });
  }
  const token = issueAuthToken(user.email, "verify");
  if (!token) return fail(res, 503, "the account store is unavailable");
  dispatchMail(verifyMail({ name: user.name, token, hours: VERIFY_TTL_HOURS }), user.email);
  ok(res, { sent: true });
}));

/** Whether new accounts can self-register on this server. */
app.get("/api/auth/registration", wrap(async (_req, res) => {
  // `mail` decides whether the form can offer "forgot password" and whether it
  // should promise a confirmation message that would never arrive.
  ok(res, { open: OPEN_REGISTRATION, mail: mailConfigured(), verifyRequired: verificationRequired() });
}));
app.get("/api/auth/google/config", wrap(async (_req, res) => {
  ok(res, { clientId: process.env.GOOGLE_CLIENT_ID || process.env.FORGE_GOOGLE_CLIENT_ID || null });
}));

/** Session gate for the routes that sit outside the deck workspace. */
async function requireAuth(req, res, message = "log in to continue") {
  const user = await resolveUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: message });
    return null;
  }
  return user;
}

/** Admin gate for install-wide settings — one account must not reconfigure the box for everyone. */
async function requireAdminUser(req, res, message = "admin only") {
  const user = await resolveUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: "log in" });
    return null;
  }
  if (!isAdmin(user)) {
    res.status(403).json({ ok: false, error: message });
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
app.get("/api/cloud", wrap(async (req, res) => {
  const user = await resolveUser(req);
  ok(res, { cloud: await cloudStatus(user ? getUserId(user.email) : null) });
}));

/**
 * The INSTALL-WIDE provider key, written to config/local.yaml. It is the
 * operator's key and it bills the operator, so only an admin may set it — any
 * logged-in account used to be able to, which meant one user could replace the
 * key every other user's generations ran on. A user attaching their own key
 * wants PUT /api/keys, which stores it encrypted against their account.
 */
app.put("/api/cloud/key", wrap(async (req, res) => {
  if (!(await requireAdminUser(req, res, "the shared provider key is an operator setting — add your own key under Settings → Cloud"))) return;
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
  if (!(await requireAdminUser(req, res, "the shared provider key is an operator setting"))) return;
  const name = await cloudKeyName();
  if (name) await clearApiKey(name);
  ok(res, {});
}));

app.post("/api/cloud/test", wrap(async (req, res) => {
  if (!(await requireAuth(req, res, "log in to test a provider"))) return;
  ok(res, await testCloudConnection());
}));

/** The AUTO/CLOUD routing preference — per account, not per install. */
app.put("/api/cloud/routing", wrap(async (req, res) => {
  const user = await requireAuth(req, res, "log in to change routing");
  if (!user) return;
  const route = req.body?.route;
  const uid = getUserId(user.email);
  await setRoutingPreference(route, uid);
  ok(res, { route: await routingPreference(uid) });
}));

/* ------------------------------------------------------------------ auto (TCET) */
app.get("/api/auto/status", wrap(async (req, res) => {
  const user = await resolveUser(req);
  ok(res, { auto: await autoStatus(user ? getUserId(user.email) : null), limits: limitConfig() });
}));
app.post("/api/auto/test", wrap(async (req, res) => {
  if (!(await requireAuth(req, res, "log in to test the gateway"))) return;
  ok(res, await testAutoConnection());
}));
app.get("/api/auto/usage", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user) return fail(res, 401, "log in to see usage");
  const uid = getUserId(user.email);
  if (!uid) return fail(res, 404, "no such user");
  ok(res, { usage: getUsage({ userId: uid }), limits: limitConfig() });
}));

/* Per-user BYOK vault — encrypted at rest, operator-blind */
app.get("/api/keys/status", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user) return fail(res, 401, "log in to see keys");
  const uid = getUserId(user.email);
  const hasKey = uid ? Boolean(await getUserApiKey(uid)) : false;
  ok(res, { hasKey });
}));
app.put("/api/keys", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user) return fail(res, 401, "log in to save a key");
  const { key, provider } = req.body ?? {};
  if (typeof key !== "string" || !/^sk-[A-Za-z0-9_-]{8,}$/.test(key)) {
    return fail(res, 400, "key must look like sk-... (at least 8 chars after prefix)");
  }
  const uid = getUserId(user.email);
  if (!uid) return fail(res, 404, "no such user");
  await setUserApiKey(uid, provider ?? "openai", key);
  ok(res, {});
}));
app.delete("/api/keys", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user) return fail(res, 401, "log in to clear keys");
  const uid = getUserId(user.email);
  if (uid) await clearUserApiKey(uid);
  ok(res, {});
}));

/* -------------------------------------------------------------------- boot */

/** README as plain text — the shell's docs modal renders it with no parser. */
app.get("/api/docs", wrap(async (_req, res) => {
  const text = await readFile(path.join(ROOT, "README.md"), "utf8");
  res.type("text/plain").send(text);
}));

// Liveness only. It used to return the absolute install path, which tells an
// unauthenticated caller how the box is laid out for no operational benefit.
app.get("/api/health", (_req, res) => ok(res, {}));

/**
 * Seed the operator's account on boot.
 *
 * This runs whether or not registration is open, and it is now the ONLY way an
 * admin comes into existence besides promotion by an existing admin. Deriving
 * admin from an email address at request time meant whoever registered that
 * address first owned the box, because registration does not verify email.
 * Boot is unreachable from the network, so the env pair is safe here.
 *
 * If the address already has an account (registered normally, or via Google
 * where there is no password to set), it is promoted rather than recreated.
 */
{
  const adminEmail = process.env.FORGE_ADMIN_EMAIL;
  const adminPassword = process.env.FORGE_ADMIN_PASSWORD;
  if (adminEmail) {
    try {
      const created = adminPassword
        ? await seedAdmin({ name: "Admin", email: adminEmail, password: adminPassword })
        : false;
      if (created) console.log("  seeded operator account from FORGE_ADMIN_*");
      else if (await promoteToAdmin(adminEmail)) console.log("  promoted FORGE_ADMIN_EMAIL to admin");
    } catch (err) {
      console.error(`  admin seed failed: ${err.message}`);
    }
  }
  if (!OPEN_REGISTRATION && !adminEmail) {
    console.warn("  WARNING: FORGE_OPEN_REGISTRATION=0 but FORGE_ADMIN_EMAIL is not set — nobody can create an account.");
  }
}

/**
 * The monthly sweep scheduler. When FORGE_SWEEP_DAYS is set (the number of days
 * of inactivity before a deck is deleted), the server runs the sweep once a
 * day at FORGE_SWEEP_HOUR (default 3 AM) — deleting old unkept decks and
 * emailing the owner, per the deployment plan for the home server. Without the
 * env var the server never touches deck data on its own.
 */
const SWEEP_DAYS = Number(process.env.FORGE_SWEEP_DAYS || NaN);
const SWEEP_HOUR = Number(process.env.FORGE_SWEEP_HOUR || 3);
if (Number.isFinite(SWEEP_DAYS) && SWEEP_DAYS > 0) {
  const { sweep } = await import("../../src/sweep.js");
  const runSweep = () => sweep({ olderThanDays: SWEEP_DAYS })
    .then((r) => console.log(`  sweep: ${r.deleted.length} deleted, ${r.willDelete.length} old, ${r.skipped.length} kept`))
    .catch((err) => console.error(`  sweep failed: ${err.message}`));

  const schedule = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(SWEEP_HOUR, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const delay = next - now;
    setTimeout(() => { runSweep(); schedule(); }, delay);
    console.log(`  sweep scheduled daily at ${SWEEP_HOUR}:00 (deleting decks older than ${SWEEP_DAYS} days)`);
  };
  schedule();
}

/**
 * Production static serving: when the UI is built (app/web/dist), the API
 * serves it so one port runs the whole app on a home server. In dev the dist
 * is absent (Vite runs on :5173) and these routes simply never match.
 *
 * The UI gets a strict CSP (the token lives in localStorage, so CSP is the
 * main defence if any XSS slips through). The API JSON responses deliberately
 * do not — the plate renderer and assets carry their own, more restrictive
 * policies, and a JSON response with a CSP header only invites confusion.
 */
const UI_DIST = path.join(ROOT, "app", "web", "dist");
try {
  await stat(path.join(UI_DIST, "index.html"));
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/")) {
      res.setHeader("Content-Security-Policy",
        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
        "script-src 'self'; font-src 'self' data:; connect-src 'self'");
    }
    next();
  });
  app.use(express.static(UI_DIST));
  // SPA fallback: unknown non-API paths render the shell.
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(UI_DIST, "index.html")));
} catch { /* dev — no built UI */ }

/**
 * What a healthy-looking box is quietly missing.
 *
 * Neither of these stops the server, and that is the point: a box that renders
 * 34 themes of slides should not refuse to serve any of them over a missing
 * .docx, and an install with no SMTP is the ordinary local case. But both fail
 * silently at the point of use — half the product 500s, or an account can never
 * be recovered — so they are said once, loudly, where the operator is looking.
 */
async function reportBootGaps() {
  const donor = await donorStatus();
  if (!donor.ok) {
    console.warn(`  WARNING: ${reportUnavailable(donor)}`);
    console.warn(`           drop one .docx into ${donor.dir}, set FORGE_REFERENCE_DIR, or upload it under Admin → System.`);
  }
  if (!mailConfigured()) {
    console.warn("  WARNING: no SMTP configured (FORGE_SMTP_*) — password reset cannot be delivered,");
    console.warn("           and new accounts are verified on creation because nothing can be sent to them.");
  } else if (!process.env.FORGE_PUBLIC_URL && !process.env.FORGE_UI_ORIGIN) {
    console.warn("  WARNING: FORGE_PUBLIC_URL is unset — reset and confirmation links will point at localhost.");
  }

  // A role quietly running a model models.yaml does not name is the failure
  // that produced a thin outline nobody could explain. Hosted has no Ollama and
  // nothing to check, and an unreachable Ollama on a local box is ordinary, so
  // neither is worth a line — only an actual mismatch is.
  if (!isHosted()) {
    const audit = await roleAudit();
    if (audit.reachable && !audit.ok) {
      for (const r of audit.roles) {
        if (r.status === "fallback") {
          console.warn(`  WARNING: role "${r.role}" wants ${r.configured}, which is not installed — falling back to ${r.resolved}.`);
        } else if (r.status === "missing") {
          console.warn(`  WARNING: role "${r.role}" wants ${r.configured}, which is not installed, and no fallback is either.`);
        }
      }
      console.warn("           Fix config/models.yaml, or: ollama pull <model>");
    }
  }
}

/**
 * Exported so a test can bind port 0, read the port it actually got, and make
 * real requests against the real route table. Route ORDER is a property of this
 * file that no unit test can reach — a literal path shadowed by a parameterised
 * `app.use` parses fine, passes every test, and refuses in production.
 */
export const server = app.listen(PORT, () => {
  console.log(`  api   http://localhost:${server.address().port}`);
  reportBootGaps().catch(() => { /* a warning that cannot be computed is not worth failing over */ });
});
