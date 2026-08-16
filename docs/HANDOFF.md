# Handoff — 2026-08-16, readability batch complete

The six-item fix batch from the user review is DONE, committed, pushed and
behaviourally verified. Git history carries it: `b597173` (calm sci-fi-hud
background), `236ecd7` (presenters on finalize), `59703e4` (relative-chart
grounding), `2aebd5f` (flow as milestone rail), `6a7b216` (text never on a
rule fill).

## What shipped

- **Sci-Fi HUD background calmed.** The 5 full-height cyan verticals + 2
  horizontals on every slide are gone. The decor is now a thin magenta scan
  bar, three short registration ticks and one baseline — the corner brackets
  and mono labels carry the HUD identity. `mimo-v2.5` confirmed it reads calm
  while still HUD.
- **Presenters now run on finalize.** The write half checkpoints deck.yaml
  per slide DURING the write loop and only assigned presenters in memory at
  the end, so every resume/finalize path re-read a presenter-less file and
  shipped content slides "auto". `assignPresenters()` (team.js) is the single
  shared step, called by generateDeck, the resume continuation AND
  finalizeDeck before flip-to-ready (re-applied after the critic path). The
  user's 11-member deck went through a REAL finalize → all 11 members
  assigned, dividers clean, and the manual 5 the user had typed matched the
  deterministic split exactly. Locked in by `test/finalize-presenters.test.js`
  (full finalize path with a fake chat) + `assignPresenters` unit tests.
- **Relative-chart grounding fixed.** The DIOMP chart (125/55 on a
  "% of MPI+OpenMP" axis) shipped six phantom `[grounding]` notes — the
  extractor flagged the normalised coordinates when the research states the
  percentages ("25% higher bandwidth, 45% lower latency"). `flattenSlide`
  now resolves relative-axis series values to their delta-from-baseline and
  grounds that, dropping the 100-baseline origin; a fabricated coordinate
  whose delta is absent still flags (E1 intact). `deckFigures` keeps the raw
  values so the Research view lists what the geometry draws. The user deck's
  chart now grounds clean.
- **Flow slide redesigned.** The ltr branch drew one cramped row of narrow
  cards hugging the heading (bodies dropped at 5 steps, lower ~40% empty).
  It is now a milestone rail: a baseline across the slide, numbered accent
  chips on it, titles above, bodies filling the zone below. All 5 steps of
  the user's flow slide render title AND body, the slide is filled, and
  `mimo-v2.5` rates it professional with no dead space. The ttb numbered
  spine was checked too and is unchanged.
- **Text never sits on a rule fill.** The real font-visibility bug: the
  geometry layouts drew pill/chip/avatar text on `theme.palette.rule` fills,
  and isometric-dark's `rule` is `#FFFFFF1C` — alpha-stripped to solid white,
  swallowing the near-white `ink`. Five sites (layered-architecture pills,
  ranking chips, before/after pills, branching-flow labels, avatar
  placeholders) now fill with `surface` and use `rule` only as a 1pt outline.
  `mimo-v2.5` confirmed the previously-invisible isometric-dark slide-11 pills
  are legible and the change reads clean in sci-fi-hud and warm-humanist too.
- **Bibliography floor resolved.** The user deck re-renders with ZERO floor
  flags (slide 20 included) — the finalize path's field-length + trim passes
  cleared them.

## The 38-theme contrast audit

`tools/contrast-audit.mjs` renders the geometry slide types (vs, compare,
cards, framework, diagram, flow, checklist, roadmap, chart,
layered-architecture) in every theme into one labelled contact sheet per
type. The sweep's big lesson: **contact sheets are targeters, not verdicts.**
The sheets flagged neumorphism, retro-terminal, sci-fi-hud and chalkboard for
"invisible text" — full-resolution re-renders showed all four were
downsampling artifacts. Only isometric-dark (the rule-fill bug) was real.
The remaining dark-theme muted-body cases (retro-crt 4.79:1, dark-neon
7.52:1, isometric-dark 7.05:1) are above WCAG AA and read fine at full res.

## Known limitations (pre-existing, unchanged)

- The LOCAL author model (`qwen3-coder:30b-a3b-q4_K_M`) is still unreliable
  at multi-slide rewrites (the coherence pass) — same story as last handoff.
  Cloud transport succeeds where local flakes.
- The older `-3` deck (`decks/recent-trends-in-mixed-mode-programming-for-3/`)
  predates the finalize-presenter fix; its presenters were assigned manually
  in the UI. Re-running `forge finalize` on it would now assign them.

## Servers

- `forge_searxng` running in docker (restart via `docker restart forge_searxng`).
- API on :5174, web on :5173, Ollama on :11434 — all left running.
- Kill the throwaway on :5199 from the earlier session before the next
  `npm run dev` if it is still up.

## Model discipline

flash codes ONLY, mimo-v2.5 vision ONLY, local Ollama untouched, cloud used
only for the finalize verification run. All specs durable in
~/.hermes/scripts/prompts/.

## Next session's carry-forward

The queued fix batch is exhausted. Remaining open threads: the coherence-pass
flakiness on the local model, F13 image search, the canvas builder, and the
stretch F1/F2 items from the previous handoff (profile/settings split + theme
thumbnail sizing — user testing, no changes yet).
