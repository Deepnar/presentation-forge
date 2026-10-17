// Scene-driven browser font loading. Layer C stays authoritative:
// families and weights come from compiled scene runs, never from a
// second theme-typography system. Static families load their latin
// woff2 through LOADERS below (Vite code-splits per file and hashes
// the asset); Inter and IBM Plex Mono ride the existing static
// package imports. Every face is injected as @font-face the first
// time a deck needs it, then awaited via the Font Loading API —
// screenshots gate on the result instead of racing substitutions.
//
// Usage: `await ensureDeckFonts(scenes)` after mount and on every
// deck change. Results feed the viewer's data-fonts-ready /
// data-missing-fonts readout (and the smoke test's font gate).
// Requested weights resolve to the nearest shipped face (browser
// fallback matching); families outside the map report missing
// rather than silently substituting.

// family -> weights shipped ("variable" = full range).
export const FONT_COVERAGE = {
  "IBM Plex Mono": [400, 500, 600, 700],
  "Inter": "variable",
  "Anton": [400],
  "Archivo Black": [400],
  "Bebas Neue": [400],
  "Bodoni Moda": [700],
  "Cormorant Garamond": [700],
  "Fraunces": [500, 600, 700],
  "IBM Plex Sans": [400, 500, 600, 700],
  "Karla": [400, 600, 700],
  "Lora": [400, 500, 600],
  "Manrope": [400, 500, 600, 700],
  "Merriweather": [300, 400, 700, 900],
  "Oswald": [500],
  "Outfit": [600, 700],
  "Playfair Display": [700],
  "Poppins": [600, 700],
  "Public Sans": [700],
  "Source Serif 4": [400, 600, 700],
  "Space Grotesk": [400, 500, 600, 700],
  "Syne": [600, 700],
};

