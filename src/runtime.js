import { readFileSync, existsSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { CONFIG } from "./paths.js";

const FILE = () => path.join(CONFIG, "runtime.json");

const SETTINGS = {
  sweepDays: {
    env: "FORGE_SWEEP_DAYS",
    label: "Delete decks after N days idle",
    parse: (v) => {
      if (v === null || v === "" || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    },
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
  autoWeeklyTokens: { env: "FORGE_AUTO_WEEKLY_TOKENS", label: "Tokens per week", parse: posInt, fallback: 550000 },
  autoTrialTokens: { env: "FORGE_AUTO_TRIAL_TOKENS", label: "Free trial (tokens, lifetime)", parse: posInt, fallback: 420000 },
};

function posInt(v) {
  if (v === null || v === "" || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export const SETTING_KEYS = Object.keys(SETTINGS);

export const settingDefault = (name) => SETTINGS[name]?.fallback;

function stored() {
  try {
    if (!existsSync(FILE())) return {};
    const j = JSON.parse(readFileSync(FILE(), "utf8"));
    return j && typeof j === "object" ? (j.settings ?? {}) : {};
  } catch {
    return {};
  }
}

export function setting(name) {
  const spec = SETTINGS[name];
  if (!spec) throw new Error(`unknown setting: ${name}`);
  const envRaw = process.env[spec.env];
  const envValue = spec.parse(envRaw === undefined ? null : envRaw);
  const store = stored();

  if (Object.prototype.hasOwnProperty.call(store, name)) {
    const v = spec.parse(store[name]);
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

export const settingValue = (name) => setting(name).value;

export function settingsReport() {
  return Object.fromEntries(
    SETTING_KEYS.map((k) => [k, { ...setting(k), label: SETTINGS[k].label, env: SETTINGS[k].env }]),
  );
}

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
