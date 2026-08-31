import { render } from "./render.js";
import { specimenDeck } from "./specimens.js";
import { slideFieldMeta, walkStrings } from "./ai/trim.js";
import { NON_TEXT } from "./textcheck.js";

/**
 * Does the layout draw what the schema promises?
 *
 * Every other check in the repo starts from the text on the page: the fit sweep
 * asks whether it fits, the text check rasterises and asks whether it survived.
 * Both are blind to a field that is never drawn at all — text that is never
 * drawn is never fitted, and never appears in the raster to be missed. So a
 * layout could quietly discard content the model wrote, on all 34 themes, and
 * every instrument would report clean. Four layouts did, and were found only by
 * hand-populating the fields a fixture happened to omit.
 *
 * This asks the question directly. For each field the schema declares on a
 * type, it writes a marker into that field, renders, and reads back the strings
 * the layout actually emitted. A field whose marker never reaches the page is
 * content the deck loses.
 *
 * KNOWN LIMIT, and it is the same one the fixture has: a field the specimen
 * does not populate cannot be marked, because there is no occurrence to write
 * into. The shared fields are seeded because every type has them; for a type's
 * own optional fields, enriching `src/specimens.js` is what closes it. Ask what
 * the specimen does NOT carry — do not read what it does.
 */

/** The marker is nonsense so it cannot collide with a theme's own furniture. */
const MARK = "Zamphirodex";

/**
 * Field paths worth marking: prose the layout is expected to set.
 *
 * An identifier, an asset path or an icon glyph is a string the schema caps and
 * the page never shows as itself — marking a node's id breaks the edges that
 * name it, and the marker would rightly not appear.
 */
async function markable(slide) {
  const { strings } = await slideFieldMeta(slide.type);
  return strings.filter((p) => !NON_TEXT.has(p.split(".").at(-1).replace("[]", "")));
}

/** A copy of the slide with `path` set to the marker wherever it occurs. */
function marked(slide, path, mark) {
  const out = structuredClone(slide);
  let n = 0;
  for (const w of walkStrings(out, path)) {
    if (typeof w.value !== "string" || !w.value.trim()) continue;
    w.set(mark);
    n++;
  }
  return n ? out : null;
}

/**
 * Every type's fields, and whether each reaches the page.
 *
 * `themes` defaults to one: a layout draws a field or it does not, and that is
 * not a theme's decision. Pass more when a composition axis is suspected.
 */
export async function drawCheck({ types, themes = ["warm-humanist"], deck: given } = {}) {
  const deck = given ?? (await specimenDeck());
  const wanted = types ? new Set(types) : null;
  const rows = [];

  for (const slide of deck.slides) {
    if (wanted && !wanted.has(slide.type)) continue;
    // The shared fields are on every type by definition, so an absent one is a
    // gap in the fixture rather than a field this type does not have.
    const seeded = { ...slide };
    for (const f of ["headline", "standfirst"]) {
      if (!seeded[f]?.trim()) seeded[f] = f;
    }
    for (const path of await markable(seeded)) {
      const one = marked(seeded, path, `${MARK} ${path}`);
      if (!one) { rows.push({ type: slide.type, path, verdict: "unpopulated" }); continue; }
      let drew = false;
      for (const theme of themes) {
        const probe = structuredClone(deck);
        probe.slides = [one];
        const r = await render({ deck: probe, themeName: theme, write: false });
        // A theme may uppercase or otherwise transform a role's text before it
        // is drawn — the eyebrow does — so the marker is matched case-blind.
        const found = (r.drawn[0] ?? []).some((t) => String(t).toUpperCase().includes(MARK.toUpperCase()));
        if (found) { drew = true; break; }
      }
      rows.push({ type: slide.type, path, verdict: drew ? "drawn" : "dropped" });
    }
  }
  return rows;
}