// Every shipped static face as data (tests, drivers) with its
// loader. Specifiers must stay literal so Vite can split and hash
// each file.
export const FONT_FILES = [
  { family: "Anton", weight: 400, load: () => import("@fontsource/anton/files/anton-latin-400-normal.woff2") },
  { family: "Archivo Black", weight: 400, load: () => import("@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff2") },
  { family: "Bebas Neue", weight: 400, load: () => import("@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2") },
  { family: "Bodoni Moda", weight: 700, load: () => import("@fontsource/bodoni-moda/files/bodoni-moda-latin-700-normal.woff2") },
  { family: "Cormorant Garamond", weight: 700, load: () => import("@fontsource/cormorant-garamond/files/cormorant-garamond-latin-700-normal.woff2") },
  { family: "Fraunces", weight: 500, load: () => import("@fontsource/fraunces/files/fraunces-latin-500-normal.woff2") },
  { family: "Fraunces", weight: 600, load: () => import("@fontsource/fraunces/files/fraunces-latin-600-normal.woff2") },
  { family: "Fraunces", weight: 700, load: () => import("@fontsource/fraunces/files/fraunces-latin-700-normal.woff2") },
  { family: "IBM Plex Sans", weight: 400, load: () => import("@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2") },
  { family: "IBM Plex Sans", weight: 500, load: () => import("@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2") },
  { family: "IBM Plex Sans", weight: 600, load: () => import("@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2") },
  { family: "IBM Plex Sans", weight: 700, load: () => import("@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff2") },
  { family: "Karla", weight: 400, load: () => import("@fontsource/karla/files/karla-latin-400-normal.woff2") },
  { family: "Karla", weight: 600, load: () => import("@fontsource/karla/files/karla-latin-600-normal.woff2") },
  { family: "Karla", weight: 700, load: () => import("@fontsource/karla/files/karla-latin-700-normal.woff2") },
  { family: "Lora", weight: 400, load: () => import("@fontsource/lora/files/lora-latin-400-normal.woff2") },
  { family: "Lora", weight: 500, load: () => import("@fontsource/lora/files/lora-latin-500-normal.woff2") },
  { family: "Lora", weight: 600, load: () => import("@fontsource/lora/files/lora-latin-600-normal.woff2") },
  { family: "Manrope", weight: 400, load: () => import("@fontsource/manrope/files/manrope-latin-400-normal.woff2") },
  { family: "Manrope", weight: 500, load: () => import("@fontsource/manrope/files/manrope-latin-500-normal.woff2") },
  { family: "Manrope", weight: 600, load: () => import("@fontsource/manrope/files/manrope-latin-600-normal.woff2") },
  { family: "Manrope", weight: 700, load: () => import("@fontsource/manrope/files/manrope-latin-700-normal.woff2") },
  { family: "Merriweather", weight: 300, load: () => import("@fontsource/merriweather/files/merriweather-latin-300-normal.woff2") },
  { family: "Merriweather", weight: 400, load: () => import("@fontsource/merriweather/files/merriweather-latin-400-normal.woff2") },
  { family: "Merriweather", weight: 700, load: () => import("@fontsource/merriweather/files/merriweather-latin-700-normal.woff2") },
  { family: "Merriweather", weight: 900, load: () => import("@fontsource/merriweather/files/merriweather-latin-900-normal.woff2") },
  { family: "Oswald", weight: 500, load: () => import("@fontsource/oswald/files/oswald-latin-500-normal.woff2") },
  { family: "Outfit", weight: 600, load: () => import("@fontsource/outfit/files/outfit-latin-600-normal.woff2") },
  { family: "Outfit", weight: 700, load: () => import("@fontsource/outfit/files/outfit-latin-700-normal.woff2") },
  { family: "Playfair Display", weight: 700, load: () => import("@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff2") },
  { family: "Poppins", weight: 600, load: () => import("@fontsource/poppins/files/poppins-latin-600-normal.woff2") },
  { family: "Poppins", weight: 700, load: () => import("@fontsource/poppins/files/poppins-latin-700-normal.woff2") },
  { family: "Public Sans", weight: 700, load: () => import("@fontsource/public-sans/files/public-sans-latin-700-normal.woff2") },
  { family: "Source Serif 4", weight: 400, load: () => import("@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff2") },
  { family: "Source Serif 4", weight: 600, load: () => import("@fontsource/source-serif-4/files/source-serif-4-latin-600-normal.woff2") },
  { family: "Source Serif 4", weight: 700, load: () => import("@fontsource/source-serif-4/files/source-serif-4-latin-700-normal.woff2") },
  { family: "Space Grotesk", weight: 400, load: () => import("@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff2") },
  { family: "Space Grotesk", weight: 500, load: () => import("@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff2") },
  { family: "Space Grotesk", weight: 600, load: () => import("@fontsource/space-grotesk/files/space-grotesk-latin-600-normal.woff2") },
  { family: "Space Grotesk", weight: 700, load: () => import("@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2") },
  { family: "Syne", weight: 600, load: () => import("@fontsource/syne/files/syne-latin-600-normal.woff2") },
  { family: "Syne", weight: 700, load: () => import("@fontsource/syne/files/syne-latin-700-normal.woff2") },
];

// family|weight -> woff2 URL module. Specifiers stay literal so
// Vite can split and hash each file.
const LOADERS = Object.fromEntries(
  FONT_FILES.map((f) => [`${f.family}|${f.weight}`, f.load]),
);

const injected = new Map();

function injectFace(family, weight, url) {
  const key = `${family}|${weight}`;
  if (injected.has(key)) return injected.get(key);
  const css = `@font-face{font-family:${JSON.stringify(family)};font-style:normal;font-display:swap;font-weight:${weight};src:url(${JSON.stringify(url)}) format("woff2");}`;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  injected.set(key, sheet);
  return sheet;
}

