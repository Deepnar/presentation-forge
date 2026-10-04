// @forge/model — Layer A contracts: DeckIntent / SlideIntent / ContentBlock.
//
// Type shapes are generated from intent.schema.json (see
// intent.generated.ts); AJV owns runtime validation. No coordinates,
// colours, or font names may enter this layer — that is the product
// invariant, not a style preference.

import { readFile } from "node:fs/promises";
import { Ajv, type ValidateFunction } from "ajv";
import type { DeckIntent } from "./intent.generated.ts";

export type { DeckIntent, SlideIntent, ContentBlock } from "./intent.generated.ts";

let _validate: ValidateFunction | null = null;

async function validator(): Promise<ValidateFunction> {
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
export async function validateDeckIntent(deck: unknown): Promise<{ ok: boolean; errors: string[] }> {
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
export function normalizeIntent(deck: DeckIntent): DeckIntent {
  let n = 0;
  const slides = (deck.slides ?? []).map((s, si) => ({
    ...s,
    id: s.id ?? `s${si + 1}`,
    blocks: (s.blocks ?? []).map((b, bi) => ({ ...b, id: b.id ?? `s${si + 1}b${bi + 1}-${n++}` })),
  }));
  return { ...deck, id: deck.id ?? "deck", slides: slides as DeckIntent["slides"] };
}
