/**
 * The model-mode preference: AUTO (TCET) or CLOUD (BYOK). Lives on the client
 * (pub/sub) so every picker reacts to the header toggle instantly; persisted
 * truth is config/local.yaml's `routing.default`, rehydrated from /api/cloud.
 * Default is AUTO (free shared gateway).
 */
const listeners = new Set();
let mode = "auto"; // auto | cloud

export function getModelMode() {
  return mode;
}

export function setModelMode(next) {
  if (next !== "auto" && next !== "cloud") {
    if (next === "local") next = "auto"; // legacy
    else return;
  }
  if (next === mode) return;
  mode = next;
  listeners.forEach((fn) => fn(mode));
}

export function subscribeModelMode(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
