import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { DECKS } from "../paths.js";
import { chatJSON, researchExcerptCap } from "./ollama.js";
import { excerptResearch } from "./research.js";
import { DIVIDER_TYPES } from "./team.js";
import { healCutField } from "./fieldlength.js";

/**
 * The speaker-script generator — what the presenter SAYS for each slide.
 *
 * A slide's bullets state the shape of an argument; the person presenting has
 * to voice the rest. This writes that rest as spoken prose, one call per slide
 * (the same decomposition that keeps every other writer grammar small): the
 * script bridges the slide's bullets to the deck's full argument, names the
 * "so what" the coherence pass only implies, and fills gaps from the same
 * research the deck was written from. A cloud author gets the full-strength
 * prose budget; the schema stays tiny either way.
 *
 * Output is decks/<slug>/script.md — plain markdown with an invisible
 * `<!-- slide:N -->` marker per block, so a per-slide regeneration replaces
 * exactly that slide's words and nothing else. The markers are HTML comments,
 * invisible when rendered.
 */

/**
 * A spoken segment, bounded well under the grammar-breaking 2000 cap. 60–90
 * seconds of speech is roughly 180–250 words, comfortably inside 1999 chars.
 *
 * A DIVIDER gets a much tighter cap. The prompt has always asked for "a short
 * spoken transition, about 15-30 seconds" on those slides and the writer
 * ignored it: a section divider in a real script came back with a 200-word
 * monologue, the same weight as the content slides around it. An instruction in
 * prose is a hint; the grammar is the part that binds.
 *
 * 600 rather than the ~500 those word counts imply, because a cap the model
 * runs into mid-sentence is its own defect — the segment is healed back to a
 * whole sentence below, and the headroom keeps that from being the normal case.
 * At 800 the writer simply filled it (106 words against a 40-80 target), which
 * is the same lesson again: the model writes to the bound it is given.
 */
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

/** The slide as the script writer needs it: its headline, its content, and who
 *  presents it. Content is flattened so the model sees every field the layout
 *  draws, in slide order. */
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

/**
 * Write one slide's script segment. A divider gets a short transition (15-30
 * seconds — it announces structure, nothing more); a content slide gets the
 * full spoken treatment.
 */
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

  // A segment that stopped exactly at its cap was cut by the grammar, not
  // finished by the writer — the same failure that left six of nine speaker
  // notes ending mid-word on a real deck. A presenter reads this aloud, so a
  // sentence that stops halfway is worse here than anywhere.
  const words = String(res.data?.words ?? "").trim();

  // A segment has to be SPEECH. The grammar asks for a string of minLength 1,
  // which a malformed turn satisfies with a brace: slide 13 of a real script
  // was written as the single character "}" — presented to the reader as the
  // words that presenter says aloud. The same shape as the JSON that reached
  // the report's prose. Throwing routes it to the caller's existing handler,
  // which reports the slide and leaves it blockless for a deliberate retry,
  // and that is strictly better than a brace on the page.
  if (!isSpeech(words)) {
    throw new Error(`unusable segment ${JSON.stringify(words.slice(0, 40))}`);
  }

  const cap = isDivider ? 600 : 1999;
  return healCutField(words, cap) ?? words;
}


/** The spoken prose inside a rendered block, without its heading and byline. */
function spokenWordsOf(block) {
  return String(block ?? "")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("_") && !l.startsWith("<!--"))
    .join(" ")
    .trim();
}

/**
 * Whether a segment is speech rather than syntax.
 *
 * The grammar asks for a string of minLength 1, which a malformed turn
 * satisfies with a brace: slide 13 of a real script was written as the single
 * character "}" and presented as the words that presenter says aloud.
 */
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

/**
 * Generate (or regenerate) the speaker script for a deck.
 *
 * `index` selects ONE slide to rewrite (the per-slide "regen this slide" path);
 * without it every content slide is written. Each slide is one small-grammar
 * call; successful segments replace their `<!-- slide:N -->` block in
 * script.md, failures are reported and leave the previous words in place.
 */
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

  // "Keep previous words" is right for a transient failure and wrong when the
  // previous words are themselves the failure. A block written before the prose
  // guard existed can be a lone brace, and preserving it means the file keeps
  // presenting "}" as what a presenter says. Drop an unusable block so the
  // reader gets the missing-segment note instead of the garbage.
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

  // The file is always rebuilt from the deck's slide order so a deleted slide
  // drops its block and a regenerated one keeps its neighbours' words. Slides
  // that were never written stay blockless — the panel shows them as "not
  // written yet" with a regenerate affordance instead of placeholder text.
  // A slide with no segment gets a visible note IN PLACE OF its block, not a
  // silent gap. script.md is downloadable (Export -> Speaker script), and the
  // panel's "not written yet" affordance does not travel with the file — so a
  // presenter who took the script away found it running 11, 13 with nothing to
  // say a slide was missing. The note sits OUTSIDE the <!-- slide:N --> markers
  // the panel parses, so the affordance is untouched and only the reader of the
  // file gains anything.
  const body = slides
    .map((slide, i) => blocks[i] ?? `> **Slide ${i + 1} (${slide.type}) — no script yet.** Open the deck's Script page to write it.`)
    .join("\n\n");
  await writeFile(file, `${headerFor(deck)}\n\n${body}\n`);

  return { file, slides: slides.length, regenerated, problems };
}
