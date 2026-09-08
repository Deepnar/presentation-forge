/** Administrative account, quota, storage, and health routes. */



import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { AUTO_PROVIDER, AUTO_PROVIDER_IDS } from "../../src/autoid.js";
import { bearerToken, deleteUserAccount, getUserEmailById, getUserId, isAdmin, listUsers, setUserRole, userForToken } from "../../src/auth.js";
import { autoHealth, isHosted, setHosted } from "../../src/cloud.js";
import { selectDeletableAccounts, selectionToken, confirmPhrase } from "../../src/cleanup.js";
import { identityStatus } from "../../src/ai/identity.js";
import { clearAutoEvents, isPlan, limitConfig, planFor, PLANS, setPlan, usageByUser } from "../../src/limits.js";
import { mailConfigured } from "../../src/mail.js";
import { DECKS } from "../../src/paths.js";
import { donorStatus } from "../../src/report.js";
import { settingValue, settingsReport, setSetting, SETTING_KEYS } from "../../src/runtime.js";
import { fail, ok, wrap } from "./http.js";

const SWEEP_HOUR = Number(process.env.FORGE_SWEEP_HOUR || 3);

export function registerAdminRoutes(app, { deckMeta, dirSize }) {
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


app.put("/api/admin/settings/:name", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user || !isAdmin(user)) return fail(res, 403, "admin only");
  const { name } = req.params;
  if (!SETTING_KEYS.includes(name)) return fail(res, 400, `unknown setting "${name}"`);
  try {
    const result = await setSetting(name, req.body?.value ?? null);
    ok(res, { setting: name, ...result });
  } catch (err) {
    return fail(res, 400, err.message);
  }
}));


app.get("/api/admin/auto/key", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user || !isAdmin(user)) return fail(res, 403, "admin only");
  const { loadGlobalKey } = await import("../../src/vault.js");
  const envKey = process.env.FORGE_TCET_API_KEY ?? "";
  let storedKey = "";
  try { storedKey = loadGlobalKey(AUTO_PROVIDER) ?? ""; } catch { /* unreadable under the current pepper */ }
  const live = envKey || storedKey;
  ok(res, {
    set: Boolean(live),
    source: envKey ? "env" : storedKey ? "stored" : null,
    hint: live ? `…${live.slice(-4)}` : null,
    storedShadowedByEnv: Boolean(envKey && storedKey),
    pepperSet: Boolean(process.env.FORGE_KEY_PEPPER || process.env.FORGE_KEY),
  });
}));

app.put("/api/admin/auto/key", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user || !isAdmin(user)) return fail(res, 403, "admin only");
  const key = String(req.body?.key ?? "").trim();
  if (key.length < 12 || /\s/.test(key)) {
    return fail(res, 400, "that does not look like an API key");
  }
  try {
    const { saveGlobalKey } = await import("../../src/vault.js");
    saveGlobalKey(AUTO_PROVIDER, key);
  } catch (err) {
    return fail(res, 400, err.message);
  }
  const { autoHealth } = await import("../../src/cloud.js");
  ok(res, {
    stored: true,
    shadowedByEnv: Boolean(process.env.FORGE_TCET_API_KEY),
    health: await autoHealth({ force: true }).catch(() => null),
  });
}));

app.delete("/api/admin/auto/key", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user || !isAdmin(user)) return fail(res, 403, "admin only");
  try {
    const { getDb } = await import("../../src/db.js");
    for (const p of AUTO_PROVIDER_IDS) getDb().prepare("DELETE FROM global_keys WHERE provider=?").run(p);
  } catch (err) {
    return fail(res, 500, err.message);
  }
  ok(res, { cleared: true });
}));
app.get("/api/admin/users", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user || !isAdmin(user)) return fail(res, 403, "admin only");
  const users = await listUsers();
  let spend = new Map();
  try { spend = usageByUser(); } catch { /* no db, or no events table yet */ }
  ok(res, {
    users: users.map((u) => {
      const id = getUserId(u.email);
      const plan = id ? planFor(id) : "free";
      return {
        ...u,
        plan,
        usage: (id && spend.get(id)) || {
          windowRequests: 0, windowSlides: 0, windowTokens: 0,
          weekRequests: 0, weekSlides: 0, weekTokens: 0,
        },
        limits: limitConfig(plan),
      };
    }),
    limits: limitConfig(),
    plans: Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, { ...v, limits: limitConfig(k) }])),
  });
}));


app.delete("/api/admin/users/:email/usage", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user || !isAdmin(user)) return fail(res, 403, "admin only");
  const id = getUserId(req.params.email);
  if (!id) return fail(res, 404, "no such account");
  const cleared = clearAutoEvents({ userId: id });
  ok(res, { cleared });
}));

async function cleanupSelection(req, criteria) {
  const users = await listUsers();
  const deckOwners = new Set();
  try {
    for (const e of await readdir(DECKS, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      try {
        const m = YAML.parse(await readFile(path.join(DECKS, e.name, "meta.yaml"), "utf8")) ?? {};
        if (m.owner) deckOwners.add(String(m.owner).trim().toLowerCase());
      } catch { /* a folder with no readable meta owns nothing */ }
    }
  } catch { /* no decks dir */ }

  let usedUserIds = new Set();
  try { usedUserIds = new Set(usageByUser().keys()); } catch { /* no events table */ }

  return selectDeletableAccounts({
    users,
    deckOwners,
    usedUserIds,
    idFor: (email) => getUserId(email),
    protect: [req.user?.email].filter(Boolean),
    olderThanDays: criteria?.olderThanDays,
    emailPattern: criteria?.emailPattern,
  });
}

app.post("/api/admin/users/cleanup/preview", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user || !isAdmin(user)) return fail(res, 403, "admin only");
  req.user = user;
  const { selected, skipped, criteria } = await cleanupSelection(req, req.body ?? {});
  ok(res, {
    selected, skipped, criteria,
    count: selected.length,
    token: selectionToken(selected),
    phrase: confirmPhrase(selected.length),
  });
}));

