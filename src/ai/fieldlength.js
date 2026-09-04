import { chatJSON, authorTransport } from "./ollama.js";
import { buildOpsSchema, applyOps, slideFromOps } from "./ops.js";
import { deckSchema, catalogForType } from "./catalog.js";
import { slideFieldMeta, walkStrings, parseFloorProblems } from "./trim.js";
import { validateDeck, errorsForSlide } from "../validate.js";
import { themeMatrix } from "../themematrix.js";

/**
 * The FIELD-LENGTH pass — the "no mid-sentence ellipsis" rule.
 *
 * The deterministic trim (trim.js) shortens an overfull field at a word
 * boundary and appends "…", which is exactly the "the…" defect the user called
 * out: a half-sentence ships because the writer overfilled the field and the
 * layout could not hold it. This pass runs BEFORE the trim and fixes overfull
 * fields with a REWRITE instead: a targeted model call that turns each flagged
 * field into one complete sentence within its schema cap, with no ellipsis.
 * The trim then only cuts what the rewrite cannot fix.
 *
 * A field is a candidate when the fitter flags the slide below its readable
 * floor (the layout cannot hold the current text), or when the field exceeds
 * its schema maxLength outright (a defensive net — validation normally stops
 * these, but the pass should not assume every write path validated).
 */

/** Every string field on a slide with its schema cap, current length and a
 *  stable label — the writer's view of "what is too long". Exported so tests
 *  can assert the cap contract the pass rewrites against. */
export async function fieldInventory(slide) {
  const { strings } = await slideFieldMeta(slide.type);
  const schema = await deckSchema();
  const out = [];
  for (const path of strings) {
    const cap = capForPath(schema, slide.type, path);
    for (const w of walkStrings(slide, path)) {
      if (typeof w.value !== "string" || !w.value.trim()) continue;
      out.push({
        path,
        label: labelPath(path),
        cap: cap ?? null,
        length: w.value.length,
        text: w.value,
      });
    }
  }
  return out;
}

/** The per-field maxLength from the schema (a dot path like "steps[].body"). */
function capForPath(schema, type, path) {
  const rule = schema.definitions.slide.allOf?.find(
    (r) => r.if?.properties?.type?.const === type,
  );
  // A shared field (`headline`, `standfirst`) is declared once on the base
  // slide object, so the type rule alone resolves it to undefined — which reads
  // downstream as "no cap" rather than "not found here".
  const resolved = resolvePath(rule?.then?.properties ?? {}, path, schema)
    ?? resolvePath(schema.definitions.slide.properties ?? {}, path, schema);
  if (resolved?.type === "string") return resolved.maxLength ?? null;
  // An array-of-strings field ("bullets") caps its items, not the array.
  if (resolved?.type === "array") {
    const item = resolved.items?.$ref ? resolveRef(resolved.items.$ref, schema) : resolved.items;
    return item?.type === "string" ? item.maxLength ?? null : null;
  }
  return null;
}

/**
 * A dot path to its schema node, through `$ref`s and nested arrays alike.
 *
 * Both of those used to end the walk at `undefined`, and the caller reads a
 * missing node as "this field has no cap" — so `compare.left.title` (behind a
 * `$ref`), `branching-flow.steps[].title` (same) and
 * `roadmap.phases[].items[].title` (an array inside an array) all carried a
 * maxLength the schema states and nothing downstream could see. The length
 * pass told the model those fields were uncapped and the cap prober skipped
 * them; only ajv, at validate time, still knew.
 */
function resolvePath(props, path, schema) {
  const segs = path.split(".");
  let node = props;
  for (const seg of segs) {
    const name = seg.endsWith("[]") ? seg.slice(0, -2) : seg;
    // An object spec keeps its fields under `properties`; the type rule's own
    // `then.properties` is already that map.
    node = deref(deref(node, schema)?.properties ?? node, schema)?.[name];
    node = deref(node, schema);
    if (seg.endsWith("[]")) node = deref(node?.items, schema);
  }
  return node;
}

