/**
 * Deck mutation operations.
 *
 * Every change to a deck — first generation, a chat instruction, a critic fix —
 * is expressed as a list of ops. Rewriting the whole deck instead would be
 * expensive for a one-slide edit and, worse, lets the model quietly restyle
 * slides nobody asked about.
 *
 * Application is transactional: ops apply to a clone, the result is validated,
 * and the original is returned untouched if anything fails. A half-applied deck
 * is never observable.
 *
 * Pure module — no model, no I/O — so the semantics are testable on their own.
 */

const OP_NAMES = [
  "set_meta", "append_slide", "insert_slide",
  "replace_slide", "update_slide", "delete_slide", "move_slide",
  "duplicate_slide",
];

/**
 * Build the Ollama structured-output schema from deck.schema.json.
 *
 * The slide payload MUST enumerate its properties. Declaring it as a bare
 * `{type: "object"}` produces a decoding grammar that permits arbitrary nested
 * keys, and small models fall into it and never come out — observed as endless
 * `{"patch_details":{"patch_details":{…}}}` and token loops inside free-form
 * strings. Concrete keys give the grammar somewhere to land.
 *
 * Derived rather than hand-written so it cannot drift from the contract.
 */
/**
 * @param {object} deckSchema      parsed deck.schema.json
 * @param {object} [opts]
 * @param {number} [opts.slideCount]  how many slides the deck currently has
 * @param {string[]} [opts.onlyTypes] restrict to these slide types
 * @param {string[]} [opts.excludeProps]  shared fields the payload must not carry
 *
 * `onlyTypes` is the important lever. Unioning all 28 slide fields produces a
 * large grammar, and constrained decoding masks the model's preferred token far
 * more often against a large grammar than a small one — which is what pushes a
 * small model off-distribution into loops and confabulation. Narrowing to the
 * one type being written keeps the grammar tight.
 *
 * `excludeProps` removes shared fields entirely. The first-generation writer
 * excludes `presenter` for every type — presenters are assigned centrally by
 * `distributePresenters` after generation, not by the model — and the divider
 * types (title, section, chapter, closing) never carry one by rule: "the next
 * part is the slide, not somebody's slide". Making a stray `presenter`
 * unrepresentable in the grammar beats scrubbing it after the fact.
 */
