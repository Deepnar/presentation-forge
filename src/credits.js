import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The record of where a supplied picture came from.
 *
 * `src/ai/images.js` writes these; the deck page, the research view and the
 * report read them. It lives here rather than beside the supply because the
 * renderer must not import the model layer — `src/ai/report.js` already imports
 * `src/report.js`, and pointing that arrow both ways is how a headless render
 * ends up pulling in a model client it never calls.
 *
 * A credit is only worth writing if something reads it. Until this module had
 * a reader, auto supply wrote `CREDITS.md` and nothing on any surface mentioned
 * it, which for a CC BY image is the licence breach the tier ladder exists to
 * avoid.
 */

export const CREDITS_JSON = path.join("assets", "auto", "credits.json");
export const CREDITS_MD = "CREDITS.md";

/**
 * Platforms whose images are not a citable source.
 *
 * Openverse aggregates 52 providers and 42 of them are museums, national
 * libraries, archives, government agencies and scientific registers — sources
 * an academic report can name. The exceptions are the consumer upload
 * platforms, and they are the short, stable half, so they are the list.
 *
 * A denylist fails open: a provider added upstream counts as citable until
 * someone says otherwise. That is the right direction here because the
 * alternative — a 42-name allowlist — silently drops a legitimate museum the
 * day Openverse adds it, and a missing credit is worse than a generous one.
 *
 * KNOWN LIMIT: `flickr` carries genuine government and institutional accounts
 * (a NASA or Dept. of Energy photostream) alongside everything else, and the
 * provider name cannot tell them apart. Those are excluded from the report and
 * still shown in the app. Wikimedia Commons is the primary source and is
 * citable, so the case this costs is narrow.
 */
export const NON_CITABLE_SOURCES = new Set([
  "flickr", "rawpixel", "stocksnap", "sketchfab", "thingiverse", "nappy",
  "woc_tech", "justtakeitfree", "svgsilh", "wordpress", "unsplash", "pixabay",
  "pexels", "picjumbo", "500px", "shutterstock", "adobestock", "gettyimages",
]);

/** The provider half of a source tag: "openverse/flickr" -> "flickr". */
export function providerOf(source) {
  const s = String(source ?? "").trim().toLowerCase();
  if (!s) return "";
  return s.includes("/") ? s.slice(s.indexOf("/") + 1) : s;
}

/**
 * Whether a credit names a source a report can cite.
 *
 * The report is the graded artefact, so it lists provenance a reader would
 * accept — Wikimedia Commons, a museum, an archive, a government agency. A
 * stock photograph is a real credit and belongs on the app's surfaces, but
 * putting it in an academic bibliography misrepresents what it is.
 */
export function isCitable(credit) {
  const provider = providerOf(credit?.source);
  if (!provider) return false;
  return !NON_CITABLE_SOURCES.has(provider);
}

/** A source's display name — "wikimedia-commons" reads badly in a report. */
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
  // Openverse's Smithsonian units arrive as one slug per museum.
  if (provider.startsWith("smithsonian")) {
    const unit = provider.replace(/^smithsonian_?/, "").replace(/_/g, " ").trim();
    return unit ? `Smithsonian Institution — ${unit}` : "Smithsonian Institution";
  }
  return provider.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * One credit as a sentence, in the shape a licence asks for: what, by whom,
 * under which licence, from where.
 */
export function creditText(c) {
  const what = c?.title || c?.query || "Untitled image";
  const who = c?.creator ? ` by ${c.creator}` : "";
  const lic = c?.licence ? `. ${c.licence}` : "";
  const via = c?.source ? `. Via ${sourceLabel(c.source)}` : "";
  return `${what}${who}${lic}${via}.`;
}

/** The same, as markdown with the licence and landing page linked. */
export function creditMarkdown(c) {
  const what = c?.title || c?.query || "Untitled image";
  const who = c?.creator ? ` by ${c.creator}` : "";
  const lic = c?.licence_url ? `[${c.licence}](${c.licence_url})` : (c?.licence ?? "");
  const where = c?.landing ? ` — [source](${c.landing})` : "";
  return `- **${what}**${who}. ${lic}${where}`;
}

/** The credits a deck has on disk, or an empty list. Never throws. */
export async function readCredits(deckDir) {
  try {
    const raw = await readFile(path.join(deckDir, CREDITS_JSON), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * The credits the licences oblige, in both a machine record and a page a
 * person can use.
 *
 * Public-domain entries are written too. Nothing is owed for them, but "where
 * did this picture come from" is asked of an academic submission whatever the
 * licence, and a partial list reads as the whole one.
 */
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

/* ------------------------------------------------------- the deck's own copy */

/** The `attribution` type's caps, so a credit is shortened rather than refused. */
const NAME_MAX = 30;
const CONTRIBUTION_MAX = 60;
const ITEMS_MAX = 12;

const clip = (s, n) => {
  const t = String(s ?? "").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
};

/**
 * A credits slide for the deck, or null when nothing is owed.
 *
 * Every other surface lives outside the .pptx — the app's pages, CREDITS.md,
 * the report. A deck that is exported, emailed or presented from someone else's
 * machine carries none of them, and that is the moment a CC BY image is
 * actually shown to an audience uncredited. This is the only copy that travels
 * with the file.
 *
 * It is built ONLY from images whose licence requires attribution. Public
 * domain and CC0 owe nothing, so a deck whose pictures are all PD gets no extra
 * slide — the common case, because the supply's licence ladder prefers exactly
 * those.
 *
 * `attribution` is an existing slide type and its shape is a person and what
 * they contributed, which is what a credit is: who made the picture, and where
 * it appears. Names and lines are clipped to the type's caps rather than
 * dropped, because a shortened credit still credits and a missing one does not.
 */
export function creditsSlide(credits) {
  const owed = (credits ?? []).filter((c) => c?.attribution_required);
  if (!owed.length) return null;

  const items = owed.slice(0, ITEMS_MAX).map((c) => {
    const where = c.slide ? `Slide ${c.slide}` : null;
    const source = sourceLabel(c.source);
    const creator = String(c.creator ?? "").trim();
    // `name` caps at 30 and `contribution` at 60, and an institution's name
    // routinely exceeds the shorter one. Clipping the attributee is the one
    // thing a credit cannot afford, so a long creator moves into the roomier
    // field and the source takes the label instead — the credit still names
    // whom it belongs to, in full.
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

  // Over the cap the slide would silently stop crediting, so it says where the
  // rest are instead of implying the list is complete.
  const overflow = owed.length - items.length;
  const standfirst = overflow > 0
    ? `Images used under licence. ${overflow} further credit${overflow > 1 ? "s" : ""} in CREDITS.md.`
    : "Images used under the licences shown.";

  return { type: "attribution", headline: "Image credits", standfirst, items };
}
