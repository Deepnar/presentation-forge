// Compatibility facade: the canonical fitting implementation lives in
// packages/core/fit.ts. This module preserves the legacy API exactly,
// including the process-global floor-event sink for existing callers
// (notably src/render.js). New code passes an explicit events array to
// the core functions instead of using these globals.
import {
  measure,
  lineCount,
  heightOf,
  fitScale as coreFitScale,
  fitScaleAll as coreFitScaleAll,
  fitOneLine as coreFitOneLine,
  floorOf,
} from "../packages/core/fit.ts";

export { measure, lineCount, heightOf, floorOf };

let floorEvents = [];
export function resetFloorEvents() { floorEvents = []; }
export function drainFloorEvents() { const e = floorEvents; floorEvents = []; return e; }

export function fitScale(text, width, height, style, opts = {}) {
  return coreFitScale(text, width, height, style, { ...opts, events: floorEvents });
}

export function fitScaleAll(texts, width, height, style, opts) {
  return coreFitScaleAll(texts, width, height, style, { ...opts, events: floorEvents });
}

export function fitOneLine(text, width, style, opts = {}) {
  return coreFitOneLine(text, width, style, { ...opts, events: floorEvents });
}
