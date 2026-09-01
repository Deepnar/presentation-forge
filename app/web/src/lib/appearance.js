/**
 * Appearance — the light/dark preference, and the only place that decides
 * which theme is actually in force.
 *
 * Three modes, not two: "system" follows the OS and must keep following it
 * while the app is open, so a preference of "light" and a resolved theme of
 * "light" are different facts and are stored as different attributes. The
 * resolved value lands on `data-theme` (what the tokens key off) and the mode
 * on `data-appearance` (what the settings control reads back).
 *
 * The pre-paint script in index.html duplicates the read below. It has to:
 * a module that resolves after first paint flashes the wrong ground. Keep the
 * storage key and the fallback order identical in both.
 */
const KEY = "forge.theme";
const MODES = new Set(["light", "dark", "system"]);

/** Light is the product's default. "system" is opt-in, never inferred. */
const DEFAULT_MODE = "light";

const listeners = new Set();
let mode = read();

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return MODES.has(raw) ? raw : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

const darkQuery = () =>
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

/** The theme a mode resolves to right now. */
export function resolveTheme(m = mode) {
  if (m === "system") return darkQuery()?.matches ? "dark" : "light";
  return m === "dark" ? "dark" : "light";
}

export function getAppearance() {
  return mode;
}

export function getTheme() {
  return resolveTheme(mode);
}

/**
 * The browser chrome colour has to track the ground or a phone paints its
 * status bar the wrong shade over a dark page.
 */
function paintChrome(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0A0A0C" : "#FBFBFD");
}

function apply() {
  const theme = resolveTheme(mode);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.appearance = mode;
  // Native form controls, scrollbars and the like read this, and they look
  // wrong against a dark ground without it.
  root.style.colorScheme = theme;
  paintChrome(theme);
  for (const fn of listeners) fn(mode, theme);
}

export function setAppearance(next) {
  if (!MODES.has(next)) return;
  mode = next;
  try { localStorage.setItem(KEY, next); } catch {}
  apply();
}

export function subscribeAppearance(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Called once at boot. The media-query listener is permanent rather than
 * attached only while the mode is "system": switching away and back would
 * otherwise leave the app deaf to an OS change until a reload.
 */
export function startAppearance() {
  apply();
  const q = darkQuery();
  q?.addEventListener?.("change", () => { if (mode === "system") apply(); });
  // Another tab changing the preference should not leave this one disagreeing.
  window.addEventListener?.("storage", (e) => {
    if (e.key !== KEY) return;
    const next = MODES.has(e.newValue) ? e.newValue : DEFAULT_MODE;
    if (next === mode) return;
    mode = next;
    apply();
  });
}
