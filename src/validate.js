import { readFile } from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";
import YAML from "yaml";
import { ROOT } from "./paths.js";

/**
 * Validates deck content against schema/deck.schema.json.
 *
 * The error formatting here is load-bearing: this output is fed straight back
 * to a small local model as its correction prompt. Ajv's raw messages
 * ("must match a schema in anyOf") are useless for that, so we resolve each
 * error to the offending slide, its type, and what specifically to change.
 */
const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });

let _validate;
async function compiled() {
  if (!_validate) {
    const schema = JSON.parse(await readFile(path.join(ROOT, "schema", "deck.schema.json"), "utf8"));
    _validate = ajv.compile(schema);
  }
  return _validate;
}

function describe(err, deck) {
  const p = err.instancePath || "(root)";
  const slideIdx = p.match(/^\/slides\/(\d+)/)?.[1];
  const slide = slideIdx != null ? deck.slides?.[Number(slideIdx)] : null;
  const where = slide
    ? `slide ${Number(slideIdx) + 1} (type: ${slide.type ?? "MISSING"})`
    : p;

  switch (err.keyword) {
    case "required":
      return `${where}: missing required field "${err.params.missingProperty}"`;
    case "maxLength":
      return `${where} at ${p}: too long — ${err.params.limit} chars max, shorten it`;
    case "minLength":
      return `${where} at ${p}: too short — needs at least ${err.params.limit} chars`;
    case "maxItems":
      return `${where} at ${p}: too many items — ${err.params.limit} max, split across slides`;
    case "minItems":
      return `${where} at ${p}: needs at least ${err.params.limit} items`;
    case "enum":
      return `${where} at ${p}: must be one of ${err.params.allowedValues.join(", ")}`;
    case "additionalProperties":
      return `${where}: unknown field "${err.params.additionalProperty}" — not in the schema`;
    case "type":
      return `${where} at ${p}: must be ${err.params.type}`;
    case "not":
      return `${where}: field "html" is only allowed on type freeform slides`;
    default:
      return `${where} at ${p}: ${err.message}`;
  }
}

/**
 * The errors belonging to one slide.
 *
 * `describe` puts the slide number in prose and the JSON pointer in the message
 * only for the keywords that have a sub-path. A `required` or
 * `additionalProperties` error carries neither the item nor the pointer — just
 * "slide N (type: T)" — so matching on the pointer alone silently drops the one
 * error class that means the slide cannot be drawn at all. Match both forms.
 *
 * This exists so a pass can ask "did MY edit make this slide worse" instead of
 * "is the whole deck clean". The second question is false on almost every real
 * deck — `loadDeck` warns on an over-long field rather than refusing, so decks
 * ship slightly invalid and still render — and a pass that gates on it discards
 * its own good work.
 */
export function errorsForSlide(errors, index) {
  const pointer = new RegExp(`/slides/${index}(?![0-9])`);
  const prose = new RegExp(`^slide ${index + 1} \\(`);
  return (errors ?? []).filter((e) => pointer.test(String(e)) || prose.test(String(e)));
}

export async function validateDeck(deck) {
  const validate = await compiled();
  const ok = validate(deck);
  if (ok) return { ok: true, errors: [], structural: [], tooLong: [] };

  // anyOf/if-then noise: keep the specific errors, drop the umbrella ones.
  const useful = validate.errors.filter((e) => !["if", "anyOf", "oneOf"].includes(e.keyword));
  const kept = useful.length ? useful : validate.errors;
  // A length is a QUALITY constraint and everything else is a correctness one.
  // A slide missing `cards` cannot be drawn at all; a slide whose body runs
  // eighty characters over renders, and the fitter says so. Separating them is
  // what lets a cap be tightened without making decks already on disk
  // unopenable — see loadDeck.
  const tooLong = [...new Set(kept.filter((e) => e.keyword === "maxLength").map((e) => describe(e, deck)))];
  const messages = [...new Set(kept.filter((e) => e.keyword !== "maxLength").map((e) => describe(e, deck)))];
  return { ok: messages.length === 0 && tooLong.length === 0, errors: [...messages, ...tooLong], structural: messages, tooLong };
}

export async function loadDeck(file) {
  const raw = await readFile(file, "utf8");
  const deck = file.endsWith(".json") ? JSON.parse(raw) : YAML.parse(raw);
  const { structural, tooLong } = await validateDeck(deck);
  // Reading a deck is not the moment to enforce a length. The caps are the
  // instruction a model writes to, and tightening one to what the layouts can
  // actually seat would otherwise make every deck already on disk refuse to
  // open — for text that renders, and that the fit sweep and the trim pass
  // already report. Structure still refuses: a slide missing its required
  // field cannot be drawn at all.
  if (structural.length) {
    const err = new Error(`Deck failed validation (${structural.length}):\n  - ${structural.join("\n  - ")}`);
    err.validation = structural;
    throw err;
  }
  if (tooLong.length) {
    console.warn(`  ! ${tooLong.length} field(s) over their length cap; the fitter will report what does not fit:`);
    for (const m of tooLong.slice(0, 5)) console.warn(`      ${m}`);
  }
  return deck;
}
