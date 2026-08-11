import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { DECKS } from "../paths.js";
import { chatJSON } from "./ollama.js";
import { runTurn } from "./turn.js";
import { loadIdentity } from "./identity.js";
import { excerptResearch } from "./research.js";
import { loadTheme } from "../theme.js";
import { render } from "../render.js";
import { preview } from "../preview.js";
import { loadDeck } from "../validate.js";

/**
 * The chat panel's orchestrator, shared by the CLI and the API.
 *
 * Per-deck threads over the turn primitive. The memory model is state over
 * transcript, exactly as the roadmap specifies:
 *
 *   State    current deck.yaml + theme voice + meta.yaml   the files themselves
 *   Recent   last ~10 turns verbatim                      decks/<slug>/chat.jsonl
 *   Durable  extracted standing preferences               decks/<slug>/decisions.md
 *
 * deck.yaml IS the memory: after a turn the result is in the file the model
 * reads every turn, so the transcript only has to carry intent that has not yet
 * been materialised. Older turns collapse into a rolling summary instead of
 * being dropped, so a long session degrades gracefully.
 */

export const RECENT_WINDOW = 10;
const MAX_SUMMARY = 900;

/**
 * Promotes only standing preferences. A one-off request ("make slide 4
 * punchier") is not durable and must never land in decisions.md; a deck-wide or
 * future-facing instruction ("keep it under 12 slides") is. The schema is small
 * because this is the utility role under constrained decoding.
 */
const decisionSchema = {
  type: "object",
  required: ["durable"],
  properties: {
    durable: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        required: ["rule"],
        properties: {
          rule: {
            type: "string",
            maxLength: 200,
            description: "A standing preference, phrased as an instruction that still applies.",
          },
        },
      },
    },
  },
};

const summarySchema = {
  type: "object",
  required: ["summary"],
  properties: {
    summary: {
      type: "string",
      maxLength: MAX_SUMMARY,
      description: "A dense factual account of the retired turns: what was asked, what was applied, and the deck state that resulted.",
    },
  },
};

export function parseJsonl(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean);
}

export function serializeJsonl(records) {
  return records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : "");
}

/**
 * Read a deck's thread: the rolling summary, the recent turns, and the durable
 * decisions. chat.jsonl is one JSON object per line; the summary record sits at
 * the top, turn records after it.
 */
export async function loadThread(dir) {
  let records = [];
  try {
    records = parseJsonl(await readFile(path.join(dir, "chat.jsonl"), "utf8"));
  } catch { /* a deck with no thread yet is a fresh thread */ }
  const summaryRec = records.find((r) => r.type === "summary");
  let decisions = "";
  try {
    decisions = await readFile(path.join(dir, "decisions.md"), "utf8");
  } catch { /* no durable decisions yet */ }
  return {
    summary: summaryRec?.text ?? "",
    turns: records.filter((r) => r.type === "turn"),
    decisions,
  };
}

/** Start the thread over. Standing decisions survive — durable is durable. */
export async function resetThread(dir) {
  await writeFile(path.join(dir, "chat.jsonl"), "", "utf8");
}

/**
 * Split records into what folds into the summary and what stays verbatim.
 * The window counts user turns (each turn is a user + assistant pair).
 */
export function retireOldTurns(records, window = RECENT_WINDOW) {
  const userIdx = records
    .map((r, i) => (r.role === "user" ? i : -1))
    .filter((i) => i >= 0);
  const keep = userIdx.length > window ? userIdx[userIdx.length - window] : 0;
  return { retired: records.slice(0, keep), recent: records.slice(keep) };
}

/**
 * The transcript the model actually sees on the next turn. The deck file is the
 * truth; this carries only un-materialised intent. Promoted instructions are
 * skipped — they live in decisions.md, which runTurn already feeds as system
 * context, so replaying them would be redundant.
 */
export function buildReplayHistory({ summary, turns }) {
  const out = [];
  if (summary) {
    out.push({
      role: "system",
      content:
        "Earlier turns in this thread, summarised. The current deck.yaml is the " +
        "truth — trust it over this.\n" + summary,
    });
  }
  for (const t of turns) {
    if (t.role !== "user" || t.promoted) continue;
    out.push({ role: "user", content: t.instruction });
  }
  return out;
}

