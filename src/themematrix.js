import { render } from "./render.js";
import { specimenDeck } from "./specimens.js";
import { listThemes } from "./theme.js";
import { DECKS } from "./paths.js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Every theme against every slide type, as a machine verdict.
 *
 * The renderer already knows when a layout cannot seat its text at a readable
 * size — the fitter reports a floor hit and `render()` returns it in
 * `problems`. What was missing was ever asking it across the whole product:
 * one theme's margin change costs a different theme a slide's body text, and
 * nothing said so. Rendering the specimen deck (one valid payload per type) in
 * every theme with `write: false` answers that in about three seconds, because
 * no .pptx is written and no page is rasterised.
 *
 * This is the deterministic half of the audit only. It proves text fits at a
 * legible size; it says nothing about whether the slide looks like anything.
 * That still needs `tools/themeaudit.mjs` and a pair of eyes.
 */

/** `slide 43 (flow): body would need 12.5pt — floor 14pt` -> its parts. */
function parseProblem(raw) {
  const m = /^slide (\d+) \(([^)]+)\): (.*)$/s.exec(raw);
  return m
    ? { index: Number(m[1]), type: m[2], detail: m[3], raw }
    : { index: null, type: null, detail: raw, raw };
}

/**
 * The specimen deck rendered with institutional chrome off. Branding is a
 * per-install variable — a long institution name reserves more of the title
 * band — so a sweep that included it would report this machine's identity
 * rather than the theme's own budget.
 */
async function matrixDeck() {
  const dir = path.join(DECKS, ".specimen-cache", "__matrix__");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "meta.yaml"), "chrome:\n  branding: none\n", "utf8");
  const deck = await specimenDeck();
  deck.title = "The shape of an argument";
  deck.subtitle = "A neutral specimen";
  return { deck, dir };
}

/**
 * @param {object}   opts
 * @param {string[]} [opts.themes]  theme names, default every theme
 * @param {string[]} [opts.types]   slide types, default every type in the specimen
 * @param {string[]} [opts.modes]   "light" and/or "dark", default light
 * @param {Function} [opts.onRun]   called with each run as it completes
 * @param {object}   [opts.deck]    a real deck instead of the specimen
 * @param {string}   [opts.deckDir] resolve identity and assets from here
 */
export async function themeMatrix({ themes, types, modes = ["light"], onRun, deck: given, deckDir } = {}) {
  const names = themes?.length ? themes : await listThemes();
  const { deck: specimen, dir: scratch } = await matrixDeck();
  // A caller with a real deck passes its directory so identity and branding
  // are the deck's own — a long institution name reserves title-band width,
  // and the pipeline has to budget against the width it will actually get.
  const dir = deckDir ?? scratch;
  // A real deck asks the question the specimen cannot: the specimen's payloads
  // are hand-written to behave, and a model writes headlines of whatever
  // length the topic wants.
  const deck = given ?? specimen;

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
        // A render problem carries the slide's index within the deck that was
        // rendered, which is not its index in the full specimen when --types
        // narrowed the run. Resolve the type from the rendered deck instead.
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

/** Problems grouped by slide type — the view that says what to fix first. */
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

/** Every problem as `theme[/mode] type` keys, for comparing two runs. */
export function signature(result) {
  const keys = [];
  for (const run of result.runs) {
    for (const p of run.problems) {
      keys.push(`${run.theme}${run.mode === "light" ? "" : `/${run.mode}`} ${p.type ?? "?"}`);
    }
  }
  return keys.sort();
}
