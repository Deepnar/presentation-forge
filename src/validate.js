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

export async function validateDeck(deck) {
  const validate = await compiled();
  const ok = validate(deck);
  if (ok) return { ok: true, errors: [] };

  // anyOf/if-then noise: keep the specific errors, drop the umbrella ones.
  const useful = validate.errors.filter((e) => !["if", "anyOf", "oneOf"].includes(e.keyword));
  const messages = [...new Set((useful.length ? useful : validate.errors).map((e) => describe(e, deck)))];
  return { ok: false, errors: messages };
}

export async function loadDeck(file) {
  const raw = await readFile(file, "utf8");
  const deck = file.endsWith(".json") ? JSON.parse(raw) : YAML.parse(raw);
  const { ok, errors } = await validateDeck(deck);
  if (!ok) {
    const err = new Error(`Deck failed validation (${errors.length}):\n  - ${errors.join("\n  - ")}`);
    err.validation = errors;
    throw err;
  }
  return deck;
}
