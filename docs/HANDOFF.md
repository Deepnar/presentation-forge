# Handoff — 2026-09-10, full website runtime repair

Read `AGENTS.md`, `CLAUDE.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **Repository-wide structural cleanup**.

## Current state

The repository-wide cleanup remains complete. A subsequent exhaustive runtime
audit repaired missing dependencies left by the extraction pass across chat,
Admin, artifact routes, generation routes, report-to-deck conversion and local
streaming. A no-undefined audit now reports only declared browser/Node globals,
and the signed-in browser opens the real populated branches.

Redundant standalone comments were removed across executable source while
comments that preserve an invariant, lint control or non-obvious reason remain.
Provider configuration now supports stable `x-opencode-session` IDs and routes
only `muse-spark-1.3-contributor` through the Responses API. Missing chat
overrides no longer disable finalization repairs, and render CLI PDF export no
longer stalls on a circular dynamic import.

The public showcase contains three visually distinct local examples covering
mixed-mode HPC, first impressions and perovskite solar cells. Each includes
PPTX, presentation PDF, DOCX report and Markdown script. The earlier Muse-only
showcase was removed after visual review found blank renders and repetitive
styling. Parsed model JSON now strips XML-illegal control bytes before content
can reach a deck.

Theme persistence was also the cause of the three Muse examples appearing alike:
the separate generation command ignored `meta.yaml` and fell back to
`warm-humanist`. Generation and finalization now resolve and persist the briefing
theme, with explicit overrides and an existing deck theme taking precedence.

Chat model selection and briefing summaries render again, Admin loads its model
audit, artifact and generation handlers have every extracted dependency, and
the server-reported routing mode survives reload. Requested slide counts are
labelled as content slides because title, divider and closing slides are added
around them.

Personal provider keys can be tested as unsaved drafts without persistence.
The probe follows provider configuration, including Responses-only models, and
key syntax is opaque rather than assuming an `sk-` prefix. Hosted instances now
announce a missing `FORGE_KEY_PEPPER` before Save instead of failing after the
secret is submitted; local self-hosted mode continues using its development
vault default. Muse 1.3 was used only as the controlled generation model for
this audit, not installed as a product-wide restriction.

## Verification

- `npm test` — 813 tests pass.
- `npx vite build --config app/web/vite.config.js` — successful; initial bundle
  is about 322 kB.
- Repository-wide ESLint `no-undef` diagnostic — no application-symbol failures;
  only standard runtime globals and unavailable React-hooks plugin directives.
- A 13-slide Muse briefing was planned, approved, interrupted by a server reload,
  resumed from 11/13, finalized, rendered and inspected as a contact sheet. The
  resulting PPTX and PDF contain all 13 non-blank slides.
- All 55 replacement slides and 34 report pages rasterized successfully and were
  visually inspected as contact sheets.
- PDF export completed through the public render CLI for all three examples.
- `git diff --check` — clean.
- A signed-in browser opened the 17-slide bus-depot project and navigated Deck,
  Report, Research and Script successfully after the project-page repair.

## Continue from here

No known website-runtime defect from this pass remains. The three post-fix Luna
browser rechecks were attempted but their isolated CUA providers were
unavailable; the parent browser performed the signed-in regression instead.
Continue from the next unchecked roadmap item, keeping the chrome/theme/content
boundary and current route-order contracts intact.
