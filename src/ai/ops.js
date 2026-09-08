
const OP_NAMES = [
  "set_meta", "append_slide", "insert_slide",
  "replace_slide", "update_slide", "delete_slide", "move_slide",
  "duplicate_slide",
];

export function buildOpsSchema(
  deckSchema,
  { slideCount = 0, onlyTypes = null, patchTypes = null, excludeProps = null } = {},
) {
  const slide = deckSchema.definitions.slide;

  const available = slideCount === 0
    ? ["set_meta", "append_slide"]
    : OP_NAMES;

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

  const shared = {};
  for (const [name, spec] of Object.entries(slide.properties)) shared[name] = deref(spec);

  const keySpace = (types) => {
    const props = { ...shared };
    const required = new Set(["type"]);
    for (const rule of slide.allOf ?? []) {
      const t = rule.if?.properties?.type?.const;
      if (types && !types.includes(t)) continue;
      for (const [name, spec] of Object.entries(rule.then?.properties ?? {})) {
        props[name] = deref(spec);
      }
      if (types?.length === 1) {
        for (const r of rule.then?.required ?? []) required.add(r);
      }
    }
    for (const name of excludeProps ?? []) {
      delete props[name];
      required.delete(name);
    }
    return { props, required: [...required] };
  };

  const forSlide = keySpace(onlyTypes);
  const forPatch = keySpace(patchTypes ?? onlyTypes);

  const slideSchema = {
    type: "object",
    required: forSlide.required,
    properties: onlyTypes
      ? { ...forSlide.props, type: { enum: onlyTypes } }
      : forSlide.props,
  };
  const patchSchema = { type: "object", properties: forPatch.props };

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
        maxItems: Math.max(12, slideCount + 8),
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

export function slideFromOps(ops, index) {
  for (const o of ops ?? []) {
    if (o.op === "update_slide" && (o.index === index || o.index == null)) {
      if (o.patch) return { kind: "patch", patch: o.patch };
      if (o.slide) return { kind: "slide", slide: o.slide };
    }
    if (o.op === "replace_slide" && (o.index === index || o.index == null) && o.slide) {
      return { kind: "slide", slide: o.slide };
    }
  }
  return null;
}

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

const OP_TARGET_FIELD = {
  update_slide: "index",
  replace_slide: "index",
  delete_slide: "index",
  duplicate_slide: "index",
  move_slide: "from",
};

export function scopeOpsToSelection(ops, allowed) {
  const list = Array.isArray(allowed) ? allowed.filter((n) => Number.isInteger(n)) : [];
  if (!list.length) return { ops, refused: [] };
  const set = new Set(list);
  const only = list.length === 1 ? list[0] : null;
  const kept = [];
  const refused = [];
  for (const o of ops ?? []) {
    const field = OP_TARGET_FIELD[o?.op];
    if (!field) { kept.push(o); continue; }
    const idx = o[field];
    if (idx == null) {
      if (only != null) kept.push({ ...o, [field]: only });
      else refused.push({ op: o.op, index: null });
      continue;
    }
    if (set.has(idx)) kept.push(o);
    else refused.push({ op: o.op, index: idx });
  }
  return { ops: kept, refused };
}

export function fieldsForType(schema, type) {
  const slide = schema.definitions?.slide ?? {};
  const fields = new Set(Object.keys(slide.properties ?? {}));
  for (const rule of slide.allOf ?? []) {
    const want = rule.if?.properties?.type;
    const matches = want?.const === type || (Array.isArray(want?.enum) && want.enum.includes(type));
    if (matches) for (const k of Object.keys(rule.then?.properties ?? {})) fields.add(k);
  }
  return fields;
}

export function stripForeignFields(deck, schema) {
  const dropped = [];
  const slides = deck.slides.map((slide, i) => {
    const allowed = fieldsForType(schema, slide.type);
    const foreign = Object.keys(slide).filter((k) => !allowed.has(k));
    if (!foreign.length) return slide;
    const out = { ...slide };
    for (const k of foreign) {
      delete out[k];
      dropped.push({ index: i, type: slide.type, field: k });
    }
    return out;
  });
  return { deck: { ...deck, slides }, dropped };
}

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

export function describe(changes) {
  if (!changes.length) return "no changes";
  return changes.join("\n");
}

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

  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (aKeys[i] === bKeys[i] && JSON.stringify(a[i]) !== JSON.stringify(b[i])) {
      out.push({ kind: "edited", index: i, type: b[i].type, label: b[i].headline ?? b[i].type });
    }
  }

  return out;
}
