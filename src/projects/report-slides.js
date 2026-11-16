// A project's report back into its deck (F7, deck-from-report): each
// chosen section becomes a slide the host compiles in the project's theme.
// No model — a section's paragraphs are reduced to their lead sentences,
// its references to entries and its table kept as a table — so the slide
// says what the report says, shorter, and the person edits from there.
import { projectStore } from "./backend.js";
import { compileSlide } from "./slide-compile.js";

const refuse = (code, message) => Object.assign(new Error(message), { code });
const ITEM = 200;

// Text cut at a word to fit a point.
export function fitPoint(text, max = ITEM) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), Math.floor(max / 2)))}…`;
}

// The first sentence: a stop after at least a short clause and before a
// capital, so "1." or "e.g." do not end it.
export function leadSentence(paragraph, max = ITEM) {
  const text = String(paragraph ?? "").replace(/\s+/g, " ").trim();
  return fitPoint(/^(.{20,}?[.!?])(?=\s+["“(]?[A-Z]|$)/.exec(text)?.[1] ?? text, max);
}

// One section as the content of one slide, or null when it has nothing.
export function sectionSlide(report, name) {
  const sec = report?.content?.[name];
  if (!sec) return null;
  const blocks = [];
  const paras = (sec.paragraphs ?? []).filter((p) => String(p).trim());
  if (paras.length) blocks.push({ kind: "list", items: paras.slice(0, 5).map((p) => leadSentence(p)) });
  const entries = (sec.entries ?? []).filter((e) => String(e).trim());
  if (entries.length) blocks.push({ kind: "list", items: entries.slice(0, 6).map((e) => fitPoint(e, 240)) });
  const t = sec.table;
  if (Array.isArray(t?.header) && t.header.length && Array.isArray(t.rows)) {
    const width = Math.min(t.header.length, 6);
    const cell = (c) => String(c ?? "").slice(0, 200);
    // The intent's table carries its header as the first row, flagged.
    blocks.push({ kind: "table", header: true, rows: [t.header, ...t.rows.slice(0, 8)].map((r) => r.slice(0, width).map(cell)), ...(t.caption ? { caption: String(t.caption).slice(0, 300) } : {}) });
  }
  if (!blocks.length) return null;
  return { title: String(name).slice(0, 120), purpose: `${String(report.title ?? "").slice(0, 150)} — ${name}`.slice(0, 300), blocks };
}

// The chosen sections compiled as slides that will sit from `index` on, in
// a deck that will then hold `total` slides. Returns the scenes for the
// editor to insert (one undo), in the sections' report order.
export async function reportSlides({ owner = null, admin = false, id, documentId, sections, index = 0, total = null }) {
  const store = await projectStore();
  const { document } = await store.getProjectDocument({ owner, admin, id, documentId });
  if (!document || document.kind !== "report") throw refuse("not-found", "no such report");
  const order = document.body.order ?? Object.keys(document.body.content ?? {});
  const wanted = order.filter((n) => sections.includes(n));
  const slides = wanted.map((n) => sectionSlide(document.body, n)).filter(Boolean);
  if (!slides.length) throw refuse("empty", "those sections have nothing to put on a slide");
  const deckTotal = total ?? index + slides.length;
  const scenes = [];
  for (const [i, slide] of slides.entries()) {
    const scene = await compileSlide({ owner, id }, { slide, index: index + i, total: deckTotal });
    if (!scene) throw refuse("not-found", "no such project");
    scenes.push(scene);
  }
  return scenes;
}
