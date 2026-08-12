/**
 * The model-mode preference: LOCAL or CLOUD. Lives on the client (a tiny
 * pub/sub) so every picker reacts to the header toggle instantly; the persisted
 * source of truth is config/local.yaml's `routing.default`, rehydrated once at
 * boot from /api/cloud. Default is LOCAL.
 */
const listeners = new Set();
let mode = "local"; // local | cloud

export function getModelMode() {
  return mode;
}

export function setModelMode(next) {
  if (next !== "local" && next !== "cloud") return;
  if (next === mode) return;
  mode = next;
  listeners.forEach((fn) => fn(mode));
}

export function subscribeModelMode(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
