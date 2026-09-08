import { chatJSON, authorTransport } from "./ollama.js";
import { buildOpsSchema, applyOps, slideFromOps } from "./ops.js";
import { deckSchema, catalogForType } from "./catalog.js";
import { slideFieldMeta, walkStrings, parseFloorProblems } from "./trim.js";
import { validateDeck, errorsForSlide } from "../validate.js";
import { themeMatrix } from "../themematrix.js";

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

function capForPath(schema, type, path) {
  const rule = schema.definitions.slide.allOf?.find(
    (r) => r.if?.properties?.type?.const === type,
  );
  const resolved = resolvePath(rule?.then?.properties ?? {}, path, schema)
    ?? resolvePath(schema.definitions.slide.properties ?? {}, path, schema);
  if (resolved?.type === "string") return resolved.maxLength ?? null;
  if (resolved?.type === "array") {
    const item = resolved.items?.$ref ? resolveRef(resolved.items.$ref, schema) : resolved.items;
    return item?.type === "string" ? item.maxLength ?? null : null;
  }
  return null;
}

function resolvePath(props, path, schema) {
  const segs = path.split(".");
  let node = props;
  for (const seg of segs) {
    const name = seg.endsWith("[]") ? seg.slice(0, -2) : seg;
    node = deref(deref(node, schema)?.properties ?? node, schema)?.[name];
    node = deref(node, schema);
    if (seg.endsWith("[]")) node = deref(node?.items, schema);
  }
  return node;
}

const deref = (node, schema) => (node?.$ref ? resolveRef(node.$ref, schema) : node);

function labelPath(path) {
  return path
    .replace(/\[\]/, "")
    .replace(/\./g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function resolveRef(ref, schema) {
  return ref.replace(/^#\//, "").split("/").reduce((o, k) => o?.[k], schema) ?? {};
}

function emptiedField(before, after) {
  const byPath = (inv) => {
    const m = new Map();
    for (const f of inv) m.set(f.path, [...(m.get(f.path) ?? []), f.text]);
    return m;
  };
  const was = byPath(before);
  const now = byPath(after);
  for (const [path, texts] of was) {
    const left = now.get(path) ?? [];
    if (left.length < texts.length) return path;
  }
  return null;
}

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

const DANGLING = new Set([
  "a", "an", "and", "or", "but", "the", "of", "to", "in", "on", "at", "by", "for",
  "with", "from", "as", "than", "that", "this", "these", "those", "is", "are",
  "was", "were", "be", "been", "its", "their", "which", "while", "when", "into",
  "over", "under", "per", "via", "up", "out", "off", "if", "so", "not", "no",
]);

export function looksCutAtCap(text, cap) {
  if (typeof text !== "string" || cap == null) return false;
  if (text.length < cap) return false;

  const t = text.trim();
  if (!t) return false;
  if (/[.!?…:;)"'\u2019\u201d]$/.test(t)) return false;

  if (/[-\u2013\u2014/,]$/.test(t)) return true;

  if (!/\s/.test(t)) return false;

  const last = (t.match(/[A-Za-z0-9'\u2019-]+$/) ?? [""])[0].toLowerCase();
  if (!last) return false;
  if (DANGLING.has(last)) return true;
  if (last.length === 1 && !/\d/.test(last)) return true;

  const words = t.split(/\s+/);
  if (words.length >= 3) {
    const capped = words.filter((w) => /^[A-Z0-9]/.test(w)).length;
    if (capped >= words.length - 2 && /^[A-Z]/.test(words.at(-1))) return false;
  }
  return true;
}

export function healCutField(text, cap) {
  if (!looksCutAtCap(text, cap)) return null;

  const m = text.match(/^[\s\S]*[.!?](?=\s|$)/);
  if (!m) return null;
  const healed = m[0].trim();
  if (healed.length < Math.min(40, cap * 0.35)) return null;
  return healed === text ? null : healed;
}

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
    for (const f of await fieldInventory(slide)) {
      const healed = healCutField(f.text, f.cap);
      if (healed && replaceStringValue(slide, f.text, healed)) {
        repaired.push({ index: i, path: f.path, label: f.label, before: f.text, after: healed });
      }
    }
    const inventory = await fieldInventory(slide);
    let over = inventory.filter((f) => f.cap != null && f.length > f.cap);
    over = [...over, ...inventory.filter((f) => /…$/.test(f.text) || /\.\.\.$/.test(f.text)).filter((f) => !over.includes(f))];
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
    const before = errorsForSlide((await validateDeck(out)).errors, i);
    const next = structuredClone(out);
    next.slides[i] = candidate;
    const after = errorsForSlide((await validateDeck(next)).errors, i);
    if (after.length > before.length) {
      problems.push(`slide ${i + 1} (${slide.type}): field-length rewrite rejected — ${after[0]}`);
      continue;
    }
    const lost = emptiedField(inventory, await fieldInventory(candidate));
    if (lost) {
      problems.push(`slide ${i + 1} (${slide.type}): field-length rewrite rejected — it emptied ${lost}`);
      continue;
    }

    for (const f of over) {
      const was = f.text;
      const now = findFieldText(candidate, f.path, f.text);
      if (now && now !== was) repaired.push({ index: i, path: f.path, label: f.label, before: was, after: now });
    }
    out.slides[i] = candidate;
  }

  const { errors } = await validateDeck(out);
  if (errors?.length) problems.push(...errors);

  return { deck: out, repaired, problems };
}

function findFieldText(slide, path, prevText) {
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
