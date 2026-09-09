# Handoff — 2026-09-09, repository structural cleanup complete

Read `AGENTS.md`, `CLAUDE.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **Repository-wide structural cleanup**.

## Current state

The repository-wide cleanup roadmap item is complete. The Express entry point
is about 500 lines rather than 3,411 and composes focused route registrars. The
5,199-line layout monolith is a 15-line registry over semantic layout families.
Large React routes retain their state machines while panels and field metadata
live in focused modules; route-level lazy loading reduced the initial bundle
from roughly 647 kB to 321 kB. AI pipeline CLI handling and specimen data are
also separated from their runtime APIs.

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

## Verification

- `npm test` — 812 tests pass.
- `npx vite build --config app/web/vite.config.js` — successful; initial bundle
  is about 321 kB.
- All 55 replacement slides and 34 report pages rasterized successfully and were
  visually inspected as contact sheets.
- PDF export completed through the public render CLI for all three examples.
- `git diff --check` — clean.

## Continue from here

No cleanup work remains. Continue from the next unchecked roadmap item, keeping
the chrome/theme/content boundary and the current route-order contracts intact.
