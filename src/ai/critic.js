import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { DECKS } from "../paths.js";
import { chatJSON } from "./ollama.js";
import { runTurn } from "./turn.js";
import { roleCanSeeImages } from "./ollama.js";
import { render } from "../render.js";
import { preview } from "../preview.js";
import { loadTheme } from "../theme.js";
import { validateDeck } from "../validate.js";

/**
 * The vision critic loop.
 *
 * Renders a deck, sends each slide PNG to a vision model with a small bounded
 * findings schema, converts any findings into a turn instruction, and lets
 * `runTurn` fix the deck. Re-renders and re-critiques, capped at two rounds —
 * a critic that has not converged twice is arguing with itself, and every round
 * costs a full render plus a model pass per slide.
 *
 * The findings schema must stay small: this is a vision model reading images
 * under constrained decoding, and gemma degrades badly on large grammars.
 */

const MAX_ROUNDS = 2;

const findingsSchema = {
  type: "object",
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        required: ["kind", "detail"],
        properties: {
          kind: {
            type: "string",
            enum: ["overflow", "clipping", "overlap", "contrast", "blank", "other"],
          },
          detail: { type: "string", maxLength: 160 },
          fix: { type: "string", maxLength: 160 },
        },
      },
    },
  },
};

function criticPrompt(deck, index) {
  const s = deck.slides[index];
  const want = s.headline ?? s.quote ?? s.title ?? "(no headline)";
  return [
    "You inspect ONE rendered presentation slide image and report visual defects.",
    `This is slide ${index + 1} of the deck, type "${s.type}". Its headline should read: "${want}".`,
    "Report ONLY defects you can actually see in the image:",
    "- overflow: text clipped at the slide edge or a card edge",
    "- clipping: content cut off",
    "- overlap: text colliding with other text or elements",
    "- contrast: text unreadable against its background",
    "- blank: the slide is empty or a region is wrongly empty",
    "If the slide is fine, findings is an empty array. Never invent a defect.",
  ].join("\n");
}

/** Turn findings into the instruction a `runTurn` fix pass executes. */
function buildInstruction(findings) {
  const lines = findings.map(
    (f) => `- Slide ${f.slide}: ${f.kind} — ${f.detail}${f.fix ? ` Fix: ${f.fix}` : ""}`,
  );
  return (
    "The vision critic found these defects in the rendered deck. Edit the " +
    "CONTENT so they disappear — shorten text, reword, drop a point, or split " +
    "a slide into two of the SAME type. Keep every slide's type as it is, and " +
    "do not touch layout:\n" +
    lines.join("\n")
  );
}

/**
 * The slide types the fix turn is allowed to write: exactly those the findings
 * name.
 *
 * Without this the turn built its grammar from all 73 types at once, and
 * `buildOpsSchema` assigns each type's properties into one flat object — so a
 * name two types share belongs to whichever was walked last. Thirteen types
 * declare `items`; `contact` wins. A model asked to repair a clipped
 * `feature-grid` card was therefore REQUIRED by the grammar to emit
 * `{label, value}` items, and the fix failed validation with "missing required
 * field \"title\"". It could not have succeeded: the correct answer was
 * unrepresentable and the incorrect one mandatory.
 *
 * Scoping also narrows what the turn may do — it cannot change a slide's type
 * or add one of a different type — which is why the instruction above no longer
 * offers those. A prompt that promises what the grammar forbids is the same
 * defect one level up.
 */
function typesInPlay(deck, findings) {
  const types = new Set();
  for (const f of findings) {
    const s = deck.slides[f.slide - 1];
    if (s?.type) types.add(s.type);
  }
  return [...types];
}

/**
 * Critique a deck and fix what the critic finds. `deck` is a deck object; the
 * deck is written to `decks/<slug>/deck.yaml` before each render so the final
 * state on disk is the fixed deck. Returns the round history plus the final
 * deck.
 */
export async function critiqueDeck({ slug, deck, model, onProgress, signal }) {
  let current = deck;
  const report = { slug, rounds: [] };

  // The critic READS IMAGES. `config/models.yaml` declared `vision: true` on
  // the role and nothing enforced it, so in hosted mode — where resolveRole
  // sends every non-author role to the gateway — this loop would post base64
  // slide PNGs to a text model and then edit the deck from whatever came back.
  // Findings invented about an image the model never saw are worse than no
  // critic: the fix turn acts on them. Refuse instead, and say why.
  const sight = await roleCanSeeImages("critic");
  if (!sight.ok) {
    report.skipped = sight.reason;
    report.rounds.push({ round: 0, findings: [], skipped: sight.reason });
    return report;
  }
  const dir = path.join(DECKS, slug);
  const deckFile = path.join(dir, "deck.yaml");
  const themeObj = current.theme ? await loadTheme(current.theme) : undefined;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    onProgress?.({ round, phase: "rendering" });
    await writeFile(deckFile, YAML.stringify(current), "utf8");
    const r = await render({ deckFile, themeName: current.theme });
    const p = await preview(r.outFile, { dpi: 110 });
    // The last round's preview corresponds to the final deck on disk; expose
    // it so callers can show the fixed slides rather than the pre-critique ones.
    report.slides = p.pages.map((f) => path.basename(f));
    report.thumbs = p.thumbs.map((f) => path.basename(f));
    report.problems = r.problems ?? [];

    const findings = [];
    for (let i = 0; i < current.slides.length; i++) {
      onProgress?.({ round, phase: "critiquing", slide: i + 1, total: current.slides.length });
      const img = (await readFile(p.pages[i])).toString("base64");
      const res = await chatJSON({
        role: "critic",
        model,
        images: [img],
        schema: findingsSchema,
        signal,
        messages: [
          { role: "system", content: criticPrompt(current, i) },
          { role: "user", content: "Inspect this slide image." },
        ],
      });
      for (const f of res.data?.findings ?? []) {
        findings.push({ slide: i + 1, ...f });
      }
    }

    const roundRec = { round, findings };
    report.rounds.push(roundRec);

    if (!findings.length) {
      roundRec.clean = true;
      break;
    }
    if (round === MAX_ROUNDS - 1) {
      roundRec.unfixed = findings;
      break;
    }

    onProgress?.({ round, phase: "fixing", count: findings.length });
    const turn = await runTurn({
      deck: current,
      instruction: buildInstruction(findings),
      theme: themeObj,
      model,
      signal,
      onlyTypes: typesInPlay(current, findings),
    });
    if (!turn.ok) {
      roundRec.fixFailed = (turn.errors ?? []).slice(0, 3);
      break;
    }
    const { ok, errors } = await validateDeck(turn.deck);
    if (!ok) {
      roundRec.fixFailed = errors.slice(0, 3);
      break;
    }
    current = turn.deck;
    roundRec.fixed = true;
    roundRec.changes = turn.changes;
  }

  report.deck = current;
  return report;
}
