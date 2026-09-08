import { render } from "./render.js";
import { specimenDeck } from "./specimens.js";
import { listThemes } from "./theme.js";
import { DECKS } from "./paths.js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function parseProblem(raw) {
  const m = /^slide (\d+) \(([^)]+)\): (.*)$/s.exec(raw);
  return m
    ? { index: Number(m[1]), type: m[2], detail: m[3], raw }
    : { index: null, type: null, detail: raw, raw };
}

async function matrixDeck() {
  const dir = path.join(DECKS, ".specimen-cache", "__matrix__");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "meta.yaml"), "chrome:\n  branding: none\n", "utf8");
  const deck = await specimenDeck();
  deck.title = "The shape of an argument";
  deck.subtitle = "A neutral specimen";
  return { deck, dir };
}

export async function themeMatrix({ themes, types, modes = ["light"], onRun, deck: given, deckDir, notes = false } = {}) {
  const names = themes?.length ? themes : await listThemes();
  const { deck: specimen, dir: scratch } = await matrixDeck();
  const dir = deckDir ?? scratch;
  const deck = given ?? specimen;

  if (notes) {
    for (const s of deck.slides) s.speaker_note ??= "A note the presenter reads aloud while this slide is up.";
  }

  const known = new Set(deck.slides.map((s) => s.type));
  const unknown = (types ?? []).filter((t) => !known.has(t));
  const wanted = types?.length ? deck.slides.filter((s) => types.includes(s.type)) : deck.slides;

  const runs = [];
  for (const theme of names) {
    for (const mode of modes) {
      const one = structuredClone(deck);
      one.slides = structuredClone(wanted);
      const started = Date.now();
      try {
        const r = await render({ deck: one, deckDir: dir, themeName: theme, mode, write: false });
        const problems = r.problems.map((raw) => {
          const p = parseProblem(raw);
          return { ...p, type: p.type ?? one.slides[p.index - 1]?.type ?? null };
        });
        runs.push({ theme, mode, slides: r.slides, ms: Date.now() - started, problems, failed: false });
      } catch (err) {
        runs.push({
          theme, mode, slides: 0, ms: Date.now() - started, failed: true,
          problems: [{ index: null, type: null, detail: err.message, raw: `render threw: ${err.message}` }],
        });
      }
      onRun?.(runs.at(-1));
    }
  }

  return { runs, unknown, total: runs.reduce((n, r) => n + r.problems.length, 0) };
}

export function byType(result) {
  const out = new Map();
  for (const run of result.runs) {
    for (const p of run.problems) {
      const key = p.type ?? "(unattributed)";
      if (!out.has(key)) out.set(key, []);
      out.get(key).push({ theme: run.theme, mode: run.mode, detail: p.detail });
    }
  }
  return [...out.entries()].sort((a, b) => b[1].length - a[1].length);
}

export function signature(result) {
  const keys = [];
  for (const run of result.runs) {
    for (const p of run.problems) {
      keys.push(`${run.theme}${run.mode === "light" ? "" : `/${run.mode}`} ${p.type ?? "?"}`);
    }
  }
  return keys.sort();
}
