# Handoff — 2026-09-05, the report's structure: read it, do not hardcode it

Everything is on `main`. `npm test` is **681 passing** (was 660; every new test
was run against the old code and seen to fail first). `themematrix` is clean
across 34 themes. The working tree is clean.

**Start here.** `AGENTS.md` is the working agreement. `CLAUDE.md` is the
operational map. `docs/PRODUCTION.md` is what stands between here and real
users, and is the thing to read before planning a session. `docs/TRAPS.md` is
the cross-cutting failure list and gained five entries.

## No model was available this session

Both backends were out, which shaped everything below:

- **The TCET gateway is still wedged.** Re-probed today: `/v1/models` answers in
  **0.7s**, a two-token `/v1/chat/completions` still times out at **90s**. Same
  failure shape as before — healthy-looking listing in front of a dead backend.
- **Local Ollama was in use for other work** and deliberately not touched.

So the report's *content* question is still unanswered, and everything below was
verified three other ways: grammar analysis (can the right answer be spelled at
all?), a stub that obeys every bound it is handed, and **rendering real `.docx`
files and reading them back with `pdftotext -layout`**.

---

## What to do next

**1. Generate a report on Auto and read it.** This is unchanged as the top item
and is now the *only* open question on the report path — whether the prose the
model writes into the sections is any good. The machinery underneath it is
verified (below); a stub cannot answer this and neither can local.

```bash
FORGE_HOSTED=1 npm run forge -- report-new "<brief>" --depth full
FORGE_HOSTED=1 npm run forge -- deck-from-report <slug>
```

Read the artefact back, not `report.yaml`: render the `.docx` through the donor,
`soffice --headless --convert-to pdf`, then `pdftotext -layout`.

**2. The turn grammar for chat** (`PRODUCTION.md` §4.1) — `buildOpsSchema` still
merges all 74 types into one flat object for chat. The critic path is fixed;
chat is not, and the product vision puts chat at the centre. Needs no model to
fix, and two candidate directions are already written up.

**3. The browser-coverage direction** (§1.4) — *needs a decision before
building.* Three total outages have shipped that no test could reach. The
recommendation on file is the scripted pass, not component tests.

---

## What this session did

The report is the graded artefact and had never been run end to end. It could
not be run end to end without a model — so the half that does not need one was
run instead, and it found four defects, all of the same family as the five
"the right answer was unrepresentable" findings from the previous session.

**A team of four or fewer got a report with no body.** The section budget was
`targetSections(identity, {min: 4})` — the deck's "one part per presenting
member" rule, borrowed. It counted the TOTAL sections with a floor of four,
while the prompt separately requires the four-section graded core, so every
small team spent its whole budget on the frame and Theoretical Background,
Application and Future Scope were unplannable. `report-new` is solo by
construction and could produce nothing else. **This had already shipped** —
`decks/topic-exploring-first-impressions-and-networ/report.yaml` has no body
section. A report's structure is the institution's, not the team's.

**The section list was ours rather than the template's.** Now read from the
donor (`parseDonorSections` → `reportStructureForDeck`), so a college whose
report has a Methodology gets one by uploading its own template. The graded
eight are the fallback.

**A section the topic earned was dropped.** The planner may now add up to three
of its own; their position is decided during coercion, anchored to the last
structural section listed before them and clamped so nothing can be planted
after the References.

**The writer was told not to repeat sections it was never shown.** Each write
call now carries the plan outline and the opening line of every section already
written — and only prose that passed its own grammar.

Alongside: `deck-from-report` read `meta.yaml` *after* planning (so a companion
deck was always planned at the 24-slide default) and built its brief by walking
the graded eight (so a custom section's prose would have been silently missing).

### Verified by rendering, not by asserting

- `renderReport` end to end on a real model-written `report.yaml`: 10 pages,
  sections ordered, references numbered, and **the two-pass TOC page numbers
  exact on all five sections**.
- A report carrying a topic-specific section: numbered in sequence in both TOC
  and body, its table rendered, the tail renumbered, page numbers exact.
- The whole chain brief → plan → per-section write → assemble → validate →
  render → `.docx` → PDF, against the real donor, producing nine sections with
  the custom one in the right place.
- All three pre-existing `report.yaml` files (none carrying the new `order`
  field) render identically to before — the fallback path is intact.

---

## Instruments worth reusing

- **A stub that ignores the bound it is handed makes the whole file blind to
  bounds.** The report fake returned six sections whatever `maxItems` said. That
  single line is why a solo report with no body survived a passing suite.
  Obedience has to be total: the first corrected stub honoured the plan bound
  and still overran the Acknowledgement's two-paragraph cap, and the dropped
  section read as a planning bug.
- **A test can freeze a defect as an intention.** The old test asserted the plan
  came out as exactly `[Abstract, Introduction, Conclusion, References]` under
  the name "small team, small report". That list *is* the defect.
- **Look for the thing already violating the constant before assuming it is
  load-bearing.** `REPORT_SECTIONS` looked foundational; it was one `filter`.
  `IMAGE_CREDITS` had been proving the renderer was name-agnostic for as long
  as it had existed.
- **When a fixed list stops being fixed, grep the constant, not the function you
  were editing.** `reportBrief` walked it too, three files away.
- **Two individually defensible bounds can be jointly unsatisfiable.** Write
  down one instance that satisfies both and check it is the answer you wanted.

## Known and not fixed

`PRODUCTION.md` §5 and §6 carry the full list. Unchanged this session: the turn
grammar still merges every type for chat; the image progress line prints a slide
index where a counter belongs; `looksCutAtCap` false-positives on at-cap
headlines; `feature-grid` carries two lines of speaker-note debt on
`minimal-muji`. The **deck** side of the near-identical-headline problem is
still unexamined — the report side of it had a mechanical cause and is fixed,
and the deck side may be the same shape.

`decks/vehicle-to-grid-integration-for-electric-bus` remains the fixture worth
keeping. `decks/topic-exploring-first-impressions-and-networ` is now also worth
keeping: its `report.yaml` is the shipped example of a report with no body.
