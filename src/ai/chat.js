import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { DECKS } from "../paths.js";
import { chatJSON, researchExcerptCap } from "./ollama.js";
import { runTurn } from "./turn.js";
import { trimDeckToFit } from "./trim.js";
import { loadIdentity } from "./identity.js";
import { excerptResearch } from "./research.js";
import { loadTheme } from "../theme.js";
import { render } from "../render.js";
import { preview } from "../preview.js";
import { loadDeck } from "../validate.js";

export const RECENT_WINDOW = 10;
const MAX_SUMMARY = 900;

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

export async function resetThread(dir) {
  await writeFile(path.join(dir, "chat.jsonl"), "", "utf8");
}

export function retireOldTurns(records, window = RECENT_WINDOW) {
  const userIdx = records
    .map((r, i) => (r.role === "user" ? i : -1))
    .filter((i) => i >= 0);
  const keep = userIdx.length > window ? userIdx[userIdx.length - window] : 0;
  return { retired: records.slice(0, keep), recent: records.slice(keep) };
}

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

export async function runChatTurn({
  slug, instruction, model, render: doRender = true, onToken, onProgress, signal,
  onlySlides = null,
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
  research = excerptResearch(research, await researchExcerptCap({ model }));

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
    onlySlides,
  });

  if (!turn.ok) {
    return {
      ok: false,
      errors: turn.errors ?? ["turn failed"],
      changes: turn.changes ?? [],
      stats: turn.stats ?? {},
    };
  }

  let edited = turn.deck;
  let trimmedSlides = [];
  const touched = turn.deck.slides
    .map((s, i) => (JSON.stringify(s) !== JSON.stringify(deck.slides?.[i]) ? i : -1))
    .filter((i) => i >= 0);
  try {
    const tr = touched.length
      ? await trimDeckToFit({ deck: edited, themeName: edited.theme, deckDir: dir, signal, onlySlides: touched })
      : { deck: edited, trimmed: [] };
    edited = tr.deck;
    trimmedSlides = tr.trimmed ?? [];
  } catch { /* a trim that cannot run must not lose the user's edit */ }

  await writeFile(deckFile, YAML.stringify(edited), "utf8");
  const threadUpdate = await updateThread(dir, { instruction, turn, model, signal });

  let previewOut = {};
  if (doRender) {
    onProgress?.({ status: "rendering" });
    const r = await render({ deckFile, themeName: edited.theme });
    const p = await preview(r.outFile, { dpi: 110 });
    previewOut = {
      slides: p.pages.map((f) => path.basename(f)),
      thumbs: p.thumbs.map((f) => path.basename(f)),
      problems: r.problems ?? [],
    };
  }

  return {
    ok: true,
    deck: edited,
    changes: [
      ...turn.changes,
      ...(trimmedSlides.length
        ? [`trimmed ${trimmedSlides.length} slide(s) to fit — the edit ran past what the layout holds`]
        : []),
    ],
    diff: turn.diff,
    reasoning: turn.reasoning ?? "",
    stats: turn.stats,
    decisions: threadUpdate.decisions,
    summary: threadUpdate.summary,
    ...previewOut,
  };
}
