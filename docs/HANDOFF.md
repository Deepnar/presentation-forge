# Handoff — V2-6A-1 ownership and rename corrections implemented, pending review

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-4 [x];
V2-5 [~]; V2-5A through V2-5K [x] at `fa557c4`; V2-6A [~]
with `docs/V2-6A-EVAL.md`; V2-6A-1 [~] pending independent
review with `docs/V2-6A1-EVAL.md`; V2-6 parent stays `[ ]`).

## Current state

On `v2`, over `a5fa83b`. This session fixed the two V2-6A review
findings without touching the project model, engine, or autosave
architecture: C1 exact-match ownership (`canAccessProject` shared by
get/list/save/rename/delete/export — ownerless rows never public, no
silent claiming) and C2 revision-gated renames (`baseRevision`
required, transactional stale/noop, carried through PATCH, client,
and dialog with drafts preserved). Driver:
`test/v2-projects-6a1.test.js` (18/18, fail-first 3/3 on isolated
`a5fa83b`).

**Result for the reviewer.** Cross-owner reads/writes refuse with
404s that leak nothing; same-base renames serialize to one winner +
one stale; the rename dialog keeps drafts and never marks scenes
saved. No accounts, hosted-DB, or redesign work started.

## Verification (at push)

- New `test/v2-projects-6a1.test.js` 18/18 (store matrices, rename
  races, hosted/local HTTP with seeded sessions).
- Existing V2-6A headless 17/17 (updated to the rename contract);
  typecheck clean; production build green.
- Full validation (bulk + bounded serial Chrome incl. the 6a browser
  suite against the new client) — exact totals in
  `docs/V2-6A1-EVAL.md` §10 at close; BYOK locale out of scope.

## Continue from here

1. Independent review of V2-6A-1, then V2-6A acceptance.
2. Do NOT begin durable history, hosted storage, or further frontend
   work without authorization.
