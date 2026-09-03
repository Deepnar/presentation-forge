#!/usr/bin/env node
/**
 * What it would actually cost to pay the divider-surface contrast debt.
 *
 * `test/contrast.test.js` carries an OWED list — surfaces whose secondary text
 * clears the 3:1 headline floor but not the 4.5:1 floor for muted type — and
 * reads as a to-do list twenty-four items long. It is not one, and this says
 * why: for most of them the muted token is not the constraint, the ground is.
 *
 * `muted` is a dimmed `ink`. It may move toward ink; it may not cross the
 * background and come out the other side, because a section divider with dark
 * secondary text on a saturated ground under white headline type is a different
 * design, not a repaired one. That single constraint splits the list three ways:
 *
 *   unpayable   even `ink` — usually pure white — does not clear 4.5:1 against
 *               this ground, so nothing dimmer can. Changing the background is
 *               the only fix, and that is the theme's identity.
 *   collapsing  reachable only by moving muted so far into ink that the two are
 *               the same colour. The debt is paid and the distinction it
 *               existed to express is gone.
 *   payable     reaches 4.5:1 and still reads as secondary.
 *
 *   node tools/contrast-debt.mjs           # the three lists
 *   node tools/contrast-debt.mjs --apply   # rewrite the payable themes' muted
 *
 * `--apply` moves each payable theme's muted the minimum distance toward its
 * own ink, so the edit is the smallest one that clears the floor.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { listThemes, loadTheme } from "../src/theme.js";
import { contrast } from "../src/chartpalette.js";
import { THEMES } from "../src/paths.js";

const TARGET = 4.55;        // a hair over 4.5, so rounding cannot reopen the debt
const DISTINCT = 1.35;      // below this, muted has stopped being distinguishable from ink

const toRgb = (h) => { const s = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
const toHex = (a) => `#${a.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** The least movement toward `ink` that clears TARGET, or null if none does. */
function nudge(muted, ink, bg) {
  const from = toRgb(muted), to = toRgb(ink);
  let lo = 0, hi = 1, best = null;
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    const c = toHex(mix(from, to, t));
    if (contrast(c, bg) >= TARGET) { best = c; hi = t; } else lo = t;
  }
  return best;
}

export async function debt() {
  const unpayable = [], collapsing = [], payable = [];
  for (const name of await listThemes()) {
    const theme = await loadTheme(name);
    const s = theme.surfaces?.section;
    if (!s) continue;
    const now = contrast(s.muted, s.bg);
    if (now >= 4.5) continue;

    const inkRatio = contrast(s.ink, s.bg);
    const row = { name, bg: s.bg, ink: s.ink, muted: s.muted, now, inkRatio };

    // Nothing dimmer than ink can beat ink. If ink itself is short, the ground
    // is the constraint and no token edit reaches the floor.
    if (inkRatio < TARGET) { unpayable.push(row); continue; }

    const next = nudge(s.muted, s.ink, s.bg);
    if (!next) { unpayable.push(row); continue; }
    const vsInk = contrast(next, s.ink);
    (vsInk >= DISTINCT ? payable : collapsing).push({ ...row, next, vsInk, nextRatio: contrast(next, s.bg) });
  }
  return { unpayable, collapsing, payable };
}

async function apply(rows) {
  for (const r of rows) {
    const file = path.join(THEMES, `${r.name}.yaml`);
    const text = await readFile(file, "utf8");
    // Replace only the muted inside the `section:` surface, never the title's.
    const marker = text.indexOf("section:");
    if (marker < 0) { console.error(`  ! ${r.name}: no section surface`); continue; }
    const head = text.slice(0, marker), tail = text.slice(marker);
    const replaced = tail.replace(/(\bmuted:\s*")([^"]+)(")/, `$1${r.next}$3`);
    if (replaced === tail) { console.error(`  ! ${r.name}: muted not found under section`); continue; }
    await writeFile(file, head + replaced, "utf8");
    console.log(`  ${r.name}: ${r.muted} -> ${r.next}`);
  }
}

const show = (label, rows, fmt) => {
  console.log(`\n${label} (${rows.length})`);
  for (const r of rows) console.log(`  ${r.name.padEnd(22)} ${fmt(r)}`);
};

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const { unpayable, collapsing, payable } = await debt();
  show("UNPAYABLE — the ground is the constraint, not the token", unpayable,
    (r) => `bg ${r.bg}  ink ${r.ink} reaches only ${r.inkRatio.toFixed(2)}:1, muted ${r.now.toFixed(2)}:1`);
  show(`COLLAPSING — reachable only by making muted indistinguishable from ink (<${DISTINCT}:1)`, collapsing,
    (r) => `${r.muted} -> ${r.next}  ${r.now.toFixed(2)}->${r.nextRatio.toFixed(2)}:1  but ${r.vsInk.toFixed(2)}:1 from ink`);
  show("PAYABLE — clears the floor and still reads as secondary", payable,
    (r) => `${r.muted} -> ${r.next}  ${r.now.toFixed(2)}->${r.nextRatio.toFixed(2)}:1  ${r.vsInk.toFixed(2)}:1 from ink`);

  if (process.argv.includes("--apply")) {
    console.log("\napplying the payable set:");
    await apply(payable);
    console.log("\nRe-run `node --test test/contrast.test.js` and delete the paid lines from OWED.");
  } else {
    console.log("\n--apply rewrites the payable set. The other two need a decision about the ground.");
  }
}
