import { readdir, stat, readFile, rm } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { DECKS } from "./paths.js";
import { sendMail, sweepMailBody, sweepMailConfigured } from "./mail.js";

/**
 * The monthly sweep — the thing that keeps a friend's home server from becoming
 * cloud storage. Decks older than `olderThanDays` are deleted EXCEPT ones
 * marked keep (`meta.keep: true`), people download daily to local machines, so
 * the server only ever holds recent work plus what is explicitly kept.
 *
 * Runs from the server's scheduler (src/ai pipeline boot) and from the CLI
 * (`npm run sweep` / `forge sweep`), so a cron line works just as well as the
 * in-process timer. The email is sent whether or not anything was deleted, so
 * the owner knows the sweep ran.
 */

export const SWEEP_DEFAULT_DAYS = 30;

export async function sweep({ olderThanDays = SWEEP_DEFAULT_DAYS, dryRun = false } = {}) {
  const now = Date.now();
  const cutoff = now - Number(olderThanDays) * 24 * 60 * 60 * 1000;

  let entries = [];
  try {
    entries = await readdir(DECKS, { withFileTypes: true });
  } catch {
    return { olderThanDays, deleted: [], skipped: [], errors: [] };
  }

  const willDelete = [];
  const deleted = [];
  const skipped = [];
  const errors = [];

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".") || e.name.startsWith("_")) continue; // cache and public examples
    const dir = path.join(DECKS, e.name);
    let meta = {};
    try {
      meta = YAML.parse(await readFile(path.join(dir, "meta.yaml"), "utf8")) ?? {};
    } catch { /* no meta — legacy deck */ }
    if (meta.public) { skipped.push({ slug: e.name, title: meta.brief ?? meta.title ?? e.name, reason: "public example" }); continue; }

    let updated = now;
    for (const f of ["meta.yaml", "deck.yaml", "report.yaml"]) {
      try {
        updated = (await stat(path.join(dir, f))).mtimeMs;
        break;
      } catch { /* try next */ }
    }

    const record = { slug: e.name, title: meta.brief ?? meta.title ?? e.name };
    if (meta.keep) { skipped.push({ ...record, reason: "marked keep" }); continue; }
    if (updated >= cutoff) continue; // recent enough — stays

    willDelete.push(record);
    if (dryRun) continue;
    try {
      await rm(dir, { recursive: true, force: true });
      deleted.push(record);
    } catch (err) {
      errors.push({ ...record, error: err.message });
    }
  }

  // Always mail, so the owner knows the sweep ran — listing what it will do on
  // a dry run, what it did otherwise.
  if (sweepMailConfigured()) {
    const subject = dryRun ? "Forge sweep preview" : "Forge monthly sweep complete";
    await sendMail({
      subject,
      body: sweepMailBody({ deleted, willDelete, olderThanDays }),
    }).catch((err) => errors.push({ error: `mail: ${err.message}` }));
  }

  return { olderThanDays, deleted, willDelete, skipped, errors, dryRun };
}

/* --------------------------------------------------------------------- CLI */

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const daysArg = argv.indexOf("--days");
  const r = await sweep({
    olderThanDays: daysArg > -1 ? Number(argv[daysArg + 1]) : SWEEP_DEFAULT_DAYS,
    dryRun: argv.includes("--dry-run"),
  });
  console.log(`  sweep ${r.dryRun ? "(dry run) " : ""}— ${r.olderThanDays} days`);
  for (const d of r.willDelete) console.log(`  would delete: ${d.title} (${d.slug})`);
  for (const d of r.deleted) console.log(`  deleted: ${d.title} (${d.slug})`);
  for (const s of r.skipped) console.log(`  kept: ${s.title} (${s.slug}) — ${s.reason}`);
  for (const e of r.errors) console.error(`  ! ${e.error}${e.slug ? ` (${e.slug})` : ""}`);
}