const deref = (node, schema) => (node?.$ref ? resolveRef(node.$ref, schema) : node);

/** A human label for a schema path: "steps[].body" → "step body". */
function labelPath(path) {
  return path
    .replace(/\[\]/, "")
    .replace(/\./g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function resolveRef(ref, schema) {
  return ref.replace(/^#\//, "").split("/").reduce((o, k) => o?.[k], schema) ?? {};
}

/** A targeted rewrite of ONE slide's overlong fields, via its own type grammar.
 *  Returns the repaired slide (validated) or null. */
async function rewriteSlide({ slide, index, inventory, research, model, signal, chat = chatJSON }) {
  const schema = await deckSchema();
  const typeCatalog = await catalogForType(slide.type);
  const buildOps = buildOpsSchema(schema, {
    slideCount: Math.max(index + 1, 2),
    onlyTypes: [slide.type],
    excludeProps: ["presenter"],
  });

  const flagged = inventory
    .map(
      (f) =>
        `- ${f.label} (${f.path}): ${f.length} chars, cap ${f.cap ?? "unset"} — "${f.text.slice(0, 90)}${f.text.length > 90 ? "…" : ""}"`,
    );

  const system = [
    "You rewrite the TEXT of ONE presentation slide to make it FIT.",
    "Layout, colour and font are not yours.",
    `The slide type is "${slide.type}" and it stays "${slide.type}".`,
    "",
    "The fields below are too long for the layout to hold at a readable size.",
    "Rewrite EACH of them as ONE complete, grammatically finished sentence — as",
    "short as it can honestly be, and never longer than its cap. Never truncate",
    "with an ellipsis mid-sentence. A shorter complete sentence is correct;",
    "'the…' is never acceptable. Keep the meaning, the figures and the names;",
    "drop modifiers and subordinate clauses before dropping any fact.",
    "",
    "Fields to rewrite:",
    flagged.join("\n"),
    "",
    "Emit exactly one update_slide op at the slide's index that patches ONLY",
    "the fields above, with the rewritten complete sentences.",
    typeCatalog,
  ].join("\n");

  const current = Object.entries(slide)
    .map(([k, v]) => {
      if (k === "notes" || k === "presenter" || k === "type") return null;
      const val = Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" | ") : String(v ?? "");
      return val ? `  ${k}: ${val}` : null;
    })
    .filter(Boolean)
    .join("\n");

  const res = await chat({
    role: "author",
    model,
    signal,
    schema: buildOps,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          research ? `RESEARCH NOTES (keep every figure verbatim)\n${research}\n` : "",
          `CURRENT SLIDE [index ${index}]\n${current}`,
          `\nRewrite the flagged fields as complete sentences within their caps.`,
        ].filter(Boolean).join("\n"),
      },
    ],
  });

  // The ops grammar allows a full `slide` on any op, and models drift toward
  // writing the whole slide rather than a patch — resolve the intended shape
  // tolerantly and apply it as the slide's replacement.
  const got = slideFromOps(res.data?.ops, index);
  if (!got) return null;
  let candidate;
  if (got.kind === "patch") {
    const applied = applyOps({ title: "t", slides: [slide] }, [{ op: "update_slide", index: 0, patch: got.patch }]);
    candidate = applied.ok ? applied.deck.slides[0] : null;
  } else {
    candidate = got.slide;
  }
  if (!candidate) return null;
  candidate = { ...candidate, type: slide.type, presenter: slide.presenter, section: slide.section };
  const { ok } = await validateDeck({ title: "t", slides: [candidate] });
  return ok ? candidate : null;
}

/**
 * Run the pass over a freshly-written deck. Renders it in EVERY theme
 * (in-memory) to find slides the fitter flags below the floor, walks each
 * flagged slide's fields against their schema caps, and rewrites the overlong
 * fields via a scoped model call (two attempts). Returns the repaired deck
 * plus what changed. Slides the rewrite cannot fix are left for the
 * deterministic trim.
 */