/**
 * The pure half of thread maintenance — extracted so the windowing, promotion
 * flagging and record shape are testable without a model or disk.
 */
export function maintainThreadState(thread, { instruction, durable, model, changes, stats, ts }) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const userRec = {
    type: "turn", id: `u-${suffix}`, role: "user", ts,
    instruction, promoted: durable.length > 0,
  };
  const asstRec = {
    type: "turn", id: `a-${suffix}`, role: "assistant", ts,
    model, changes, stats,
  };
  const records = [...thread.turns, userRec, asstRec];
  const { retired, recent } = retireOldTurns(records);
  return { userRec, asstRec, records, retired, recent, decisions: durable };
}

/** One-off requests against a broken deck get the repair demand first. */
export function assembleInstruction(instruction, deckErrors) {
  if (!deckErrors.length) return instruction;
  return (
    "The current deck.yaml is BROKEN — fix these validation errors with your " +
    "edits, then apply the request:\n" +
    deckErrors.map((e) => `- ${e}`).join("\n") +
    `\n\nREQUEST\n${instruction}`
  );
}

async function extractDecisions(instruction, { model, signal }) {
  try {
    const res = await chatJSON({
      role: "utility",
      model,
      signal,
      schema: decisionSchema,
      messages: [
        {
          role: "system",
          content:
            "You classify ONE user instruction in a deck-editing session. A " +
            "standing preference applies to the whole deck or future turns " +
            "('keep it under 12 slides', 'always cite sources', 'use British " +
            "spelling'). A one-off request is about a specific change ('make " +
            "slide 4 punchier', 'add a slide about X') — never promote those. " +
            "Return the standing preferences only; an empty list when there " +
            "are none.",
        },
        { role: "user", content: instruction },
      ],
    });
    return (res.data?.durable ?? []).map((d) => d.rule).filter(Boolean);
  } catch {
    // A utility call must never fail the turn it is bookkeeping for.
    return [];
  }
}

async function collapseSummary(dir, retired, prev, { model, signal }) {
  const transcript = retired
    .map((r) => r.role === "user"
      ? `user: ${r.instruction}`
      : `applied: ${(r.changes ?? []).join("; ") || "no changes"}`)
    .join("\n");
  let decisions = "";
  try {
    decisions = await readFile(path.join(dir, "decisions.md"), "utf8");
  } catch { /* none yet */ }

  const res = await chatJSON({
    role: "utility",
    model,
    signal,
    schema: summarySchema,
    messages: [
      {
        role: "system",
        content:
          "You compress presentation-deck chat history into a short factual " +
          "paragraph: what was asked, what was applied, and the resulting deck " +
          "state. Do not restate standing decisions — they are given separately.",
      },
      {
        role: "user",
        content: [
          prev ? `PREVIOUS SUMMARY\n${prev}` : null,
          decisions.trim() ? `STANDING DECISIONS (do not repeat these)\n${decisions.trim()}` : null,
          `TURNS TO FOLD INTO THE SUMMARY\n${transcript}`,
        ].filter(Boolean).join("\n\n"),
      },
    ],
  });
  return res.data?.summary ?? prev;
}

/**
 * Persist the thread after a turn: append the two records, promote durable
 * decisions, and fold anything past the window into the rolling summary. If
 * the summary call fails the retired turns are kept verbatim instead of being
 * dropped — a full transcript beats a missing one.
 */
