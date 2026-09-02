import YAML from "yaml";
import { chatJSON, authorTransport } from "./ollama.js";
import { buildOpsSchema, applyOps, diffDecks, stripForeignFields } from "./ops.js";
import { slideCatalog, deckSchema } from "./catalog.js";
import { validateDeck } from "../validate.js";

/**
 * The turn primitive.
 *
 * Everything that changes a deck goes through here: first generation, a chat
 * instruction, a critic's fix list. A turn takes the current deck plus an
 * instruction and returns a *validated* new deck and a diff.
 *
 * Generation is not a special case — it is a turn against an empty deck. Adding
 * a separate one-shot generate path would duplicate prompt construction,
 * validation and repair, and the two would drift.
 */

// Repair attempts are capped per transport. The local grammar path is slow
// (minutes per call) and a model that has failed twice is not converging, so
// the local ceiling stays low. On a cloud transport a retry is cheap and the
// model is strong enough to profit from another pass at the error list, so it
// gets more room before the turn hands its failures to the caller.
const MAX_REPAIR_LOCAL = 2;
const MAX_REPAIR_CLOUD = 4;

function systemPrompt({ catalog, theme, identity, decisions, synthesis }) {
  const voice = theme?.voice ?? {};
  const lines = [
    "You write presentation CONTENT. You never control layout.",
    "",
    "Colours, fonts, sizes, spacing and positions belong to the theme and the",
    "renderer. Never emit them, never ask for them, never describe them. If a",
    "slide seems to need a layout that does not exist, choose the closest type",
    "and write better content for it.",
    "",
    "You reply with a JSON object of edit operations against the current deck.",
    "Do not restate unchanged slides.",
    "",
    "Emit EVERY operation the instruction requires, in one response. If it asks",
    "for six slides, the ops array contains six append_slide operations. Stopping",
    "after the first is the most common failure — the response is not a sample.",
    "",
    "Operations:",
    '- set_meta {meta:{title,subtitle,sections}}',
    '- append_slide {slide}                    add a slide at the end',
    '- insert_slide {index, slide}             add a slide at a position; index is where it lands, 0-based',
    '- replace_slide {index, slide}',
    '- update_slide {index, patch}             patch merges over the slide; use for small edits',
    '- delete_slide {index}                    remove a slide',
    '- move_slide {index, to}                  reposition a slide; to is 0-based',
    '- duplicate_slide {index}                 copy a slide right after itself',
    "",
    "Indices refer to the deck as it evolves: an insert shifts later slides.",
    "",
    "Structural requests must become ops, never a description of what you would do:",
    "- \"add a slide at the end titled X\" -> append_slide with a real slide object.",
    "- \"delete slide 4\" -> delete_slide {index: 3}. \"duplicate slide 2\" -> duplicate_slide {index: 1}.",
    "- \"move slide 3 after slide 5\" -> move_slide {index: 2, to: 5}.",
    "- \"add a slide titled X after slide 2\" -> insert_slide {index: 2, slide}.",
    "Emit the op directly; do not refuse, do not ask for confirmation, do not",
    "rephrase the request back as a plan.",
    "",
    catalog,
  ];

  if (voice.feel || voice.prefers || voice.avoid) {
    lines.push("", "House style for this deck:");
    if (voice.feel) lines.push(`- Tone: ${voice.feel}`);
    if (voice.headline_style) lines.push(`- Headlines: ${voice.headline_style.trim()}`);
    if (voice.body_style) lines.push(`- Body: ${voice.body_style.trim()}`);
    if (voice.prefers?.length) lines.push(`- Prefer: ${voice.prefers.join("; ")}`);
    if (voice.avoid?.length) lines.push(`- Avoid: ${voice.avoid.join("; ")}`);
    if (voice.density) lines.push(`- Density: ${voice.density}`);
  }

  const subject = identity?.academic?.subject;
  if (subject) lines.push("", `Subject context: ${subject}.`);

  if (decisions?.trim()) {
    lines.push(
      "",
      "Standing decisions from earlier in this deck's history. These are",
      "instructions, and they still apply:",
      decisions.trim(),
    );
  }

  lines.push(
    "",
    "Write specific, declarative prose. Lead with the claim, then the evidence.",
    "Never write filler like 'This slide discusses…'. Never invent statistics.",
    "Every slide must SERVE THIS DECK's topic and section: the headline is a",
    "claim, the body is its support, and a presenter must be able to voice the",
    "'so what' from the slide alone. If a fact does not serve THIS deck's",
    "argument, do not use it — even if it is grounded in the research.",
  );

  // The full-strength bar for cloud authors: the deck-editing surface is where
  // the user feels prose quality, so a cloud model is expected to write like
  // one rather than inherit the conservative local standard.
  if (synthesis === "full") {
    lines.push(
      "",
      "You are writing at full strength — write like a strong writer, not a template:",
      "lead with a specific claim, then its evidence (a named mechanism, a dated",
      "result, a real number from the research). Bullets are complete statements,",
      "each with its own substance. Standfirsts carry a real hook, never a",
      "restatement of the headline. Vary sentence structure; no filler openers,",
      "no hedging. Where the research carries a figure, say it.",
      "Every field has a hard length cap from the schema — a slide whose field",
      "overflows is rejected, so where a field is tight a precise short phrase",
      "beats a long one.",
    );
  }

  return lines.join("\n");
}

