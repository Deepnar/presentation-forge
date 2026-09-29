# Handoff — 2026-09-29, subtopic-first release + run-safe budgets + source map

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§11 (all five build items ticked with Learned blocks)**.

## Current state

The requested flow change is built, behaviourally validated on
`muse-spark-1.3-contributor` (Responses API via opencode-go — the user's
explicit test-model instruction for this session; NOT Auto, so content
judgements below are labelled muse, not product quality), and pushed to
`origin/main` in small commits. A 17-slide perovskite deck plus a brief
companion report are the proof (`decks/perovskite-solar-cell-stability-
challenges/`, gitignored, deliberately kept on disk as evidence).

- **Subtopic-first generation** (`src/ai/subtopics.js`, `researchSubtopic`,
  `planDeck` fixed sections, `ownersFor`/`owners` through `plan.owners` into
  `distributePresenters`). Solo-deep `mode` + explicit `subtopicCount` in the
  briefing (new Mode/SubtopicCount cards, outline-gate parts editor with
  rename/add/remove/owners). Legacy callers without `mode` are untouched.
- **Run-level BYOK budget** (`withByokRun` + `currentByokRun` ALS):
  plan/write/finalize/report segments reserve once upfront and settle
  actuals; per-call throws remain only for ad-hoc turns. UI continue-on-own-
  key via `lib/budget.js` on all seven generation call sites. Anonymous/CLI
  callers stay unmetered (existing behaviour). Auto caps untouched.
- **Source-mapped references slide** (`research/pages.json` per-source store,
  `src/ai/provenance.js`, `REFERENCE_TYPES` structural everywhere):
  second-to-last, part-scoped "used on slides …", survives all model passes
  verbatim. Rendered and read.
- **Deck→report doors** (deck Export menu, report empty-state generate) plus
  `deckFallbackText` so research-less decks still report from `deck.yaml`.
- **Incidental visual finds, fixed**: model-written `**bold**` stripped at
  the parse seam; model passes no longer paraphrase the source map.

## Verification

- `npm test` — 847/848. The one failure is pre-existing and unrelated
  (`byok-budget.test.js` locale: `50,00,000` vs `5,000,000`); it failed
  before this session.
- `npx vite build` — clean. `git diff --check` — clean.
- Muse live runs: split (4 knowledge-only parts) → per-part research (31
  tagged pages) → fixed-section plan (full coverage) → 16/16 write →
  finalize (references inserted, 17 slides) → report (10 sections, 2 custom)
  → re-finalize after the mapping + passes fixes. Renders viewed: title,
  chart, references, closing all clean.
- `config/models.yaml` research-role routing used for the test was REVERTED;
  the tree has no model-config diff. Test model for PPTs remains
  muse-spark-1.3-contributor per user instruction (overrides the two-model
  orchestration note for testing only).

## Continue from here — next session starts on the recorded items

The user opens a new session for the two §11 items that were recorded, not
built. Start there, in this order:

1. **Canvas-like in-website slide editor — needs direction first.** Do NOT
   build unprompted. Ask which of the three recorded options: (a) form editor
   + more slide types, (b) bounded canvas (move/resize within theme boxes, no
   style escape), (c) full free canvas. Note (c) breaks the chrome/theme/
   content split the moment content sets coordinates or colours. Wait for the
   answer before writing code.
2. **Add-new-slides-by-telling.** Machinery audited working (chat structural
   commands, `POST /api/decks/:slug/slides/:index/insert`, "+ Add slide",
   per-section "+ Add as slide"). Build the visible "tell it what to add"
   entry on the finished deck page, routed into the chat-turn machinery —
   landing it in whatever surface (1) decides.
3. Then the user's own full functional sweep (§"The full functional sweep");
   the UI doors it must exercise (report generate, parts editor, budget
   confirm) are all in place.

Known open defects, still recorded for later: corpus pollution ("path" queries
absorb PATH/Heat-film pages — the relevance floor's job, §"Research and
content flow"); 9th+ part merges at the 8-section ceiling (renderer work, not
planned). Solo CLI decks carry null owners (no named members) — same as
legacy, but a solo identity with a name should own everything.
