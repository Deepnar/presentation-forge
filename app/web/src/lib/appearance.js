const KEY = "forge.theme";
const MODES = new Set(["light", "dark", "system"]);

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

function paintChrome(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0A0A0C" : "#FBFBFD");
}

function apply() {
  const theme = resolveTheme(mode);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.appearance = mode;
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

export function startAppearance() {
  apply();
  const q = darkQuery();
  q?.addEventListener?.("change", () => { if (mode === "system") apply(); });
  window.addEventListener?.("storage", (e) => {
    if (e.key !== KEY) return;
    const next = MODES.has(e.newValue) ? e.newValue : DEFAULT_MODE;
    if (next === mode) return;
    mode = next;
    apply();
  });
}
