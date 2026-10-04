# Handoff — V2-3E-1 second correction pass in review, 3E-2/3E-3 NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3E-1 at [~] with a
second correction pass awaiting review; V2-3E-2 QA and V2-3E-3 chrome
pending — no broad QA, no chrome emission, no 3F evaluation).

## Current state

On `v2`, to be pushed to `origin/v2` with this handoff. V2-3E-1 is
NOT accepted: this session is a narrow adversarial correction pass
against `e59f9df`, keeping the accepted DesignSystem → resolved
typography → compiler fitting → SlideScene → renderer architecture.

**Correction (this session):** floor-safe rounding on every canonical
return (`finishScale`: near-boundary raws round up, never below the
bound); mixed-style stack fitting owned by core (`fitStyledStack`
measures each paragraph with its drawn style;
`uniformFloorBound` holds the strongest floor ratio across every
run); compiler `text-fit.ts` combines stack/word/vertical parts
under one bound and diagnoses overruled components instead of
failing silently; stored `fitPolicy` unchanged; stat sub-budgets
stay independent; historical V2-3D baselines byte-identical;
focused 3E-1 baseline byte-identical (no fixture triggers the newly
corrected cases).

**Still true:** all prior slices; deferred families untouched;
free-text/compiler separation tested at scene level; tombstones
remain V2-5; table-cell/chart-internal fitting explicitly out of
scope (native elements, recorded); benchmark judgment V2-3F.

## Verification

- `npm run typecheck` — exit 0.
- `test/v2-fit-3e1.test.js` — 64/64, including: near-boundary
  rounding (0.734→0.74, subhead case), mixed subhead/body floors,
  actual-style measurement proof, legacy comparison/process paths,
  all-12-family + five-theme + legacy emitted-run invariant,
  takeaway-override exact floor, customized mixed-role wrap.
- `test/fit.test.js` (legacy facade) — green, no expectation changes.
- `test/themematrix.test.js` — green.
- Full `npm test` — 1134 total / 1133 pass; sole failure is the
  known pre-existing `byok-budget` locale expectation.
- Six structured pairs scene-sensitive; old indifference files intact.
- Theme semantic projections identical across five themes.
- Boundary live-scan clean; legacy suites green.
- Old-logic control run proved the mixed bug real: representative
  uniform scale emitted body at 12.1pt against its 13pt floor.

## Continue from here

1. V2-3E-1 correction review (pushed implementation + this
   handoff). On acceptance, flip ROADMAP 3E-1 back to [x].
2. V2-3E-2 (deterministic QA completion) — do NOT begin until
   authorized. V2-3E-3 (chrome) likewise. No 3F work.
