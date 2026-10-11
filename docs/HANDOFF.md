# Handoff — V2-4 gate evaluated, V2-4F accepted; V2-4 [~]; V2-5 NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3F [x]; V2-4A
[x] at `c5b564a`; V2-4B [x] at `34a758b`; V2-4 [~] pending
reviewer acceptance; V2-4C [~]; V2-4C-1 [~]; V2-4C-2 [~];
V2-4D [x] at `2509968`; V2-4E [x] at `1a52170`; V2-4F [x] at
`c45a473`; gate report `docs/V2-4-FINAL-EVAL.md` with PASS
recommendation).

## Current state

On `v2`, over `c45a473`. This session ran the V2-4 final
integration gate: clean-environment validation, test-total
reconciliation, API safety audit, combination probes,
identical-scene browser/PPTX evidence, export-boundary
probe, and defect triage — plus one narrowly scoped
correction (hosted guard on the live endpoint, test-backed)
and the gate driver/evidence/docs. No features, no V2-5.

**What lands (expect ~3 scoped commits):** hosted guard +
`liveCompileAllowed` matrix + signal pinning
(`v2-scenes-routes.js`, live tests, eval driver env);
gate driver (`tools/v2-4final-eval.mjs`, 16/16 captures
clean, 8×12 native slides); report
(`docs/V2-4-FINAL-EVAL.md`) + evidence
(`docs/v2-4-final-evidence/`, 8 inspected files);
architecture guard note, roadmap (V2-4F accepted, stale
plan lines discharged, two P2 follow-ups filed), and this
handoff.

**Result for the reviewer.** PASS recommended: zero P0/P1,
tracked P2s, full suite 1533–1534/1536 (sole persistent
failure the known BYOK locale one; parallel-load browser
flakes green in isolation), benchmark 50 cells L1 zero,
browser/PPTX pairs agree with only accepted differences.
V2-4 parent stays `[~]` for the reviewer's flip; the two
new follow-ups (export-validation seam, suite parallelism)
are filed P2-4/P2-1.

## Verification (re-verify before push)

- Full `npm test` — 1536 tests; expect 1533–1534 pass,
  BYOK fail, 0 skipped/cancelled.
- `npm run typecheck` — clean.
- Production `vite build` — clean.
- `node tools/v2-benchmark.mjs --raster none` — 50 cells
  L1 zero.
- Focused: live 16+5, selection 18+5, viewer 25+3,
  fonts 7+2 — all green.
- `node tools/v2-4final-eval.mjs` exits 0; tree clean
  after round-trip; `git status` holds only user files.

## Continue from here

1. Independent acceptance: flip V2-4 `[~]` → `[x]` per the
   gate report, or scope a correction slice for any finding
   the reviewer rates above P2.
2. Then plan V2-5 from the §16 prerequisites (export seam
   first). Do NOT begin V2-5 without authorization.
