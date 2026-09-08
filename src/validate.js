import { readFile } from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";
import YAML from "yaml";
import { ROOT } from "./paths.js";

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

export function errorsForSlide(errors, index) {
  const pointer = new RegExp(`/slides/${index}(?![0-9])`);
  const prose = new RegExp(`^slide ${index + 1} \\(`);
  return (errors ?? []).filter((e) => pointer.test(String(e)) || prose.test(String(e)));
}

export async function validateDeck(deck) {
  const validate = await compiled();
  const ok = validate(deck);
  if (ok) return { ok: true, errors: [], structural: [], tooLong: [] };

  const useful = validate.errors.filter((e) => !["if", "anyOf", "oneOf"].includes(e.keyword));
  const kept = useful.length ? useful : validate.errors;
  const tooLong = [...new Set(kept.filter((e) => e.keyword === "maxLength").map((e) => describe(e, deck)))];
  const messages = [...new Set(kept.filter((e) => e.keyword !== "maxLength").map((e) => describe(e, deck)))];
  return { ok: messages.length === 0 && tooLong.length === 0, errors: [...messages, ...tooLong], structural: messages, tooLong };
}

export async function loadDeck(file) {
  const raw = await readFile(file, "utf8");
  const deck = file.endsWith(".json") ? JSON.parse(raw) : YAML.parse(raw);
  const { structural, tooLong } = await validateDeck(deck);
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
