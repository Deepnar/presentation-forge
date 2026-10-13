# Handoff — V2-6B durable history implemented, pending review

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-4 [x];
V2-5 [~]; V2-5A through V2-5K [x] at `fa557c4`; V2-6A [x] and
V2-6A-1 [x] accepted at `af812ad`; V2-6B [~] pending independent
review with `docs/V2-6B-EVAL.md`; V2-6 parent stays `[ ]`).

## Current state

On `v2`, over `af812ad`. This session built durable, bounded
project revision history with safe restore:

- Storage (`src/projects/history.js`, extended `store.js`):
  `v2_project_revisions` holding full validated snapshots plus
  audit-only JSON (envelope ids/summaries, never op payloads);
  newest 20 payloads recoverable, older rows audit-only, audit
  rows beyond 100 dropped. Every create/save/rename/restore
  commits project row + history row + pruning in one
  lane-serialized transaction. Pre-history projects capture a
  baseline on first touch; unknown versions still refuse.
- HTTP: `GET :id/revisions`, `GET :id/revisions/:rev`,
  `POST :id/restore` — same owner policy, shapes, and caps as
  CRUD (409 stale, 410 pruned, 404/401/403 preserved).
- Client: saves attach envelope ids since the last confirmed save;
  Version History dialog lists/previews (headlines)/restores with
  Save-Discard-Cancel for unsaved edits; restore states it creates
  a new revision and clears session undo.
- Found and fixed live: `attachEditor` never seated the viewer on
  attach, so restores left the stage stale (silent seat, no
  commit sync — v2-5c contract intact, `docs/TRAPS.md` entry).

**Result for the reviewer.** Restoring rev 5 at rev 9 creates rev
10 with rev-5 scenes; history survives restarts; stale restores
refuse; audit cannot execute. Drivers: `test/v2-projects-6b.test.js`
(29/29, fail-first `ERR_MODULE_NOT_FOUND` on isolated `af812ad`)
and `test/v2-edit-chrome-6b.test.js` (4/4 incl. stale conflict)
with evidence in `docs/v2-6b-evidence/`.

## Verification (at push)

- Focused 6b headless 29/29 + Chrome 4/4; regressions 6a 17/17,
  6a1 18/18, 6a Chrome 5/5, 5c headless+Chrome 30/30.
- Typecheck clean; production build green (vite build in suite).
- Full validation (bulk + bounded serial Chrome + 50-cell
  benchmark) — exact totals in `docs/V2-6B-EVAL.md` §15 at close;
  BYOK locale failure out of scope.

## Continue from here

1. Independent review of V2-6B, then V2-6B acceptance.
2. Do NOT begin hosted storage, frontend consolidation, or AI
   integration without authorization.
