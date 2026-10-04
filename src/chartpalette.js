// Compatibility facade: the canonical chart-palette implementation lives
// in packages/core/chartpalette.ts. Re-exported unchanged so existing
// layout, composition, and test callers keep working.
export {
  parseHex,
  luminance,
  contrast,
  rgbToHsl,
  hslToHex,
  ensureContrast,
  isMonochrome,
  lab,
  deltaE,
  chartSeries,
} from "../packages/core/chartpalette.ts";
