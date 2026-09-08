import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { DECKS } from "../paths.js";
import { chatJSON, researchExcerptCap } from "./ollama.js";
import { excerptResearch } from "./research.js";
import { DIVIDER_TYPES } from "./team.js";
import { healCutField } from "./fieldlength.js";

const slideScriptSchema = (isDivider = false) => ({
  type: "object",
  additionalProperties: false,
  required: ["words"],
  properties: {
    words: {
      type: "string",
      minLength: 1,
      maxLength: isDivider ? 600 : 1999,
      description: isDivider
        ? "A short spoken transition, 40-80 words, ending on a complete sentence."
        : "The words the presenter says aloud for this slide, as spoken prose.",
    },
  },
});

function digestSlide(slide) {
  const { headline, standfirst, type, presenter, ...rest } = slide;
  const lines = [];
  if (headline) lines.push(`headline: ${headline}`);
  if (standfirst) lines.push(`standfirst: ${standfirst}`);
  const walk = (v) => {
    if (typeof v === "string") return [v];
    if (Array.isArray(v)) return v.flatMap(walk);
    if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) =>
      typeof x === "string" || typeof x === "number" ? [`${k}: ${x}`] : walk(x));
    return [];
  };
  for (const [k, v] of Object.entries(rest)) {
    if (k === "notes" || k === "cites" || k === "section") continue;
    if (typeof v === "string") { if (v) lines.push(`${k}: ${v}`); }
    else if (typeof v === "number") lines.push(`${k}: ${v}`);
    else if (Array.isArray(v) || (v && typeof v === "object")) {
      const flat = walk(v).filter((x) => String(x).trim());
      if (flat.length) lines.push(`${k}: ${flat.join(" · ")}`);
    }
  }
  return lines.join("\n");
}

function writerSystem() {
  return [
    "You write SPEAKER SCRIPTS — the words a presenter says aloud for ONE slide",
    "of a presentation. You are not writing slide content; the slide already exists.",
    "",
    "The deck's slides are terse by design: they carry the shape of the argument, not",
    "the argument itself. Your script carries what the presenter voices beyond the",
    "text — the full connection the slide only points at.",
    "",
    "Write in the presenter's voice, as natural spoken English (first and second",
    "person are fine — this is a person talking to a room, not a document).",
    "- Never read the slide verbatim and never say 'this slide shows...'.",
    "- Bridge the bullets to the deck's argument: the 'so what' the slide implies",
    "  but does not state, and how this slide connects to the one before and after.",
    "- Use the RESEARCH NOTES to fill the gaps the slide leaves — where the slide",
    "  says a result, the script says what made it, and the figures come from the",
    "  notes verbatim. Never invent a statistic, name or number.",
    "- Open strongly (a hook, not 'hello everyone, today we will...').",
    "- The whole segment must be speakable in about 60-90 seconds at a natural",
    "  pace — roughly 180-250 words. No stage directions, no bullet lists, no",
    "  headers; one flowing spoken passage.",
  ].join("\n");
}

async function writeSlideScript({
  deck, plan, slide, index, presenter, research, model, signal, chat,
}) {
  const isDivider = DIVIDER_TYPES.has(slide.type);
  const sectionName = plan?.sections?.[slide.section];
  const sectionsNote = plan?.sections?.length
    ? plan.sections.map((s, i) => `${i}=${s}`).join(", ")
    : "";
  const headline = slide.headline ?? slide.quote ?? slide.title ?? slide.type;

  const timing = isDivider
    ? "This is a DIVIDER slide — it announces structure. Keep the script to a short spoken transition, about 15-30 seconds (roughly 40-80 words): what the section ahead covers and why it matters."
    : "Target 60-90 seconds of speech — roughly 180-250 words.";

  const res = await chat({
    role: "author",
    model,
    signal,
    schema: slideScriptSchema(isDivider),
    messages: [
      { role: "system", content: writerSystem() },
      {
        role: "user",
        content: [
          `DECK: ${deck.title ?? plan.title ?? "(untitled)"}`,
          sectionsNote ? `SECTIONS: ${sectionsNote}` : "",
          `THIS SLIDE is number ${index + 1} in the deck.`,
          presenter ? `Presented by: ${presenter}. Write in their voice — what THEY say aloud.` : "",
          sectionName ? `It opens part "${sectionName}".` : "",
          `Its type is "${slide.type}".`,
          "",
          "THE SLIDE'S CONTENT (what is on the slide, not what you write):",
          digestSlide(slide),
          "",
          timing,
          research ? `\nRESEARCH NOTES (ground every figure in these)\n${research}` : "",
          "",
          "Write the presenter's spoken words now.",
        ].filter(Boolean).join("\n"),
      },
    ],
  });

  const words = String(res.data?.words ?? "").trim();

  if (!isSpeech(words)) {
    throw new Error(`unusable segment ${JSON.stringify(words.slice(0, 40))}`);
  }

  const cap = isDivider ? 600 : 1999;
  return healCutField(words, cap) ?? words;
}