function releaseFailedFace(family, weight, sheet) {
  const key = `${family}|${weight}`;
  if (!sheet || injected.get(key) !== sheet) return;
  // Chrome retains the error on a FontFace after its request fails. A fresh
  // rule permits a real retry; an older attempt must not remove a newer rule.
  document.adoptedStyleSheets = document.adoptedStyleSheets.filter(item => item !== sheet);
  injected.delete(key);
}

function collectRuns(scenes) {
  const out = [];
  const walk = (els) => {
    for (const el of els ?? []) {
      for (const p of el.paragraphs ?? []) {
        for (const r of p.runs ?? []) out.push(r);
      }
      if (el.chart?.labels) {
        out.push({ family: el.chart.labels.family, weight: 400, size: el.chart.labels.size });
      }
      if (el.table?.layout?.fontFamily) {
        out.push({ family: el.table.layout.fontFamily, weight: 400 });
      }
      walk(el.group?.children);
    }
  };
  for (const s of scenes ?? []) walk(s.elements);
  return out;
}

function nearestWeight(family, want) {
  const cov = FONT_COVERAGE[family];
  if (cov === "variable") return want;
  if (!Array.isArray(cov)) return null;
  let best = cov[0];
  for (const w of cov) {
    if (Math.abs(w - want) < Math.abs(best - want)) best = w;
  }
  return best;
}

const cache = new Map();

export async function ensureDeckFonts(scenes) {
  const key = JSON.stringify(
    [...new Set(collectRuns(scenes).map((r) => `${r.family ?? ""}|${r.weight ?? 400}|${r.italic ? "i" : ""}`))].sort(),
  );
  if (!cache.has(key)) {
    const pending = loadFaces(key);
    cache.set(key, pending);
    // A network failure is a failed attempt, not permanent font coverage.
    pending.then(result => { if (!result.ready && cache.get(key) === pending) cache.delete(key); }, () => { if (cache.get(key) === pending) cache.delete(key); });
  }
  return cache.get(key);
}

async function loadFaces(key) {
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc?.fonts) return { ready: false, loaded: [], missing: ["no-font-api"] };
  const needs = new Map();
  for (const part of JSON.parse(key)) {
    const [family, weight, italic] = part.split("|");
    if (!family) continue;
    const w = Number(weight) || 400;
    const style = italic === "i" ? "italic" : "normal";
    const ship = nearestWeight(family, w);
    if (ship === null || !(family in FONT_COVERAGE)) {
      needs.set(`${family}|*`, { family, missing: true });
      continue;
    }
    needs.set(`${family}|${ship}|${style}`, { family, weight: ship, want: w, style });
  }
  const loaded = [];
  const missing = [], unsupported = [];
  await Promise.all([...needs.values()].map(async (n) => {
    if (n.missing) {
      missing.push(n.family); unsupported.push(n.family);
      return;
    }
    let sheet;
    try {
      const loader = LOADERS[`${n.family}|${n.weight}`];
      if (loader) {
        const mod = await loader();
        sheet = injectFace(n.family, n.weight, mod.default);
      }
      // Inter / IBM Plex Mono ride static imports; everything else
      // was just injected above. Either way, verify truthfully.
      const spec = `${n.style} ${n.want} 16px "${n.family}"`;
      await doc.fonts.load(spec);
      if (doc.fonts.check(spec)) loaded.push(`${n.family}:${n.want}`);
      else { releaseFailedFace(n.family, n.weight, sheet); missing.push(`${n.family}:${n.want}`); }
    } catch {
      releaseFailedFace(n.family, n.weight, sheet);
      missing.push(`${n.family}:${n.want ?? n.weight}`);
    }
  }));
  try {
    await doc.fonts.ready;
  } catch { /* readiness is best-effort past the per-face checks */ }
  return { ready: missing.length === 0, loaded: [...new Set(loaded)].sort(), missing: [...new Set(missing)].sort(), unsupported: [...new Set(unsupported)].sort() };
}
