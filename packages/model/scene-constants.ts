// Canonical scene dimensions. Single authority for the 13.333 x 7.5
// canvas: scene.schema.json repeats the same consts, and the drift test
// proves they agree. Import this module — not the heavier validator —
// when only the dimensions are needed.

export const SCENE_W = 13.333;
export const SCENE_H = 7.5;

// System chrome: locked, compiler-owned, with no authored block
// behind it (branding, headers, footers, structural marks — see
// packages/compiler/chrome.ts, which emits exactly this triple).
// ONE shared definition for the browser adapter, the engine, and
// tests: no normal user command may unlock it, from any path.
// Lives here (not in commands.ts or scene-text.js) so light
// browser modules import it without the AJV validator.
export function isSystemChrome(el: unknown): boolean {
  if (typeof el !== "object" || el === null) return false;
  const e = el as { locked?: unknown; provenance?: unknown; semanticRef?: unknown };
  return e.locked === true && e.provenance === "compiler" && e.semanticRef === undefined;
}
