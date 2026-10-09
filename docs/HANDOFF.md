# Handoff — V2-3E-3 correction in review, V2-3F NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3E-1 [x], V2-3E-2 [x]
at `82dcd44`; V2-3E-3 [~] awaiting review; V2-3F pending).

## Current state

On `v2`, to be pushed to `origin/v2` with this handoff. This session
is a narrow final-contract correction against `45d5f85` — no 3F work.
Architecture, schema, emitter, renderers, preservation, and QA are
otherwise unchanged from the accepted 3E-3 substance.

**Correction (this session):** `planDeckChrome` validates total
explicit coverage via one central path (`assertChromeCoverage`:
duplicates → unknown IDs → missing IDs, each naming the bad IDs,
failing before any scene emits); `recompileSlide` resolves its
single slide through the same strictness
(`requireSlideChromeInput`). Crest reservation now follows
emission: `topRightReserve` is nonzero only when the plan actually
emits a content mark, so disabled/asset-less crests earn zero
heading width while fallback-only crests still draw with zero
reserve (V2-2 asymmetry intact). No-chrome output unchanged and
byte-identical; all historical baselines untouched.

**Still true:** all prior slices; deferred families untouched;
free-text/compiler separation tested at scene level; tombstones
remain V2-5; table-cell/chart-internal fitting out of scope;
benchmark judgment V2-3F.

## Verification

- `npm run typecheck` — exit 0 (see final report).
- `test/v2-chrome-scene-3e3.test.js` — 54/54, including 12 new
  coverage/reservation tests (missing first/middle/last,
  duplicates, unknown IDs, empty input, analyzeDeck rejection,
  recompile strictness, minimal-branding reserve parity,
  disabled-crest full-width + identical fit evidence, absent-asset
  zero reserve).
- Listed V2 suites (167) + boundary/renderer/matrix/fit (32) — green.
- Full `npm test` — 1210 total / 1209 pass; sole failure is the
  known pre-existing `byok-budget` locale expectation.
- Historical V2-3 baselines byte-identical (zero fixture changes).
- Legacy `src/chrome.js` behavior intact (file untouched).

## Continue from here

1. V2-3E-3 correction review (pushed implementation + this
   handoff). On acceptance, flip ROADMAP 3E-3 to [x] and close V2-3E.
2. V2-3F (theme/plate compatibility + evaluation) — do NOT begin
   until authorized.
