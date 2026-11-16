// A PowerPoint file's look — its theme's colour scheme and fonts — as a token
// overlay on the project's theme (F8, a PPTX as visual reference). The
// values come from a file a person chose, read deterministically; the model
// never sees them, so the layer rule holds. What cannot carry over is kept
// from the theme and said plainly: a font this server does not have, or a
// colour pair that would not read.
import JSZip from "jszip";
import { DOMParser } from "linkedom";
import path from "node:path";
import { installedFamilies } from "../fonts.js";

const refuse = (code, message) => Object.assign(new Error(message), { code });

const hex = (v) => (typeof v === "string" && /^[0-9A-Fa-f]{6}$/.test(v) ? v.toUpperCase() : null);
const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
const mix = (a, b, t) => toHex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
const lum = (h) => {
  const [r, g, b] = rgb(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const onColour = (bg) => (contrast(bg, "FFFFFF") >= contrast(bg, "0A0A0A") ? "FFFFFF" : "0A0A0A");
const kids = (el) => [...(el?.children ?? [])];
const kid = (el, tag) => kids(el).find((c) => c.tagName === tag) ?? null;

// A scheme colour: an explicit sRGB value, or a system colour's last value.
function schemeColour(slot) {
  const c = kids(slot)[0];
  if (!c) return null;
  if (c.tagName === "a:srgbClr") return hex(c.getAttribute("val"));
  if (c.tagName === "a:sysClr") return hex(c.getAttribute("lastClr"));
  return null;
}



// The theme the first slide master uses, else theme1.
async function themeXml(zip) {
  const rels = await zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels")?.async("string");
  const target = rels ? /Target="([^"]*theme[^"]*\.xml)"/.exec(rels)?.[1] : null;
  const name = target ? path.posix.normalize(path.posix.join("ppt/slideMasters", target)).replace(/^\/+/, "") : "ppt/theme/theme1.xml";
  return (await zip.file(name)?.async("string")) ?? (await zip.file("ppt/theme/theme1.xml")?.async("string")) ?? null;
}

// { source, scheme, fonts, tokens, notes } for a .pptx's bytes.
export async function extractLook(bytes, filename = "presentation.pptx") {
  let zip;
  try { zip = await JSZip.loadAsync(bytes); } catch { throw refuse("file-unreadable", "this file could not be opened as a PowerPoint"); }
  if (!zip.file("ppt/presentation.xml")) throw refuse("file-unsupported", "choose a PowerPoint (.pptx) file");
  const xml = await themeXml(zip);
  if (!xml) throw refuse("no-theme", "this PowerPoint has no theme to take a look from");
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const scheme = {};
  const clr = doc.getElementsByTagName("a:clrScheme")[0];
  for (const slot of kids(clr)) scheme[slot.tagName.replace(/^a:/, "")] = schemeColour(slot);
  const font = (which) => kid(kid(doc.getElementsByTagName("a:fontScheme")[0], which), "a:latin")?.getAttribute("typeface") || null;
  const fonts = { heading: font("a:majorFont"), body: font("a:minorFont") };
  const notes = [];
  const tokens = {};

  const { dk1, lt1, dk2, accent1, accent2 } = scheme;
  if (dk1 && lt1 && accent1) {
    const light = {
      bg: lt1, surface: lum(lt1) > 0.9 ? mix(lt1, "FFFFFF", 0.6) : mix(lt1, "FFFFFF", 0.35),
      ink: dk1, ink_muted: mix(dk1, lt1, 0.35), accent: accent1, accent_alt: accent2 ?? accent1,
      rule: mix(lt1, dk1, 0.15), on_accent: onColour(accent1),
    };
    const darkBg = lum(dk1) < 0.05 ? dk1 : (dk2 && lum(dk2) < 0.05 ? dk2 : "1E1E1E");
    const dark = {
      bg: darkBg, surface: mix(darkBg, lt1, 0.08), ink: lt1, ink_muted: mix(lt1, darkBg, 0.3),
      accent: accent1, accent_alt: accent2 ?? accent1, rule: mix(darkBg, lt1, 0.12), on_accent: onColour(accent1),
    };
    if (contrast(light.ink, light.bg) >= 4.5) tokens.palette = Object.fromEntries(Object.entries(light).map(([k, v]) => [k, `#${v}`]));
    else notes.push("its text and background colours are too close to read, so the theme's colours are kept");
    if (contrast(dark.ink, dark.bg) >= 4.5) tokens.dark = Object.fromEntries(Object.entries(dark).map(([k, v]) => [k, `#${v}`]));
    const titleBg = dk2 && contrast(dk2, lt1) >= 4.5 ? dk2 : dk1;
    if (tokens.palette && contrast(titleBg, lt1) >= 4.5) {
      const onSection = onColour(accent1);
      tokens.surfaces = {
        title: { bg: `#${titleBg}`, ink: `#${lt1}`, muted: `#${mix(lt1, titleBg, 0.3)}`, accent: `#${accent2 ?? accent1}` },
        section: { bg: `#${accent1}`, ink: `#${onSection}`, muted: `#${mix(onSection, accent1, 0.25)}` },
      };
    }
  } else {
    notes.push("its colour scheme is incomplete, so the theme's colours are kept");
  }

  const installed = new Set(await installedFamilies());
  const type = {};
  if (fonts.heading && installed.has(fonts.heading)) for (const role of ["display", "heading", "stat"]) type[role] = { family: fonts.heading };
  else if (fonts.heading) notes.push(`${fonts.heading} is not available here, so the theme's heading font is kept`);
  if (fonts.body && installed.has(fonts.body)) for (const role of ["subhead", "body", "caption", "eyebrow"]) type[role] = { family: fonts.body };
  else if (fonts.body && fonts.body !== fonts.heading) notes.push(`${fonts.body} is not available here, so the theme's body font is kept`);
  if (Object.keys(type).length) tokens.type = type;

  if (!tokens.palette && !tokens.type) throw refuse("no-look", `nothing in this PowerPoint's theme could be used: ${notes.join("; ")}`);
  return { source: String(filename).slice(0, 200), scheme, fonts, tokens, notes };
}

// A theme document with a look laid over its tokens.
export function withLook(themeDoc, look) {
  if (!look?.tokens) return themeDoc;
  const merge = (a, b) => {
    if (!b || typeof b !== "object" || Array.isArray(b)) return b;
    const out = { ...(a && typeof a === "object" && !Array.isArray(a) ? a : {}) };
    for (const [k, v] of Object.entries(b)) out[k] = merge(out[k], v);
    return out;
  };
  return { ...themeDoc, tokens: merge(themeDoc.tokens ?? {}, look.tokens) };
}