/**
 * A field the decoding grammar cut at its cap.
 *
 * Constrained decoding masks any token that would exceed a string's maxLength,
 * so a model still mid-sentence at the cap simply stops — there is no signal,
 * no ellipsis, and the field is exactly at its limit rather than over it, which
 * is why neither the length check nor the trim ever saw it. On one freshly
 * generated deck SIX of nine speaker notes ended that way: "…creates a 30",
 * "…and insufficient 1", "…i cells maintain 8". A presenter reads those aloud.
 *
 * The repair is deterministic and needs no model: fall back to the last
 * complete sentence. A shorter whole note beats a longer broken one. Returns
 * null when the field did not end mid-sentence, when nothing can be salvaged,
 * or when salvaging would gut the field — those are left for the rewrite.
 */
export function looksCutAtCap(text, cap) {
  if (typeof text !== "string" || cap == null) return false;
  // Only a field AT its cap is a grammar cut. A short field ending without a
  // full stop is a label, a heading, or a fragment the writer meant.
  if (text.length < cap) return false;
  return !/[.!?…:;)"'\u2019\u201d]$/.test(text.trim());
}

export function healCutField(text, cap) {
  if (!looksCutAtCap(text, cap)) return null;

  const m = text.match(/^[\s\S]*[.!?](?=\s|$)/);
  if (!m) return null;
  const healed = m[0].trim();
  // Never trade a truncated field for a stub: a 200-char note cut back to five
  // words has lost more than the broken tail cost it.
  if (healed.length < Math.min(40, cap * 0.35)) return null;
  return healed === text ? null : healed;
}

/** Replace one exact string value in a slide, wherever it sits. */
function replaceStringValue(node, from, to) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (node[i] === from) { node[i] = to; return true; }
      if (node[i] && typeof node[i] === "object" && replaceStringValue(node[i], from, to)) return true;
    }
    return false;
  }
  if (node && typeof node === "object") {
    for (const k of Object.keys(node)) {
      if (node[k] === from) { node[k] = to; return true; }
      if (node[k] && typeof node[k] === "object" && replaceStringValue(node[k], from, to)) return true;
    }
  }
  return false;
}

