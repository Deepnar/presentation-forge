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
