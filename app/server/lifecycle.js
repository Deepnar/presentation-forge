
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { promoteToAdmin, seedAdmin } from "../../src/auth.js";
import { identityStatus, identityUnconfigured } from "../../src/ai/identity.js";
import { roleAudit } from "../../src/ai/ollama.js";
import { isHosted } from "../../src/cloud.js";
import { localFallbackArmed } from "../../src/devfallback.js";
import { pruneAutoEvents } from "../../src/limits.js";
import { pruneByokUsage } from "../../src/byok-budget.js";
import { mailConfigured } from "../../src/mail.js";
import { ROOT } from "../../src/paths.js";
import { donorStatus } from "../../src/report.js";
import { reportUnavailable } from "../../src/ai/pipeline.js";
import { settingValue } from "../../src/runtime.js";
import { localOwnerMode } from "./auth-routes.js";
import { ok, wrap } from "./http.js";

function registerPublicRoutes(app) {
  app.get("/api/docs", wrap(async (_req, res) => {
    res.type("text/plain").send(await readFile(path.join(ROOT, "README.md"), "utf8"));
  }));
  app.get("/api/health", (_req, res) => ok(res));
  app.get("/api/policy", (_req, res) => {
    const days = Number(process.env.FORGE_SWEEP_DAYS || NaN);
    const sweeps = Number.isFinite(days) && days > 0;
    ok(res, { retention: { sweeps, days: sweeps ? days : null, basis: "inactivity", keepable: true } });
  });
}

async function seedOperator() {
  const email = process.env.FORGE_ADMIN_EMAIL;
  const password = process.env.FORGE_ADMIN_PASSWORD;
  if (email) {
    try {
      const created = password
        ? await seedAdmin({ name: "Admin", email, password })
        : false;
      if (created) console.log("  seeded operator account from FORGE_ADMIN_*");
      else if (await promoteToAdmin(email)) console.log("  promoted FORGE_ADMIN_EMAIL to admin");
    } catch (error) {
      console.error(`  admin seed failed: ${error.message}`);
    }
  }
  if (!settingValue("openRegistration") && !email) {
    console.warn("  WARNING: FORGE_OPEN_REGISTRATION=0 but FORGE_ADMIN_EMAIL is not set — nobody can create an account.");
  }
}

function scheduleDeckSweep() {
  const hour = Number(process.env.FORGE_SWEEP_HOUR || 3);
  const run = async () => {
    const days = settingValue("sweepDays");
    if (!days) return;
    try {
      const { sweep } = await import("../../src/sweep.js");
      const result = await sweep({ olderThanDays: days });
      console.log(`  sweep: ${result.deleted.length} deleted, ${result.willDelete.length} old, ${result.skipped.length} kept`);
    } catch (error) {
      console.error(`  sweep failed: ${error.message}`);
    }
  };
  const schedule = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    setTimeout(() => { run(); schedule(); }, next - now).unref();
  };
  schedule();
  const days = settingValue("sweepDays");
  console.log(days
    ? `  sweep scheduled daily at ${hour}:00 (deleting decks idle over ${days} days)`
    : "  sweep armed but OFF — set retention in Admin -> System, or FORGE_SWEEP_DAYS");
}

function scheduleUsagePrune() {
  const run = () => {
    try { pruneAutoEvents(); } catch (error) { console.error(`  usage prune failed: ${error.message}`); }
    try { pruneByokUsage(); } catch (error) { console.error(`  BYOK usage prune failed: ${error.message}`); }
  };
  run();
  setInterval(run, 24 * 60 * 60 * 1000).unref();
}

async function serveBuiltUi(app) {
  const directory = path.join(ROOT, "app", "web", "dist");
  const indexFile = path.join(directory, "index.html");
  try {
    await stat(indexFile);
  } catch {
    return;
  }
  const html = await readFile(indexFile, "utf8");
  const inline = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  const hash = inline ? `'sha256-${createHash("sha256").update(inline).digest("base64")}'` : null;
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/")) {
      res.setHeader("Content-Security-Policy",
        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; "
        + `script-src 'self'${hash ? ` ${hash}` : ""}; font-src 'self' data:; connect-src 'self'`);
    }
    next();
  });
  app.use(express.static(directory));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(indexFile));
}

export async function reportBootGaps() {
  const donor = await donorStatus();
  if (!donor.ok) console.warn(`  WARNING: ${reportUnavailable(donor)}`);
  const identity = await identityStatus();
  if (!identity.ok) console.warn(`  WARNING: ${identityUnconfigured(identity)}`);
  if (!mailConfigured() && !localOwnerMode()) {
    console.warn("  WARNING: no SMTP configured (FORGE_SMTP_*) — password reset cannot be delivered");
  } else if (mailConfigured() && !process.env.FORGE_PUBLIC_URL && !process.env.FORGE_UI_ORIGIN) {
    console.warn("  WARNING: FORGE_PUBLIC_URL is unset — reset and confirmation links will point at localhost.");
  }
  if (localFallbackArmed()) {
    console.warn("  DEV FALLBACK ARMED — fallback output is for pipeline exercise, not product-quality judgment.");
  }
  if (!isHosted()) {
    const audit = await roleAudit();
    if (audit.reachable && !audit.ok) {
      for (const role of audit.roles.filter(({ status }) => status === "fallback" || status === "missing")) {
        console.warn(`  WARNING: role "${role.role}" wants ${role.configured}; status: ${role.status}${role.resolved ? ` (${role.resolved})` : ""}.`);
      }
    }
  }
}

export async function configureLifecycle(app) {
  registerPublicRoutes(app);
  await seedOperator();
  scheduleDeckSweep();
  scheduleUsagePrune();
  await serveBuiltUi(app);
}