/** The deck as the model sees it: compact, indexed, no rendering detail. */
function deckState(deck) {
  if (!deck?.slides?.length) {
    return (
      "The deck is EMPTY — it has 0 slides.\n" +
      "Build it from scratch: call set_meta once for the title and sections, then\n" +
      "append_slide once per slide, in presentation order. There is nothing to\n" +
      "update or replace yet."
    );
  }
  const head = [
    `title: ${deck.title ?? "(unset)"}`,
    deck.subtitle ? `subtitle: ${deck.subtitle}` : null,
    deck.sections?.length ? `sections: ${deck.sections.map((s, i) => `${i}=${s}`).join(", ")}` : null,
  ].filter(Boolean).join("\n");

  const slides = deck.slides
    .map((s, i) => `[${i}] ${YAML.stringify(s).trim().replace(/\n/g, "\n    ")}`)
    .join("\n");

  return `${head}\n\nSlides (0-based):\n${slides}`;
}

/**
 * Run one turn.
 *
 * On validation failure the schema errors are fed straight back — they are
 * written as correction instructions for exactly this loop. Repair attempts are
 * capped: a model that has failed twice is not converging, and returning the
 * errors to the caller beats burning minutes.
 */
export async function runTurn({
  deck,
  instruction,
  role = "author",
  theme,
  identity,
  decisions = "",
  history = [],
  research = "",
  images,
  model,
  onToken,
  signal,
  chat = chatJSON,
}) {
  const catalog = await slideCatalog();
  const base = deck ?? { title: "", slides: [] };
  // Schema is rebuilt per turn so the op set matches what this deck can accept.
  const schema = buildOpsSchema(await deckSchema(), { slideCount: base.slides?.length ?? 0 });
  const synthesis = (await authorTransport({ model })) === "cloud" ? "full" : "local";
  const MAX_REPAIR = synthesis === "full" ? MAX_REPAIR_CLOUD : MAX_REPAIR_LOCAL;

  const messages = [
    { role: "system", content: systemPrompt({ catalog, theme, identity, decisions, synthesis }) },
    ...history,
    {
      role: "user",
      content: [
        "CURRENT DECK",
        deckState(base),
        research ? `\nRESEARCH NOTES\n${research}` : "",
        "\nINSTRUCTION",
        instruction,
      ].filter(Boolean).join("\n"),
    },
  ];

  const attempts = [];

  for (let attempt = 0; attempt <= MAX_REPAIR; attempt++) {
    const res = await chat({
      role,
      model,
      messages,
      schema,
      images: attempt === 0 ? images : undefined,
      onToken: attempt === 0 ? onToken : undefined,
      signal,
    });

    // An op without an `op` field can never be valid — a model that emits one
    // stray `{}` or `{index, patch}` item currently poisons the ENTIRE rewrite
    // (applyOps is transactional), so the coherence/critic fix silently fails
    // even when the other ops were fine. Drop the never-valid items first; a
    // genuinely empty response is reported below like any other no-op, while a
    // response whose ops were ALL malformed goes through the repair loop so the
    // model gets the feedback instead of the caller.
    const rawOps = res.data?.ops ?? [];
    const ops = rawOps.filter((o) => o && typeof o === "object" && typeof o.op === "string");
    attempts.push(
      rawOps.length !== ops.length
        ? { ops: ops.length, dropped: rawOps.length - ops.length, model: res.model }
        : { ops: ops.length, model: res.model },
    );

    const malformed = rawOps.length > 0 && ops.length === 0;
    if (!ops.length && !malformed) {
      return {
        ok: false, deck: base, changes: [], diff: [], ops: [],
        errors: ["The model proposed no changes."],
        reasoning: res.data?.reasoning ?? "", stats: statsOf(res), attempts,
      };
    }

    let applied = applyOps(base, ops);
    // A conversational turn's ops grammar is not narrowed to the slide being
    // edited, so the model can write one type's fields onto another's slide —
    // a request for shorter bullets put a `bullets` array on a before-after
    // slide, which has nowhere to draw them. The deck validated, the turn
    // reported a change, and the rendered slide was identical.
    if (applied.ok) {
      const stripped = stripForeignFields(applied.deck, await deckSchema());
      if (stripped.dropped.length) {
        applied = { ...applied, deck: stripped.deck };
        for (const d of stripped.dropped) {
          applied.changes = [
            ...(applied.changes ?? []),
            `slide ${d.index + 1} (${d.type}): dropped "${d.field}" — that type has no such field`,
          ];
        }
      }
    }
    const problems = malformed
      ? ["all proposed operations were malformed (missing the `op` field)"]
      : [...applied.errors];

    if (applied.ok && !malformed) {
      const { ok, errors } = await validateDeck(applied.deck);
      if (ok) {
        return {
          ok: true,
          deck: applied.deck,
          changes: applied.changes,
          diff: diffDecks(base, applied.deck),
          ops,
          errors: [],
          reasoning: res.data?.reasoning ?? "",
          stats: statsOf(res),
          attempts,
        };
      }
      problems.push(...errors);
    }

    if (attempt === MAX_REPAIR) {
      return {
        ok: false, deck: base, changes: applied.changes, diff: [], ops,
        errors: problems, reasoning: res.data?.reasoning ?? "",
        stats: statsOf(res), attempts,
      };
    }

    // Feed the failure back as the next user turn.
    messages.push(
      { role: "assistant", content: JSON.stringify(res.data) },
      {
        role: "user",
        content:
          `Those operations were rejected:\n` +
          problems.map((p) => `- ${p}`).join("\n") +
          `\n\nEmit a corrected operation list. Fix only what is listed; ` +
          `do not restate operations that were already fine.`,
      },
    );
  }
}

function statsOf(res) {
  return {
    model: res.model,
    fellBack: res.fellBack ?? false,
    promptTokens: res.promptCount ?? 0,
    outputTokens: res.evalCount ?? 0,
  };
}