app.post("/api/admin/users/cleanup", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user || !isAdmin(user)) return fail(res, 403, "admin only");
  req.user = user;
  const { token, confirm } = req.body ?? {};
  const { selected } = await cleanupSelection(req, req.body ?? {});
  const fresh = selectionToken(selected);
  if (!token || token !== fresh) {
    return fail(res, 409, "the accounts matching these criteria changed since the preview — review the list again");
  }
  if (!selected.length) return fail(res, 400, "nothing matches these criteria");

  const phrase = confirmPhrase(selected.length);
  if (String(confirm ?? "").trim().toLowerCase() !== phrase) {
    return fail(res, 400, `type "${phrase}" to confirm`);
  }

  const deleted = [];
  const failed = [];
  for (const { email } of selected) {
    try { await deleteUserAccount(email); deleted.push(email); }
    catch (err) { failed.push({ email, error: err.message }); }
  }
  console.log(`  admin cleanup by ${user.email}: ${deleted.length} accounts deleted, ${failed.length} failed`);
  ok(res, { deleted: deleted.length, failed });
}));

app.post("/api/admin/users/:email/role", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user || !isAdmin(user)) return fail(res, 403, "admin only");
  const role = req.body?.role === "admin" ? "admin" : null;
  await setUserRole(req.params.email, role);
  ok(res, {});
}));

app.post("/api/admin/users/:email/plan", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user || !isAdmin(user)) return fail(res, 403, "admin only");
  const plan = String(req.body?.plan ?? "");
  if (!isPlan(plan)) {
    return fail(res, 400, `plan must be one of ${Object.keys(PLANS).join(", ")}`);
  }
  const id = getUserId(req.params.email);
  if (!id) return fail(res, 404, "no such user");
  setPlan(id, plan);
  ok(res, { plan, limits: limitConfig(plan) });
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
  for (const d of decks) {
    try {
      const outStat = await stat(path.join(DECKS, d.slug, "out", "deck.pptx"));
      d.size = outStat.size;
    } catch { d.size = 0; }
  }
  ok(res, { decks });
}));
app.get("/api/admin/stats", wrap(async (req, res) => {
  const user = await userForToken(bearerToken(req.headers.authorization));
  if (!user || !isAdmin(user)) return fail(res, 403, "admin only");
  const users = await listUsers();
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const usersWeek = users.filter((u) => Date.parse(u.createdAt) > weekAgo).length;
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
      totalSize += await dirSize(path.join(DECKS, e.name));
    } catch {}
  }
  recent.sort((a, b) => b.updated - a.updated);
  let usageAgg = { totalRequests: 0, totalSlides: 0, totalTokens: 0, byUser: [] };
  let limits = limitConfig();
  try {
    const { getDb } = await import("../../src/db.js");
    const db = getDb();
    const rows = db.prepare("SELECT user_id, COUNT(*) as reqs, COALESCE(SUM(slides),0) as slides, COALESCE(SUM(tokens),0) as tokens FROM auto_events GROUP BY user_id ORDER BY reqs DESC LIMIT 10").all();
    const userById = new Map();
    for (const r of rows) {
      const email = getUserEmailById(r.user_id);
      if (email) userById.set(r.user_id, email);
    }
    usageAgg.byUser = rows.map((r) => ({ email: userById.get(r.user_id) ?? `id:${r.user_id}`, requests: r.reqs, slides: r.slides, tokens: r.tokens }));
    const tot = db.prepare("SELECT COUNT(*) as reqs, COALESCE(SUM(slides),0) as slides, COALESCE(SUM(tokens),0) as tokens FROM auto_events").get();
    usageAgg.totalRequests = tot.reqs ?? 0;
    usageAgg.totalSlides = tot.slides ?? 0;
    usageAgg.totalTokens = tot.tokens ?? 0;
  } catch {}
  let ollamaOk = false, searxngOk = false;
  try { const r = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(2000) }); ollamaOk = r.ok; } catch {}
  try { const searx = process.env.SEARXNG_URL || "http://localhost:8888"; const r = await fetch(`${searx}/healthz`, { signal: AbortSignal.timeout(2000) }); searxngOk = r.ok; } catch {}
  let diskFree = null;
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { stdout } = await promisify(execFile)("df", ["-h", DECKS], { timeout: 4000 });
    diskFree = stdout.trim().split("\n").at(-1) ?? null;
  } catch { /* not POSIX, or df is slow — the row renders as unknown */ }
  ok(res, {
    hosted: isHosted(),
    users: { total: users.length, admins: users.filter((u) => u.admin).length, week: usersWeek, list: users.slice(0, 5) },
    decks: { total: totalDecks, reports: totalReports, slides: totalSlides, size: totalSize, byTheme, byOwner, recent: recent.slice(0, 10) },
    usage: usageAgg,
    limits,
    system: {
      ollamaOk, searxngOk, diskFree, uptime: process.uptime(), node: process.version,
      auto: await autoHealth(),
      donor: await donorStatus(),
      identity: await identityStatus(),
      mailOk: mailConfigured(),
      controls: {
        openRegistration: settingValue("openRegistration"),
        sweepDays: settingValue("sweepDays"),
        sweepHour: Number.isFinite(SWEEP_HOUR) ? SWEEP_HOUR : null,
      },
      settings: settingsReport(),
      vault: { pepperSet: Boolean(process.env.FORGE_KEY_PEPPER || process.env.FORGE_KEY) },
      roles: await roleAudit(),
    },
  });
}));

}
