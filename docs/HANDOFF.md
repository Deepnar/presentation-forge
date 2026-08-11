# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`, which will save you hours. Then
the sections below. This file is overwritten at the end of every session; git
history preserves older handoffs.

## Session summary

State at handoff: **committed and pushed to `origin/main`.** The DOCX report
renderer is built, tested, and verified against the institutional donor; the
roadmap item is ticked.

**The report renderer** (`src/report.js` + `schema/report.schema.json`):

- **Donor approach.** Loads the gitignored `reference/` .docx with jszip,
  keeps every part except the body byte-identical (headers carry the VML
  watermark, footer, styles, settings, theme, all five media assets), and
  rebuilds `word/document.xml` by string surgery: the `<w:document>` opening
  tag and the body-level `<w:sectPr>` (header/footer refs + page geometry) are
  preserved verbatim, only the body between them is replaced.
- **Fixed section order** (the graded constant): Abstract → Acknowledgement →
  Introduction → Theoretical Background → Application → Future Scope →
  Conclusion → References. Emitted in that order regardless of file order,
  present sections numbered 1..N, empty sections skipped gracefully.
- **Cover page** is identity-driven (meta.yaml over config/identity.yaml):
  title, "By {team.label}" (the donor's double line), names/roll/signature
  table, "A {exam_type} Report", subject, guide, "A.Y. {year}".
- **TOC with real page numbers** — two-pass render through
  `libreofficeToPdf` (now a shared helper in `src/preview.js`) + pdftotext.
  The pass file lives in a nested dir because the helper clears its outDir.
- **CLI + API**: `forge report <slug>` (with `--donor`, `--no-toc`),
  `GET/PUT /api/decks/:slug/report`, `POST .../report/render`, download via the
  existing `.../download/report.docx`.
- **Content shape** mirrors the deck pipeline: `decks/<slug>/report.yaml` is
  deck.yaml's sibling (same folder as shared research), schema-validated, depth
  agnostic — so the "Report content depth" item stays a pure generator
  parameter.

**Verified.** `npm test` 43/43 (10 new report tests). Rendered a real report
end-to-end from `decks/gpu-demo/report.yaml` (full identity snapshot in a new
`decks/gpu-demo/meta.yaml`): all 11 chrome parts byte-identical to the donor,
media intact, document.xml well-formed, opens in LibreOffice, and vision-checked
with mimo-v2.5 as **visually indistinguishable from the hand-filled donor
template** — cover structure, TOC table with correct page numbers, headings,
content table, watermark, banner, footer. Donor-missing and ambiguous-donor
paths fail with clear messages. API endpoints smoke-tested via curl.

**Honest limitations.** Word vs LibreOffice pagination can differ by a page, so
the TOC page numbers are guaranteed consistent with the LibreOffice render, not
with what Word will show (the donor's own hand-typed TOC is stale in the same
way). A generated report has no figures — the donor's body images (rId13/14/15)
are preserved in the zip but unreferenced. The report has no UI yet; only the
API + CLI surface exists.

## Context to read before starting

- `AGENTS.md` — the three-layer rule is the thing that must not be violated.
- `docs/TRAPS.md` — fit traps, vision-model trust, "chrome colour derives from
  the painted background".
- `docs/ROADMAP.md` §5 "Reports" — the DOCX renderer item is ticked with
  Learned; Shared research and Report content depth are the next two.
- `src/report.js` — the renderer; the Learned block in the roadmap explains the
  two non-obvious traps (jszip surgery, the pPr-outside-p cell drop).
- `test/donor-fixture.js` + `test/report.test.js` — the synthetic donor and
  the contract tests; `reference/` is gitignored so a fresh checkout has no
  real donor and report tests must keep working off the fixture.
- `decks/gpu-demo/report.yaml` + `meta.yaml` — the working end-to-end example.

## NEXT TASK — shared research, then report content depth

The deck pipeline and the report renderer are done. Next in priority order:

1. **Shared research** — one brief → one research pass → both deck and report.
   Placement is settled (research at `decks/<slug>/research/`, report at
   `decks/<slug>/report.yaml`, both under the same folder); what remains is the
   orchestration: a brief generating both content trees from the same research
   with a human gate.
2. **Report content depth** — depth as a generator parameter (full: four
   paragraphs + table per section; brief: headline + three sentences). The
   renderer is already depth-agnostic, so this is purely a generator change.
3. **Flow layout capacity** — six-step LTR cards are over-capacity for verbose
   bodies; the fit-shrink contains them, a real fix is a layout question.
4. **A report UI surface** — the roadmap says reviewing a report means reading
   sections, not looking at slides, so the UI should be a section reader, not
   the deck grid. API endpoints exist and are unused.

## Remaining known items

Full list with rationale in `docs/ROADMAP.md`. In rough priority order:

- **Shared research** — one brief feeding both deck and report.
- **Report content depth** — depth parameter on the generator.
- **Report UI** — a section-reader surface for report.docx, not the deck grid.
- **Flow layout capacity** — six-step LTR cards over-capacity for verbose
  bodies.
- **Dark-mode / style-variant visual checks** — render+look at each theme in
  `dark` mode and under `airy`/`compact` styles.

## Gotchas

Full list in `docs/TRAPS.md`. The ones most likely to bite immediately:

- **The report donor is gitignored.** `src/report.js` fails loudly when
  `reference/` has zero or several `.docx` files. Tests must use the synthetic
  `test/donor-fixture.js`, never the real donor.
- **`libreofficeToPdf` clears its outDir.** The TOC two-pass must keep the pass
  document in a directory *above* the PDF outDir, or the pass file vanishes
  before soffice runs.
- **A table cell whose `<w:pPr>` escapes `<w:p>` is dropped wholesale.** The
  whole TOC table rendered as a bare heading for one pass. Verify generated
  tables by rendering, not by reading the XML.
- **Page numbers are engine-dependent.** Two-pass TOC numbers are consistent
  with LibreOffice only; Word may repaginate. Expected, not a bug.
- **The fitter's family table is a theme dependency.** A new font family not in
  `FAMILY_CLASS`/`WIDE_SANS` estimates at Inter width and its one-line titles
  wrap. Add the family when you add the theme.
- **Chrome contrast is a luminance knife edge.** `luminance(bg) < 0.45` decides
  the crest/footer variant; a mid-tone accent near the boundary produces
  gray-on-colour footer text.
- **A written `.pptx` proves nothing.** Rasterise and look; vision-check each
  theme on title/section/compare/cards/stats at minimum.
- **`toBuffer()` returns a Buffer.** Destructuring `{ data }` off it yields
  undefined and a swallowed try/catch.
- **Vision QA:** prefer `opencode-go/mimo-v2.5` or `gemma4:26b-a4b-it-q4_K_M`.
- **No browser tool in this CLI.** UI claims must be structural unless a real
  screenshot was inspected.
- **API binds `FORGE_API_PORT` (5174), never `PORT`.**
- **SearXNG must be running** for research (`npm run searxng`).
