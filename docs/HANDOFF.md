# Handoff — V2-3F-G1 in review; V2-3F awaits independent acceptance; V2-4 NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3E [x] at `001edec`;
V2-3F [~] with all nine slices accepted; final gate + G1 in
review).

## Current state

On `v2`, HEAD `a52cd81` plus docs, evidence, tooling, and this
handoff, to be pushed to `origin/v2` with them. This session
implemented V2-3F-G1 (P1-1 calibration + reproducible evidence)
against `165b902` — nothing else. No geometry, typography,
floor, composition, chrome, or QA-policy changes.

**What landed (2 commits over `165b902` plus this session):**
hyphen-fragment word measurement with boundary tests
(`a52cd81`); committed matrix driver + stress fixtures
(`tools/v2-eval-matrix.mjs`, `test/v2-eval-stress-fixture.js`),
curated evidence (`docs/v2-3f-g1-evidence/`), gate-doc addendum,
roadmap/architecture notes (this commit).

**P1-1 outcome.** Reclassified + narrowly corrected: the six
Head findings were true positives (raster proves mid-word
splits); hyphenated tokens were genuinely over-diagnosed
(raster proves clean hyphen breaks) and now measure as
fragments. Before/after rasters pixel-identical; six findings
preserved; sixteen hyphen findings resolved to zero.
`lineCount` and all text fitting untouched.

**Still true:** all nine slices + gate evidence accepted as
record; structured fixtures closed and byte-identical;
benchmark 50 cells L1/L2 zero; P2 backlog intact (caveat
collision, image seat, chart palette, rule corners,
empty-table, accepted boundaries); V2-4+ not started; BYOK
locale failure still the sole unrelated suite failure.

## Verification

- `npm run typecheck` — exit 0.
- Full `npm test` — 1397 total / 1396 pass (sole failure:
  known BYOK locale).
- New/updated suites green: `test/v2-internal-3f8.test.js`
  27/27 (incl. Head10-15, hyphen-quiet, fragment-fires,
  chart-hyphen cases).
- Benchmark `out/v2-3f-g1` — 50 cells L1/L2 zero.
- Matrix driver verified: 17 decks, 12 families, no
  timestamps, versions recorded.
- Calibration: Inter Bold present (no substitution);
  220 dpi ink analysis attempted but per-token variance
  exposed scanner noise — verdict rests on direct raster
  reads, stated as the precision limit.

## Continue from here

1. Independent review of G1 (commits + `docs/V2-3F-FINAL-
   EVAL.md` addendum + `docs/v2-3f-g1-evidence/`). On
   acceptance, flip V2-3F-G1; the V2-3F accept/reject call
   stays with the reviewer per the gate report.
2. Do NOT begin V2-4, corrective slices (P2s), or another G
   slice without authorization.
