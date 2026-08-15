import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { DECKS } from "../paths.js";
import { chatJSON, researchExcerptCap } from "./ollama.js";
import { excerptResearch } from "./research.js";
import { DIVIDER_TYPES } from "./team.js";

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

/** A spoken segment, bounded well under the grammar-breaking 2000 cap. 60–90
 *  seconds of speech is roughly 180–250 words, comfortably inside 1999 chars. */
const slideScriptSchema = {
  type: "object",
  additionalProperties: false,
  required: ["words"],
  properties: {
    words: {
      type: "string",
      minLength: 1,
      maxLength: 1999,
      description: "The words the presenter says aloud for this slide, as spoken prose.",
    },
  },
};

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
    schema: slideScriptSchema,
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

  return String(res.data?.words ?? "").trim();
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
  const body = slides.map((slide, i) => blocks[i]).filter(Boolean).join("\n\n");
  await writeFile(file, `${headerFor(deck)}\n\n${body}\n`);

  return { file, slides: slides.length, regenerated, problems };
}
