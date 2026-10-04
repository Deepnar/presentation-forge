# Handoff — V2-3E-3 implementation in review, V2-3F NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3E-1 [x], V2-3E-2 [x]
at `82dcd44`; V2-3E-3 [~] awaiting review; V2-3F pending).

## Current state

On `v2`, to be pushed to `origin/v2` with this handoff. This session
implements V2-3E-3 against verified baseline `82dcd44` — no 3F work.
Architecture after this slice:

```text
adapter-resolved ChromeInput → core chrome policy → compiler
→ SlideScene (content + locked chrome) → browser/SVG + PPTX
```

**V2-3E-3 (this session):** new `packages/compiler/chrome.ts`
seam (ChromeInput types, `planDeckChrome`, `emitChromeElements`
with stable `:chrome:*` IDs, `locked: true`, compiler provenance,
no block semanticRef); canonical core policy reused verbatim
(effectiveBranding, planTitleBanner, planContentChrome,
reservationForTopRight, footer .45/1 split); `CONTENT_FOOTER_RESERVE`
canonicalized in core (exact 0.62, daylight derivation); only
schema addition is element `valign`; titleBox narrows by the
primary-crest reserve before fitting while divider titles stay
full-bleed; PPTX projects element opacity→transparency,
valign, family, and path/data-URI images natively; SVG exposes
opacity/valign/identity; `recompileSlide` re-emits/drops chrome by
stable ID with human/orphan/detached preservation intact;
`analyzeDeck` consumes the same chrome plan
(`chrome-not-realized`, `chrome-realization-mismatch`,
`chrome-band-overlap` L1; no generic overlap rule). Legacy
`src/chrome.js` untouched. New `test/v2-chrome-scene-3e3.test.js`
(42 tests). No-chrome output byte-identical; all historical
baselines untouched.

**Still true:** all prior slices; deferred families untouched;
free-text/compiler separation tested at scene level; tombstones
remain V2-5; table-cell/chart-internal fitting out of scope;
benchmark judgment V2-3F.

## Verification

- `npm run typecheck` — exit 0 (see final report).
- `test/v2-chrome-scene-3e3.test.js` — 42/42.
- Listed V2 suites (167) + boundary/renderer/matrix (20) — green.
- Full `npm test` — sole acceptable failure is the known
  pre-existing `byok-budget` locale expectation.
- Historical V2-3 baselines byte-identical (scenes untouched
  without ChromeInput).
- Legacy `src/chrome.js` behavior intact (file untouched,
  facade tests green).

## Continue from here

1. V2-3E-3 review (pushed implementation + this handoff). On
   acceptance, flip ROADMAP 3E-3 to [x] and close V2-3E.
2. V2-3F (theme/plate compatibility + evaluation) — do NOT begin
   until authorized.
