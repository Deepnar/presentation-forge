# Handoff — V2-2E landed, V2-2F not started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-0 through V2-2E ticked
with Learned blocks; V2-2F specified; V2-3+ unchanged).
External reference:
`PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md` (untracked root input,
not a roadmap).

## Current state

On `v2`, to be pushed to `origin/v2` with this handoff. V2-2E
implemented as E1–E5 per the corrected instruction set (ReportSpec
naming fixed at generation, vocabulary in model, cover without title,
derived section list, facade compatibility, bytes boundary).

**V2-2E (this session):** `ReportSpec` schema-first model contract
(verbatim validation semantics, legacy-named messages preserved,
differential proof), `packages/model/report.ts` (default sections,
reserved appendix name, ordering policy), `packages/renderer-docx/`
(`render.ts`, `body.ts`, `donor.ts`, `pagination.ts`, `types.ts` —
bytes in/out, jszip-local), `src/report.js` as delegating facade +
orchestrator (public API and CLI unchanged), AI planner/vocabulary
imports pointed at the model domain module.

**Still true:** all prior slices; `subtitle` schema-valid but
unrendered; quirks preserved verbatim; LibreOffice/Poppler remain
external QA/orchestration only; `design.js` gone; chrome/plate deferred
(V2-2F/compat); general rotation deferred (V2-5).

## Verification

- `npm run types:generate` + drift — clean.
- `npm run typecheck` — exit 0 (model + core + both renderers + usage).
- Full `npm test` — 975 tests, 974 pass, sole failure the pre-existing
  `byok-budget` locale expectation.
- Legacy report suites (incl. LO two-pass/preview, ran unskipped),
  credits, structure, AI report/prose/generator suites — all green
  through facades.
- Canonical-vs-legacy `document.xml` byte-identical on the donor
  fixture; untouched donor parts byte-identical.
- Boundary live-scan clean (`renderer-docx`: model-relative + jszip
  only; jszip rejected elsewhere incl. renderer-pptx).

## Continue from here

1. V2-2E review (pushed implementation + this handoff). Do NOT start
   V2-2F until approved.
2. On approval: V2-2F per the roadmap slice — renderer-neutral chrome
   geometry/policy, brand adapter boundary, locked-scene-element
   contract for V2-3; no drawing moves.
