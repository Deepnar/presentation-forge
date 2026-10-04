// @forge/model — Layer A contracts: DeckIntent / SlideIntent / ContentBlock.
//
// JSDoc typedefs here map 1:1 to the future TypeScript interfaces; the JSON
// Schemas beside this file are the runtime boundary (ajv, same pattern as
// src/validate.js). No coordinates, colours, or font names may enter this
// layer — that is the product invariant, not a style preference.

import { readFile } from "node:fs/promises";
import Ajv from "ajv";

/**
 * @typedef {object} ContentBlock
 * @property {string} id
 * @property {"text"|"list"|"stat"|"image"|"chart"|"table"|"quote"|"callout"} kind
 * @property {string} [text]
 * @property {string[]} [items]
 * @property {string} [label]
 * @property {string} [value]
 * @property {string} [src]
 * @property {string} [alt]
 * @property {string} [caption]
 * @property {string} [chartKind]
 * @property {string[]} [categories]
 * @property {{name:string,values:number[]}[]} [series]
 * @property {string} [unit]
 * @property {string[][]} [rows]
 * @property {boolean} [header]
 */

/**
 * @typedef {object} SlideIntent
 * @property {string} id
 * @property {string} purpose
 * @property {string} [title]
 * @property {string} [takeaway]
 * @property {ContentBlock[]} blocks
 * @property {string} [visualDirection]
 * @property {{recipe?:string,emphasis?:string,mediaSide?:string}} [layoutHint]
 * @property {string[]} [sourceRefs]
 * @property {string} [speakerNotes]
 */

/**
 * @typedef {object} DeckIntent
 * @property {string} id
 * @property {string} title
 * @property {string} [audience]
 * @property {string} [objective]
 * @property {string} [narrative]
 * @property {string} [designDirection]
 * @property {{mode:string,fileIds?:string[]}} [sourcePolicy]
 * @property {SlideIntent[]} slides
 */

let _validate = null;

async function validator() {
  if (!_validate) {
    const url = new URL("./intent.schema.json", import.meta.url);
    const schema = JSON.parse(await readFile(url, "utf8"));
    const ajv = new Ajv({ allErrors: true, strict: false });
    _validate = ajv.compile(schema);
  }
  return _validate;
}

// Validate a DeckIntent. Returns {ok, errors[]} with slide-scoped messages
// so a model can repair its own output (same contract as src/validate.js).
export async function validateDeckIntent(deck) {
  const validate = await validator();
  const ok = validate(deck);
  if (ok) return { ok: true, errors: [] };
  const errors = (validate.errors ?? []).map((e) => {
    const m = e.instancePath.match(/^\/slides\/(\d+)/);
    const where = m ? `slide ${Number(m[1]) + 1}` : "deck";
    return `${where}: ${e.instancePath || "(root)"} ${e.message}`;
  });
  return { ok: false, errors };
}

// Every slide and block needs a stable id before it reaches the compiler;
// the compiler keys element identity off these.
export function normalizeIntent(deck) {
  let n = 0;
  const slides = (deck.slides ?? []).map((s, si) => ({
    ...s,
    id: s.id ?? `s${si + 1}`,
    blocks: (s.blocks ?? []).map((b, bi) => ({ ...b, id: b.id ?? `s${si + 1}b${bi + 1}-${n++}` })),
  }));
  return { ...deck, id: deck.id ?? "deck", slides };
}