export async function fieldLengthPass({
  deck, deckDir, research = "", model, signal, onProgress, chat = chatJSON,
}) {
  // A deck is written once and rendered in whichever theme the reader picks.
  // Fitting it to the one theme it currently names is why a deck can pass this
  // pass with nothing flagged and still lose a card body under an inset frame
  // or a sidebar: the same text that clears a full-width theme does not clear
  // a narrower measure. Flag against every theme and rewrite once.
  const audit = await themeMatrix({ deck, deckDir });
  const flagged = new Map();
  for (const run of audit.runs) {
    for (const [index, roles] of parseFloorProblems(run.problems.map((p) => p.raw))) {
      if (!flagged.has(index)) flagged.set(index, new Set());
      for (const role of roles) flagged.get(index).add(role);
    }
  }

  const out = structuredClone(deck);
  const repaired = [];
  const problems = [];

  for (let i = 0; i < out.slides.length; i++) {
    const slide = out.slides[i];
    // Heal grammar-cut fields first, deterministically — a field sitting
    // exactly at its cap mid-sentence is neither over the cap nor
    // ellipsis-marked, so nothing below would ever have looked at it.
    for (const f of await fieldInventory(slide)) {
      const healed = healCutField(f.text, f.cap);
      if (healed && replaceStringValue(slide, f.text, healed)) {
        repaired.push({ index: i, path: f.path, label: f.label, before: f.text, after: healed });
      }
    }
    const inventory = await fieldInventory(slide);
    // A field is a candidate when it exceeds its schema cap outright, when it
    // already carries a mid-sentence ellipsis (a previous trim's cut — exactly
    // what this pass exists to eliminate), or when the slide is floor-flagged
    // (the layout cannot hold its text at a readable size) and the field is
    // long enough to be a plausible cause.
    let over = inventory.filter((f) => f.cap != null && f.length > f.cap);
    over = [...over, ...inventory.filter((f) => /…$/.test(f.text) || /\.\.\.$/.test(f.text)).filter((f) => !over.includes(f))];
    // A field still sitting at its cap with no terminator was cut by the
    // grammar and had no sentence to fall back to — "…improves stability and
    // P", "…than spiro-OM" on a real feature-grid. Deterministic repair cannot
    // invent the missing words, so hand it to the rewrite, which can.
    over = [...over, ...inventory
      .filter((f) => looksCutAtCap(f.text, f.cap))
      .filter((f) => !over.includes(f))];
    if (flagged.get(i)) {
      const long = inventory.filter((f) => f.length > 90);
      over = [...over, ...long.filter((f) => !over.includes(f))];
    }
    if (!over.length) continue;

    onProgress?.({ index: i, total: out.slides.length, type: slide.type, fields: over.length });
    let candidate = null;
    for (let attempt = 0; attempt < 2 && !candidate; attempt++) {
      try {
        candidate = await rewriteSlide({ slide, index: i, inventory: over, research, model, signal, chat });
      } catch (err) {
        problems.push(`slide ${i + 1} (${slide.type}): field-length rewrite failed (${err.message.slice(0, 90)})`);
        break;
      }
    }
    if (!candidate) {
      problems.push(`slide ${i + 1} (${slide.type}): field-length rewrite failed — leaving to the trim`);
      continue;
    }
    // Judge the rewrite by what IT did to THIS slide, never by whether the
    // whole deck is clean. This pass runs BECAUSE a deck has fields over their
    // caps, and it deliberately leaves the hard ones to the deterministic trim
    // — so a whole-deck ok/not-ok gate is false on very nearly every deck it is
    // asked to repair. It used to return the input deck in that case, throwing
    // away every repair it had just made, while still reporting them in
    // `repaired` so the caller believed they had been applied. Observed on a
    // real generated deck: four feature-grid card bodies cut mid-word by the
    // grammar, rewritten correctly here, and shipped cut anyway.
    const before = errorsForSlide((await validateDeck(out)).errors, i);
    const next = structuredClone(out);
    next.slides[i] = candidate;
    const after = errorsForSlide((await validateDeck(next)).errors, i);
    if (after.length > before.length) {
      problems.push(`slide ${i + 1} (${slide.type}): field-length rewrite rejected — ${after[0]}`);
      continue;
    }

    for (const f of over) {
      const was = f.text;
      const now = findFieldText(candidate, f.path, f.text);
      if (now && now !== was) repaired.push({ index: i, path: f.path, label: f.label, before: was, after: now });
    }
    out.slides[i] = candidate;
  }

  // Reported, never acted on: `out` is now never worse than the deck handed in,
  // slide by slide, so what is left is the trim's work and the caller's to know.
  const { errors } = await validateDeck(out);
  if (errors?.length) problems.push(...errors);

  return { deck: out, repaired, problems };
}

/** After a rewrite, the new text of a specific field (by value match fallback). */
function findFieldText(slide, path, prevText) {
  // Walk for the FIRST string under the path whose value is not the old one.
  let found = null;
  const seek = (node, segs) => {
    if (found) return;
    const seg = segs[0];
    if (!seg) return;
    if (seg.endsWith("[]")) {
      const key = seg.slice(0, -2);
      const arr = node?.[key];
      if (Array.isArray(arr)) {
        for (const item of arr) seek(item, segs.slice(1));
      }
    } else if (segs.length === 1 && Array.isArray(node?.[seg])) {
      for (const item of node[seg]) if (typeof item === "string" && item !== prevText) { found = item; return; }
    } else if (typeof node?.[seg] === "string") {
      if (node[seg] !== prevText) found = node[seg];
    } else {
      seek(node?.[seg], segs.slice(1));
    }
  };
  seek(slide, path.split("."));
  return found;
}
