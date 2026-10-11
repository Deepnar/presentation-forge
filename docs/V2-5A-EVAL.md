# V2-5A Evaluation — safe native export boundary & editor architecture

Date: 2026-10-11. Baseline `5beba39` (V2-4 accepted). No
editing operations implemented; one fail-closed boundary
plus contracts, tests, and architecture. Drivers: none new
(preflight is headless; OOXML probed directly with JSZip).

## Verdict

Native exports can no longer silently discard authored
information, and the editor has a concrete preservation-safe
command architecture ready for V2-5B. PASS recommended;
V2-5A `[~]` pending independent review, V2-5 parent stays
`[~]`.

## 1. Vulnerability root cause

`addChartElement` passed every authored series to pptxgenjs,
which renders only the first pie/doughnut series — S2 values
never reached the file, with no error. Empty chart/table
payloads hit bare `return`s with the same silence, and an
unknown `chartKind` fell back to `"bar"`. `validateScene`
could not catch any of it: the schema requires the fields'
presence, not their export safety (multi-series pie is
structurally valid). The compiler's V2-4C-2 fallback fixed
its own path; any direct-renderer caller bypassed it.

## 2. Preflight strategy

One authoritative check at `renderPptx` (the canonical
entry; `renderPptxToFile` and all current consumers inherit
it — audit found no other production export adapter):
contract-validate every scene (reusing `validateScene`, no
second schema), refuse multi-series pie/doughnut, empty
chart payloads, and empty tables with slide- and
element-identified `ExportUnsafeError`s, before any byte is
generated. Explicit rejection, never an export-only
fallback — representation changes stay with the compiler
and the future command system. Rotation and other
project-at-best fields are deliberately NOT refused (V2-5
extends fidelity; the header comment says so).

## 3. Rejected unsafe cases (demonstrated)

Multi-series pie and doughnut (slide+element named, remedy
named), zero-series charts, payload-less chart elements,
off-enum chart kinds, contract-invalid scenes, row-less and
payload-less tables, and a later-slide-unsafe multi-slide
deck (single issue, correct identity). Files: no partial
write on rejection, pre-existing files untouched.

## 4. Valid-export compatibility

Single-series pie/doughnut, multi-series cartesian charts
(all series, exact values), compiler fallback scenes (both
series in an editable table, no fake chart part), and all
pre-existing renderer/fallback suites pass unmodified
(23/23 at gate). Content determinism holds modulo
pptxgenjs-global counters and zip/timestamp envelope bytes
(chartN/WorksheetN/TIME normalization in-test) — an honest
scoping of "byte-for-byte", found by failing the naive
assertion twice and reading the diff both times.

## 5. Regression tests

`test/v2-export-preflight-5a.test.js` — 10/10 (all 17 §4
items incl. OOXML value assertions, identity fields,
immutability both ways, sentinel-file preservation). Key
regression proven on baseline by targeted probe (not whole-
file import): `5beba39` renders the 2-series pie with 1
`<c:ser>` and no error; fixed code refuses naming slide
and element.

## 6. Command/revision architecture

`docs/V2-5A-EDITOR-ARCHITECTURE.md`: envelope
(id/cmd/baseRevision/actor), revision integer with
stale-base rejection, history of inverses (undo = apply
inverse, redo = re-apply forward), copy-on-write atomicity
rule for V2-5B, before/after validation with export
preflight as the last boundary, (slideId, elementId)
addressing over compiler/human ids, batch entries for
multiselect, two-layer provenance (scene ownership vs
envelope actor), customization/detachment semantics as
built, five regeneration-suppression rules, D1–D5 open
decisions with owners (tombstones → V2-5C), and V2-5B/C/
later slice plan. Abstract prose refused throughout:
every rule names a file, a shape, or a test.

## 7. Ownership and detachment decisions

As implemented and preserved: compiler→human flip on any
command, geometry `customized` flag, slide `managed→
customized`, locked chrome regenerates uneditable,
human-added carried forward, detached passes through.
Unresolved and owned: D1 tombstones (V2-5C decides with a
test). Testable invariants live in
`test/v2-preservation.test.js` (pre-existing) plus the new
readiness suite (§8).

## 8. Readiness contracts

`test/v2-readiness-5a.test.js` — 5/5, non-mutating:
projection identity is bijective per scene (incl. groups),
lock flags agree across scene/DOM/viewer, refs survive to
`inspect()`, the three layout states read from schema
data, and one compiled deck feeds `sceneToSvg` and
`preflightScenes` with zero mutations. Anything absent
would have been documented; nothing was — the seams exist.

## 9. Legacy demo migration

`packages/editor/demo.html` assigns `target.paragraphs`
and reassigns `scene.elements` in place: no validation, no
customized marking, no inverse, no history — in direct
conflict with §§4–7. Strategy (arch doc appendix): leave
it running until V2-5B, then route its three mutations
through the engine with a history panel as the engine's
first consumer. No second editor, no premature rewrite.

## 10. Browser/server boundary

Confirmed in combination at gate: browser owns mechanics
and ephemeral state, engine owns transitions, envelopes
cross the wire as plain JSON, revision authority follows
the document (browser working copy vs server turns).
Selection/overlays/fonts/live paths re-verified green at
close (viewer 25+3, selection 18+5 Chrome, fonts 7+2,
live 16+5 Chrome).

## 11. Test-infrastructure findings

Parallel-load browser flakes persist (this session: two
live-chrome CDP timeouts + one fonts-4d wobble in full
runs; all green serially). Measured alibi: `vite build`
takes 0.4s solo, 0.5s doubled — build contention is NOT
the mechanism. Prime suspects are LibreOffice CPU hunger
and Chrome multiplicity under 24-way file parallelism;
not isolated further. No code change (a lock around the
wrong resource would be theater); the filed P2-1 follow-up
stands with this measurement attached. The disabled-
Compile click race found in V2-4F testing was fixed
deterministically (wait-for-enabled) and is NOT in this
class. BYOK locale failure untouched, still standing.

## 12. Full test and benchmark results

Close-of-slice full run: **1552 total · 1550 pass · 2 fail ·
0 skipped · 0 cancelled · 0 todo** (1537 baseline + 15 new:
10 preflight + 5 readiness). The two failures: the standing
BYOK locale grouping issue (unrelated, untouched) and one
live-chrome CDP timeout under full parallel load (P2-1
class; the file is 5/5 in isolation, re-verified
post-change). Focused at close: preflight 10/10, readiness
5/5, renderer/fallback/preservation/scene 56/56, typecheck
clean, benchmark 50 cells L1 zero. Per the slice brief this
is reported exactly as measured — not rounded to "one
failure".

## 13. Remaining risks

D1–D5 (§14 of the arch doc); P2-4 export seam is specified
here but implemented only at the renderer, not yet at any
editor-driven path (no such path exists); P2-1 needs its
dedicated pass; hosted live-compile stays env-gated.

## 14. Correction commits within the slice

1. Fail-closed preflight + `ExportUnsafeError` at
   `renderPptx` (the only product-code touch).
2. One V2-4C-1 test updated to the new contract: it
   asserted silent first-series-only output — the exact
   vulnerability — and now asserts typed refusal with
   element identity. No other slice test changed;
   historical eval docs stand as written.

## 15. Proposed next slice: V2-5B command engine

Envelope, revision log, history with undo/redo,
copy-on-write atomic apply with before/after validation,
the five existing ops plus slide add/remove/reorder/
duplicate through it. Headless tests for inverses,
conflicts, batches, rollback. No UI, no persistence.
