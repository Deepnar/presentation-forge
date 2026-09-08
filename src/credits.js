import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

export const CREDITS_JSON = path.join("assets", "auto", "credits.json");
export const CREDITS_MD = "CREDITS.md";

export const NON_CITABLE_SOURCES = new Set([
  "flickr", "rawpixel", "stocksnap", "sketchfab", "thingiverse", "nappy",
  "woc_tech", "justtakeitfree", "svgsilh", "wordpress", "unsplash", "pixabay",
  "pexels", "picjumbo", "500px", "shutterstock", "adobestock", "gettyimages",
]);

export function providerOf(source) {
  const s = String(source ?? "").trim().toLowerCase();
  if (!s) return "";
  return s.includes("/") ? s.slice(s.indexOf("/") + 1) : s;
}

export function isCitable(credit) {
  const provider = providerOf(credit?.source);
  if (!provider) return false;
  return !NON_CITABLE_SOURCES.has(provider);
}

export function sourceLabel(source) {
  const provider = providerOf(source);
  const named = {
    "wikimedia-commons": "Wikimedia Commons",
    wikimedia: "Wikimedia Commons",
    nasa: "NASA",
    met: "Metropolitan Museum of Art",
    europeana: "Europeana",
    inaturalist: "iNaturalist",
    spacex: "SpaceX",
    nypl: "New York Public Library",
    smk: "National Gallery of Denmark",
    bio_diversity: "Biodiversity Heritage Library",
    geographorguk: "Geograph Britain and Ireland",
    wellcome_collection: "Wellcome Collection",
    clevelandmuseum: "Cleveland Museum of Art",
    brooklynmuseum: "Brooklyn Museum",
    rijksmuseum: "Rijksmuseum",
    sciencemuseum: "Science Museum",
    museumsvictoria: "Museums Victoria",
    digitaltmuseum: "Digitalt Museum",
    phylopic: "PhyloPic",
    WoRMS: "World Register of Marine Species",
  }[provider];
  if (named) return named;
  if (provider.startsWith("smithsonian")) {
    const unit = provider.replace(/^smithsonian_?/, "").replace(/_/g, " ").trim();
    return unit ? `Smithsonian Institution — ${unit}` : "Smithsonian Institution";
  }
  return provider.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function creditText(c) {
  const what = c?.title || c?.query || "Untitled image";
  const who = c?.creator ? ` by ${c.creator}` : "";
  const lic = c?.licence ? `. ${c.licence}` : "";
  const via = c?.source ? `. Via ${sourceLabel(c.source)}` : "";
  return `${what}${who}${lic}${via}.`;
}

export function creditMarkdown(c) {
  const what = c?.title || c?.query || "Untitled image";
  const who = c?.creator ? ` by ${c.creator}` : "";
  const lic = c?.licence_url ? `[${c.licence}](${c.licence_url})` : (c?.licence ?? "");
  const where = c?.landing ? ` — [source](${c.landing})` : "";
  return `- **${what}**${who}. ${lic}${where}`;
}

export async function readCredits(deckDir) {
  try {
    const raw = await readFile(path.join(deckDir, CREDITS_JSON), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeCredits(deckDir, credits) {
  if (!credits.length) return;
  await mkdir(path.join(deckDir, "assets", "auto"), { recursive: true });
  await writeFile(path.join(deckDir, CREDITS_JSON), `${JSON.stringify(credits, null, 2)}\n`, "utf8");

  const owed = credits.filter((c) => c.attribution_required);
  const free = credits.filter((c) => !c.attribution_required);
  const lines = ["# Image credits", ""];
  if (owed.length) {
    lines.push(
      "These images are used under licences that REQUIRE attribution. Keep this",
      "list with the deck — on a credits slide, or in the report's appendix.",
      "",
      ...owed.map(creditMarkdown),
      "",
    );
  }
  if (free.length) {
    lines.push(
      "Public domain / CC0 — no attribution required, listed for provenance.",
      "",
      ...free.map(creditMarkdown),
      "",
    );
  }
  await writeFile(path.join(deckDir, CREDITS_MD), lines.join("\n"), "utf8");
}

const NAME_MAX = 30;
const CONTRIBUTION_MAX = 60;
const ITEMS_MAX = 12;

const clip = (s, n) => {
  const t = String(s ?? "").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
};

export function creditsSlide(credits) {
  const owed = (credits ?? []).filter((c) => c?.attribution_required);
  if (!owed.length) return null;

  const items = owed.slice(0, ITEMS_MAX).map((c) => {
    const where = c.slide ? `Slide ${c.slide}` : null;
    const source = sourceLabel(c.source);
    const creator = String(c.creator ?? "").trim();
    const nameFits = creator && creator.length <= NAME_MAX;
    return nameFits || !creator
      ? {
          name: clip(creator || source || "Unknown", NAME_MAX),
          contribution: clip([where, c.licence, creator ? source : null].filter(Boolean).join(" · "), CONTRIBUTION_MAX),
        }
      : {
          name: clip(source || "Unknown", NAME_MAX),
          contribution: clip([where, c.licence, creator].filter(Boolean).join(" · "), CONTRIBUTION_MAX),
        };
  });

  const overflow = owed.length - items.length;
  const standfirst = overflow > 0
    ? `Images used under licence. ${overflow} further credit${overflow > 1 ? "s" : ""} in CREDITS.md.`
    : "Images used under the licences shown.";

  return { type: "attribution", headline: "Image credits", standfirst, items };
}
