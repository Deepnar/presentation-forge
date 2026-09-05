import { readFileSync, existsSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { CONFIG } from "./paths.js";

/**
 * Operating settings an admin can change without a redeploy.
 *
 * The alternative is env only, which on a box somebody is using means a
 * container restart to change one number — so the retention window and the
 * spend caps stayed at whatever they were set to at deploy time, and two of
 * them were invisible besides.
 *
 * PRECEDENCE, and it is the whole design: a stored value WINS over the
 * environment, because a setting you cannot change at runtime is the problem
 * this solves. That direction has a cost — an operator who edits their compose
 * file and redeploys will not see the change if the panel has ever set that
 * key — so nothing here is silent: `settingsReport()` names the source of every
 * value and flags each one that is shadowing an env var, and the panel shows
 * it. An override can be cleared, which hands the setting back to the
 * environment.
 *
 * SECRETS ARE NOT HERE. Keys resolve env-first (see `resolveSecret`), the
 * opposite direction, so a key rotated in the deployment always wins over one
 * typed into a browser months earlier. Rotation must not depend on remembering
 * to clear a database row.
 */

const FILE = () => path.join(CONFIG, "runtime.json");

/** The settings an admin may set, with how to read and validate each one. */
const SETTINGS = {
  sweepDays: {
    env: "FORGE_SWEEP_DAYS",
    label: "Delete decks after N days idle",
    parse: (v) => {
      if (v === null || v === "" || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    },
    // Off is a legitimate value, and it is the default: the server must never
    // start deleting somebody's decks because a setting was mistyped.
    fallback: null,
  },
  openRegistration: {
    env: "FORGE_OPEN_REGISTRATION",
    label: "Anyone may sign up",
    parse: (v) => (v === null || v === undefined || v === "" ? null : !(v === false || v === "0" || v === 0)),
    fallback: true,
  },
  autoWindowHours: { env: "FORGE_AUTO_WINDOW_HOURS", label: "Spend window (hours)", parse: posInt, fallback: 5 },
  autoWindowRequests: { env: "FORGE_AUTO_WINDOW_REQUESTS", label: "Auto runs per window", parse: posInt, fallback: 12 },
  autoWeeklyRequests: { env: "FORGE_AUTO_WEEKLY_REQUESTS", label: "Auto runs per week", parse: posInt, fallback: 30 },
  autoWindowSlides: { env: "FORGE_AUTO_WINDOW_SLIDES", label: "Slides per window", parse: posInt, fallback: 45 },
  autoWeeklySlides: { env: "FORGE_AUTO_WEEKLY_SLIDES", label: "Slides per week", parse: posInt, fallback: 90 },
  autoMaxSlidesPerDeck: { env: "FORGE_AUTO_MAX_SLIDES_PER_DECK", label: "Slides per deck", parse: posInt, fallback: 24 },
  // The weekly token budget — the first cap here that reflects what the
  // operator is actually billed for.
  //
  // DERIVED from the slide budget rather than chosen: 90 slides a week is
  // about four 22-slide decks, and `estimateTokens` puts one of those at ~135K
  // tokens now that each call retrieves only the research it needs, so four is
  // ~550K. Stating the same allowance in both units is the point — the two
  // caps have already contradicted each other twice, at 80,000 (a twentieth of
  // one deck) and 1,000,000 (two thirds of one). Both were survivable only
  // because nothing counted a token. `test/metering.test.js` fails if they
  // disagree about how many decks a week is.
  //
  // This is the ABUSE ceiling, not the product limit — what decides what is
  // free is the lifetime trial below.
  autoWeeklyTokens: { env: "FORGE_AUTO_WEEKLY_TOKENS", label: "Tokens per week", parse: posInt, fallback: 550000 },
  // The FREE TRIAL — a fixed amount that never resets, unlike every other cap
  // here. ~3 decks at the shipped per-deck cost, which is enough to finish one
  // real assignment and discover the tool is good; a free tier that cannot
  // complete one task converts nobody.
  //
  // A lifetime cap rather than a weekly one because a rolling window resets:
  // a user who waits gets unlimited decks forever, so free exposure per
  // account is unbounded. This makes it ~₹5-21 per signup, once — a number
  // that can be budgeted, which is what a one-person operation needs.
  // docs/ECONOMICS.md has the comparison.
  autoTrialTokens: { env: "FORGE_AUTO_TRIAL_TOKENS", label: "Free trial (tokens, lifetime)", parse: posInt, fallback: 420000 },
};

function posInt(v) {
  if (v === null || v === "" || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export const SETTING_KEYS = Object.keys(SETTINGS);

/** A setting's shipped default, ignoring env and stored overrides. What the
 *  free tier is out of the box, which is a different question from what this
 *  particular box is currently configured for. */
export const settingDefault = (name) => SETTINGS[name]?.fallback;

/** Read synchronously: every caller is on a hot path and the file is tiny. */
function stored() {
  try {
    if (!existsSync(FILE())) return {};
    const j = JSON.parse(readFileSync(FILE(), "utf8"));
    return j && typeof j === "object" ? (j.settings ?? {}) : {};
  } catch {
    return {};
  }
}

/**
 * One setting's effective value, and where it came from.
 *
 * `source` is "stored" (an admin set it), "env" (the deployment set it), or
 * "default". `shadowsEnv` marks the case worth seeing: a stored value that is
 * suppressing something the environment also sets.
 */
export function setting(name) {
  const spec = SETTINGS[name];
  if (!spec) throw new Error(`unknown setting: ${name}`);
  const envRaw = process.env[spec.env];
  const envValue = spec.parse(envRaw === undefined ? null : envRaw);
  const store = stored();

  if (Object.prototype.hasOwnProperty.call(store, name)) {
    const v = spec.parse(store[name]);
    // A stored value that does not parse is not a reason to ignore the
    // environment as well.
    if (v !== null || store[name] === null) {
      return {
        value: v === null ? (envValue ?? spec.fallback) : v,
        source: v === null ? (envValue === null ? "default" : "env") : "stored",
        shadowsEnv: v !== null && envValue !== null,
        envValue,
      };
    }
  }
  if (envValue !== null) return { value: envValue, source: "env", shadowsEnv: false, envValue };
  return { value: spec.fallback, source: "default", shadowsEnv: false, envValue: null };
}

/** Just the value, for the call sites that only need to act on it. */
export const settingValue = (name) => setting(name).value;

/** Every setting, its value, its source, and what it is shadowing. */
export function settingsReport() {
  return Object.fromEntries(
    SETTING_KEYS.map((k) => [k, { ...setting(k), label: SETTINGS[k].label, env: SETTINGS[k].env }]),
  );
}

/**
 * Store an override, or clear one by passing null.
 *
 * Clearing removes the key rather than storing a null, so the setting falls
 * back to the environment — "unset" and "set to nothing" are different answers
 * and the file has to be able to say both.
 */
export async function setSetting(name, value) {
  const spec = SETTINGS[name];
  if (!spec) throw new Error(`unknown setting: ${name}`);
  const store = stored();
  if (value === null || value === undefined || value === "") {
    delete store[name];
  } else {
    const parsed = spec.parse(value);
    if (parsed === null) throw new Error(`${name}: "${value}" is not a valid value`);
    store[name] = parsed;
  }
  await mkdir(CONFIG, { recursive: true });
  await writeFile(FILE(), `${JSON.stringify({ settings: store, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  return setting(name);
}
