# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`, which will save you hours. Then
the sections below. This file is overwritten at the end of every session; git
history preserves older handoffs.

## THE ROADMAP IS COMPLETE

Every roadmap item is ticked and behaviourally validated. `docs/ROADMAP.md`
has no open entries. The product is end-to-end as the vision describes: a topic
or pile of raw info goes in, a complete themed deck **and** a graded report
come out, local-first, with a human gate at the outline before anything
renders. The submission workflow is one command sequence:

```
forge new "topic" --research --sources <url...>   # research + outline (gate)
forge generate <slug>                             # deck.yaml, rendered
forge report <slug> --generate --depth full       # report.yaml, then the .docx
```

## Session summary

State at handoff: **committed and pushed to `origin/main`.** The two final
roadmap items — Shared research and Report content depth — are built, tested,
and verified end-to-end.

**The report content generator** (`src/ai/report.js`, `generateReport`):

- Mirrors the deck writer's two-stage decomposition: a plan call fixes the
  title and which of the eight fixed graded sections carry content (unknown
  names coerced away, the Abstract/Introduction/Conclusion/References core
  guaranteed), then one call per section constrained to that section's own
  grammar. A section that violates its depth grammar is dropped, never fatal.
- **Depth is a parameter**, not a second generator: full writes three-to-six
  paragraphs (target four) plus a table where one earns its place; brief
  writes a headline statement plus three short supporting sentences and never
  a table (8 KB vs 33 KB for the same report). Remembered in `meta.yaml` as
  `reportDepth` so a later `--generate` keeps the same budget.
- **Shared research orchestration**: reads the same `research/notes.md`, the
  same approved `plan.yaml` and the same merged identity the deck used, and
  refuses to run without research or an approved plan (clear errors). The
  existing outline gate is the human gate for both artefacts.
- **CLI** `forge report <slug> --generate [--depth full|brief] [--no-render]`;
  **API** `POST /api/decks/:slug/report/generate` (SSE, abort-on-disconnect).

**Verified end-to-end** on the committed example `decks/green-hydrogen-
production-how-electrolysis-t-2` (one brief, three explicit sources, one
research pass → 21-slide deck + full-depth 8-section report):

- Deck rendered and vision-checked with mimo-v2.5 across title/cards/compare/
  chart/timeline/callout/stats/flow/references — all clean after content fixes
  (see "Honest limitations").
- Report rendered on the real donor, converted via LibreOffice, vision-checked:
  complete cover (team double line, names table, subject, guide, year), TOC
  with correct page numbers on page 3, content tables, watermark + banner +
  footer intact, References numbered.
- **Fact agreement**: spot-checked 1789 / 1800 / 1806 / 1888 / 1.23 V /
  53 kWh/kg / 180 GW by 2030 / voltaic pile / Troostwijk / Lachinov / nanogap /
  PEM — deck and report agree on all of them.
- Tests: 65 passing (report-generator 17 + research 4 + the previous 43).

## Honest limitations

- **Deck content quality is the pre-existing weak spot, not the report.** The
  deck writer produced two slides with Chinese characters leaking in
  (constrained-decoding pressure), a references slide with 98 sources, and the
  known flow-layout capacity collision — all fixed by content edits on the
  example deck, not in the writer. The flow-layout capacity item from the old
  "remaining known" list is a real layout question that still deserves a pass.
- **Deck vs report fact agreement is spot-checked, not exhaustive.** The report
  is grounded (four paragraphs per section, real sources); the deck writer
  still occasionally invents or mis-assigns (a stats slide said "47 GW" as the
  "low estimate" — the research actually lists 104 GW as one 2030 projection
  and 180 GW as another). The two artefacts agree where they overlap, but the
  deck writer is the looser of the two.
- **Word vs LibreOffice pagination** can differ by a page, so TOC page numbers
  are consistent with the LibreOffice render, not Word. Known, expected.
- **A generated report has no figures** — the donor's body images are preserved
  in the zip but unreferenced.
- **No report UI yet.** Only CLI + API exist; the roadmap's (untracked) idea of
  a report section-reader surface is still open, as are dark-mode/style-variant
  visual checks and the flow-layout capacity fix.

## Context to read before starting

- `docs/ROADMAP.md` §5 "Reports" — both items ticked with Learned blocks that
  record the two non-obvious traps (the `maxLength: 2000` grammar death, and
  the unbounded-research context overflow).
- `docs/TRAPS.md` — the maxLength-2000 entry is the newest; the constrained-
  decoding section is the load-bearing one.
- `src/ai/report.js` — the generator; `src/report.js` — the renderer.
- `src/ai/research.js` — `excerptResearch`, the model-facing research cap.
- `decks/green-hydrogen-production-how-electrolysis-t-2/` — the working
  end-to-end example (deck + full report + research committed together).
- `test/report-generator.test.js`, `test/research.test.js`, `test/report.test.js`
  + `test/donor-fixture.js` — the contract tests; `reference/` is gitignored so
  a fresh checkout has no real donor and report tests must keep working off the
  fixture.

## Known open work (not roadmap items)

- **Report UI** — a section-reader surface for report.docx; API endpoints exist
  and are unused.
- **Flow layout capacity** — six-step ttb cards collide with the footer even at
  short bodies; four steps fit. A layout question, not content.
- **Deck writer grounding** — occasional invented stats and non-Latin leaks
  under grammar pressure; the report writer is noticeably tighter.
- **Dark-mode / style-variant visual checks** — render + look at each theme in
  `dark` mode and under `airy`/`compact` styles.

## Gotchas

Full list in `docs/TRAPS.md`. The ones most likely to bite immediately:

- **`maxLength: 2000` on a string item silently kills Ollama's grammar.** 1999
  works; 2000 does not, with no error. Any schema work must stay under it and
  keep the walk-the-schemas test.
- **Research is unbounded; the model must not see all of it.** `excerptResearch`
  caps the model-facing text at 80K chars. If you raise a role's `num_ctx`,
  consider raising the cap too — never remove it.
- **The report donor is gitignored.** `reference/` must have exactly one `.docx`
  or the renderer fails loudly. Tests use `test/donor-fixture.js`, never the
  real donor.
- **`libreofficeToPdf` clears its outDir.** The report TOC two-pass keeps its
  pass document above the PDF outDir.
- **A table cell whose `<w:pPr>` escapes `<w:p>` is dropped wholesale.** Verify
  generated tables by rendering, not by reading XML.
- **`forge new` without `--research` gathers no research** — but sources now
  imply research, so `--sources` alone is enough.
- **Vision QA:** prefer `opencode-go/mimo-v2.5`; distrust qwen3-vl's false-clean
  verdicts. Batch slides, never one image — it reports "clean" lazily.
- **API binds `FORGE_API_PORT`, never `PORT`.**
- **SearXNG must be running** for meta-search research (`npm run searxng`); the
  container maps to `127.0.0.1:8888`.