export function buildOpsSchema(deckSchema, { slideCount = 0, onlyTypes = null, excludeProps = null } = {}) {
  const slide = deckSchema.definitions.slide;

  // Constrain the op set to what the current deck can actually accept. Against
  // an empty deck the model reliably reaches for update_slide/replace_slide and
  // then fails to recover through the repair loop; removing those from the
  // grammar makes the mistake unrepresentable rather than merely discouraged.
  const available = slideCount === 0
    ? ["set_meta", "append_slide"]
    : OP_NAMES;

  /**
   * Inline every $ref, at any depth. Ollama's schema converter has no document
   * to resolve against, so a surviving `#/definitions/…` anywhere in the tree
   * fails the whole request — including ones nested inside `items`.
   */
  const deref = (node, seen = new Set()) => {
    if (Array.isArray(node)) return node.map((n) => deref(n, seen));
    if (!node || typeof node !== "object") return node;

    if (node.$ref) {
      if (seen.has(node.$ref)) return { type: "object" }; // cycle guard
      const target = node.$ref.replace(/^#\//, "").split("/")
        .reduce((o, k) => o?.[k], deckSchema);
      return deref(target, new Set([...seen, node.$ref]));
    }

    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = deref(v, seen);
    return out;
  };

  // Shared fields, then each selected type's own. Narrowing `onlyTypes` to a
  // single type cuts the key space from ~28 to ~5.
  const props = {};
  for (const [name, spec] of Object.entries(slide.properties)) props[name] = deref(spec);
  for (const name of excludeProps ?? []) delete props[name];

  const required = new Set(["type"]);
  for (const rule of slide.allOf ?? []) {
    const t = rule.if?.properties?.type?.const;
    if (onlyTypes && !onlyTypes.includes(t)) continue;
    for (const [name, spec] of Object.entries(rule.then?.properties ?? {})) {
      props[name] = deref(spec);
    }
    // Only meaningful when writing a single type; with several, one type's
    // required field is another's illegal one.
    if (onlyTypes?.length === 1) {
      for (const r of rule.then?.required ?? []) required.add(r);
    }
  }

  const slideSchema = {
    type: "object",
    required: [...required],
    properties: onlyTypes
      ? { ...props, type: { enum: onlyTypes } }
      : props,
  };
  // A patch is the same key space with nothing mandatory.
  const patchSchema = { type: "object", properties: props };

  return {
    type: "object",
    required: ["ops"],
    properties: {
      reasoning: {
        type: "string",
        description: "One or two sentences on the approach. Never shown on a slide.",
      },
      ops: {
        type: "array",
        items: {
          type: "object",
          required: ["op"],
          properties: {
            op: { enum: available },
            index: {
              type: "integer",
              minimum: 0,
              ...(slideCount > 0 ? { maximum: slideCount } : {}),
              description: "0-based target slide",
            },
            to: {
              type: "integer",
              minimum: 0,
              ...(slideCount > 0 ? { maximum: slideCount } : {}),
              description: "move_slide destination",
            },
            meta: {
              type: "object",
              properties: {
                title: { type: "string" },
                subtitle: { type: "string" },
                sections: { type: "array", items: { type: "string" } },
              },
            },
            slide: slideSchema,
            patch: patchSchema,
          },
        },
      },
    },
  };
}

const clone = (x) => structuredClone(x);

class OpError extends Error {}

function requireIndex(deck, i, op, { allowEnd = false } = {}) {
  const max = allowEnd ? deck.slides.length : deck.slides.length - 1;
  if (!Number.isInteger(i) || i < 0 || i > max) {
    throw new OpError(
      `${op}: index ${i} out of range — deck has ${deck.slides.length} slides ` +
      `(valid 0..${Math.max(0, max)})`,
    );
  }
}

function requireSlide(slide, op) {
  if (!slide || typeof slide !== "object") throw new OpError(`${op}: missing "slide" object`);
  if (!slide.type) throw new OpError(`${op}: slide is missing "type"`);
}

/**
 * Apply one op to a deck in place. Exported for tests; callers should use
 * `applyOps`, which is transactional.
 */
export function applyOp(deck, op) {
  switch (op.op) {
    case "set_meta": {
      const meta = op.meta ?? {};
      for (const k of ["title", "subtitle", "theme"]) {
        if (typeof meta[k] === "string") deck[k] = meta[k];
      }
      if (Array.isArray(meta.sections)) deck.sections = meta.sections;
      return `meta: ${Object.keys(meta).join(", ") || "no change"}`;
    }

    case "append_slide":
      requireSlide(op.slide, "append_slide");
      deck.slides.push(clone(op.slide));
      return `+ slide ${deck.slides.length} (${op.slide.type})`;

    case "insert_slide": {
      requireSlide(op.slide, "insert_slide");
      requireIndex(deck, op.index, "insert_slide", { allowEnd: true });
      deck.slides.splice(op.index, 0, clone(op.slide));
      return `+ slide at ${op.index + 1} (${op.slide.type})`;
    }

    case "replace_slide": {
      requireSlide(op.slide, "replace_slide");
      requireIndex(deck, op.index, "replace_slide");
      const was = deck.slides[op.index].type;
      deck.slides[op.index] = clone(op.slide);
      return `~ slide ${op.index + 1} (${was} → ${op.slide.type})`;
    }

    case "update_slide": {
      requireIndex(deck, op.index, "update_slide");
      if (!op.patch || typeof op.patch !== "object") {
        throw new OpError("update_slide: missing \"patch\" object");
      }
      // Shallow merge: a slide's fields are flat, and deep-merging arrays would
      // make "replace these bullets" impossible to express.
      deck.slides[op.index] = { ...deck.slides[op.index], ...clone(op.patch) };
      return `~ slide ${op.index + 1} (${Object.keys(op.patch).join(", ")})`;
    }

    case "delete_slide": {
      requireIndex(deck, op.index, "delete_slide");
      if (deck.slides.length <= 1) {
        throw new OpError("delete_slide refuses to empty the deck — keep at least one slide");
      }
      const [gone] = deck.slides.splice(op.index, 1);
      return `- slide ${op.index + 1} (${gone.type})`;
    }

    case "move_slide": {
      requireIndex(deck, op.index, "move_slide");
      requireIndex(deck, op.to, "move_slide", { allowEnd: true });
      const [moved] = deck.slides.splice(op.index, 1);
      // Removing first shifts everything after it down by one.
      const dest = op.to > op.index ? op.to - 1 : op.to;
      deck.slides.splice(dest, 0, moved);
      return `↕ slide ${op.index + 1} → ${dest + 1} (${moved.type})`;
    }

    case "duplicate_slide": {
      requireIndex(deck, op.index, "duplicate_slide");
      deck.slides.splice(op.index + 1, 0, clone(deck.slides[op.index]));
      return `⧉ slide ${op.index + 1} duplicated → ${op.index + 2} (${deck.slides[op.index].type})`;
    }

    default:
      throw new OpError(`Unknown op "${op.op}"`);
  }
}

/**
 * Apply a list of ops transactionally.
 *
 * Ops are indexed against the deck as it evolves, so an insert shifts the
 * targets of later ops — the same semantics a human editing top-to-bottom
 * would expect. Models routinely get this wrong on multi-op edits, which is why
 * `describe` reports final positions and the caller shows them back.
 */
export function applyOps(deck, ops) {
  if (!Array.isArray(ops)) return { ok: false, deck, changes: [], errors: ["ops must be an array"] };

  const draft = clone(deck);
  draft.slides ??= [];
  const changes = [];
  const errors = [];

  for (const [i, op] of ops.entries()) {
    try {
      changes.push(applyOp(draft, op));
    } catch (err) {
      errors.push(err instanceof OpError ? `op ${i + 1} — ${err.message}` : `op ${i + 1} — ${err.message}`);
    }
  }

  if (errors.length) return { ok: false, deck, changes, errors };
  return { ok: true, deck: draft, changes, errors: [] };
}

/** Compact human-readable summary of what a turn did. */
export function describe(changes) {
  if (!changes.length) return "no changes";
  return changes.join("\n");
}

/**
 * Structural diff between two decks, for the UI.
 * Matches slides by identity where possible so a move reads as a move rather
 * than a delete plus an insert.
 */
export function diffDecks(before, after) {
  const out = [];
  for (const k of ["title", "subtitle", "theme"]) {
    if (before?.[k] !== after?.[k]) out.push({ kind: "meta", field: k, from: before?.[k], to: after?.[k] });
  }

  const a = before?.slides ?? [];
  const b = after?.slides ?? [];
  const key = (s) => `${s.type}::${s.headline ?? s.quote ?? s.image ?? ""}`;
  const aKeys = a.map(key);
  const bKeys = b.map(key);

  aKeys.forEach((k, i) => {
    const at = bKeys.indexOf(k);
    if (at === -1) out.push({ kind: "removed", index: i, type: a[i].type, label: a[i].headline ?? a[i].type });
    else if (at !== i) out.push({ kind: "moved", from: i, to: at, type: a[i].type, label: a[i].headline ?? a[i].type });
  });
  bKeys.forEach((k, i) => {
    if (!aKeys.includes(k)) out.push({ kind: "added", index: i, type: b[i].type, label: b[i].headline ?? b[i].type });
  });

  // Same position, same identity, different content.
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (aKeys[i] === bKeys[i] && JSON.stringify(a[i]) !== JSON.stringify(b[i])) {
      out.push({ kind: "edited", index: i, type: b[i].type, label: b[i].headline ?? b[i].type });
    }
  }

  return out;
}