function spokenWordsOf(block) {
  return String(block ?? "")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("_") && !l.startsWith("<!--"))
    .join(" ")
    .trim();
}

function isSpeech(words) {
  const w = String(words ?? "").trim();
  return /[A-Za-z]/.test(w) && w.split(/\s+/).length >= 5;
}

const BLOCK_RE = /<!-- slide:(\d+) -->[\s\S]*?<!-- \/slide:\1 -->/g;

function blockFor(index, slide, words) {
  const headline = slide.headline ?? slide.quote ?? slide.title ?? slide.type;
  const presenter = slide.presenter;
  return (
    `<!-- slide:${index} -->\n` +
    `## Slide ${index + 1} — ${headline}\n\n` +
    `_Presenter: ${presenter ?? "—"} · ${slide.type}_\n\n` +
    `${words}\n\n` +
    `<!-- /slide:${index} -->`
  );
}

function parseScript(markdown) {
  const parts = {};
  const re = new RegExp(BLOCK_RE.source, "g");
  let m;
  while ((m = re.exec(markdown))) parts[Number(m[1])] = m[0].trim();
  return parts;
}

function headerFor(deck) {
  return (
    `# ${deck.title ?? "Deck"} — speaker script\n\n` +
    "The words each presenter says aloud, slide by slide. A slide carries the " +
    "shape of the argument; this script carries the connection behind it — the " +
    "full story the bullets point at, grounded in the deck's research. Roughly " +
    "60–90 seconds per content slide.\n"
  );
}

export async function generateScript({
  slug, dir, model, signal, onProgress, chat = chatJSON, index = null,
}) {
  const deckDir = path.resolve(dir ?? path.join(DECKS, slug ?? ""));
  const deck = YAML.parse(await readFile(path.join(deckDir, "deck.yaml"), "utf8"));
  let plan = {};
  try {
    plan = YAML.parse(await readFile(path.join(deckDir, "plan.yaml"), "utf8")) ?? {};
  } catch { /* plan optional for the script */ }
  let research = "";
  try {
    research = await readFile(path.join(deckDir, "research", "notes.md"), "utf8");
  } catch { /* a deck may have no research pass */ }
  research = excerptResearch(research, await researchExcerptCap({ model }));

  const slides = deck.slides ?? [];
  const file = path.join(deckDir, "script.md");
  let existing = "";
  try {
    existing = await readFile(file, "utf8");
  } catch { /* first generation */ }

  const blocks = parseScript(existing);

  for (const [i, block] of Object.entries(blocks)) {
    if (block && !isSpeech(spokenWordsOf(block))) delete blocks[i];
  }
  const targets = index == null
    ? slides.map((_, i) => i)
    : (Number.isInteger(Number(index)) && slides[Number(index)] ? [Number(index)] : []);

  const problems = [];
  const regenerated = [];
  for (const i of targets) {
    onProgress?.({ status: "script", index: i, total: slides.length, type: slides[i].type });
    try {
      const words = await writeSlideScript({
        deck, plan, slide: slides[i], index: i,
        presenter: slides[i].presenter, research, model, signal, chat,
      });
      if (!words) throw new Error("empty script");
      blocks[i] = blockFor(i, slides[i], words);
      regenerated.push(i);
    } catch (err) {
      problems.push(`slide ${i + 1} (${slides[i].type}): ${err.message.slice(0, 120)} — kept previous words`);
    }
  }

  const body = slides
    .map((slide, i) => blocks[i] ?? `> **Slide ${i + 1} (${slide.type}) — no script yet.** Open the deck's Script page to write it.`)
    .join("\n\n");
  await writeFile(file, `${headerFor(deck)}\n\n${body}\n`);

  return { file, slides: slides.length, regenerated, problems };
}