async function updateThread(dir, { instruction, turn, model, signal }) {
  const thread = await loadThread(dir);
  const durable = await extractDecisions(instruction, { model, signal });
  const ts = new Date().toISOString();
  const { retired, recent, decisions } = maintainThreadState(thread, {
    instruction,
    durable,
    model: turn.stats?.model ?? null,
    changes: turn.changes ?? [],
    stats: turn.stats ?? {},
    ts,
  });

  let summary = thread.summary;
  if (retired.length) {
    try {
      summary = await collapseSummary(dir, retired, summary, { model, signal });
    } catch {
      summary = thread.summary;
      const next = [
        ...(summary ? [{ type: "summary", text: summary, updatedAt: ts }] : []),
        ...recent,
      ];
      await writeFile(path.join(dir, "chat.jsonl"), serializeJsonl(next), "utf8");
      return { decisions, summary, dropped: 0 };
    }
  }

  const next = [
    ...(summary ? [{ type: "summary", text: summary, updatedAt: ts }] : []),
    ...recent,
  ];
  await writeFile(path.join(dir, "chat.jsonl"), serializeJsonl(next), "utf8");

  if (decisions.length) {
    const existing = thread.decisions.trim();
    const block = decisions.map((r) => `- ${r}`).join("\n");
    const body = existing
      ? `${existing.trimEnd()}\n${block}\n`
      : `# Standing decisions for this deck\n\n${block}\n`;
    await writeFile(path.join(dir, "decisions.md"), body, "utf8");
  }

  return {
    decisions,
    summary,
    dropped: retired.filter((r) => r.role === "user").length,
  };
}

/**
 * One chat turn on a deck.
 *
 * Reads deck.yaml, the thread and the research notes; replays recent intent
 * (not the transcript) into runTurn; validates via runTurn's own repair loop;
 * persists deck.yaml; maintains chat.jsonl / decisions.md; then renders and
 * rasterises so the result is inspectable immediately.
 *
 * The seam is enforced: this edits an existing deck. Building one from empty
 * is generateFromPlan's job — the two are deliberately not merged.
 */
export async function runChatTurn({
  slug, instruction, model, render: doRender = true, onToken, onProgress, signal,
}) {
  if (!instruction?.trim()) throw new Error("instruction is required");
  const dir = path.join(DECKS, slug);
  const deckFile = path.join(dir, "deck.yaml");

  try {
    await stat(deckFile);
  } catch {
    throw new Error(
      `No deck.yaml for "${slug}". Chat edits an existing deck — generate one first.`,
    );
  }

  // A broken deck is a bug; the turn repairs it or reports the failure.
  let deck;
  let deckErrors = [];
  try {
    deck = await loadDeck(deckFile);
  } catch (err) {
    deck = YAML.parse(await readFile(deckFile, "utf8"));
    deckErrors = err.validation ?? [err.message];
  }

  const themeObj = deck?.theme ? await loadTheme(deck.theme) : undefined;
  const identityObj = await loadIdentity(dir);
  const thread = await loadThread(dir);

  let research = "";
  try {
    research = await readFile(path.join(dir, "research", "notes.md"), "utf8");
  } catch { /* no research pass */ }
  research = excerptResearch(research);

  onProgress?.({ status: "reading" });

  onProgress?.({ status: "editing" });
  const turn = await runTurn({
    deck,
    instruction: assembleInstruction(instruction, deckErrors),
    theme: themeObj,
    identity: identityObj,
    decisions: thread.decisions,
    history: buildReplayHistory(thread),
    research,
    model,
    onToken,
    signal,
  });

  if (!turn.ok) {
    return {
      ok: false,
      errors: turn.errors ?? ["turn failed"],
      changes: turn.changes ?? [],
      stats: turn.stats ?? {},
    };
  }

  // deck.yaml is memory — persist it before touching the thread.
  await writeFile(deckFile, YAML.stringify(turn.deck), "utf8");
  const threadUpdate = await updateThread(dir, { instruction, turn, model, signal });

  let previewOut = {};
  if (doRender) {
    onProgress?.({ status: "rendering" });
    const r = await render({ deckFile, themeName: turn.deck.theme });
    const p = await preview(r.outFile, { dpi: 110 });
    previewOut = {
      slides: p.pages.map((f) => path.basename(f)),
      thumbs: p.thumbs.map((f) => path.basename(f)),
      problems: r.problems ?? [],
    };
  }

  return {
    ok: true,
    deck: turn.deck,
    changes: turn.changes,
    diff: turn.diff,
    reasoning: turn.reasoning ?? "",
    stats: turn.stats,
    decisions: threadUpdate.decisions,
    summary: threadUpdate.summary,
    ...previewOut,
  };
}
