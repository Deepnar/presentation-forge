# Handoff — V2-6A durable projects implemented, pending review

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-4 [x];
V2-5 [~]; V2-5A through V2-5J1 [x]; V2-5K [x] at `fa557c4`;
V2-6A [~] pending independent review with `docs/V2-6A-EVAL.md`;
V2-6 parent stays `[ ]` — cloud replacement is a later slice).

## Current state

On `v2`, over `fa557c4`. This session built V2-6A end to end:
a versioned project document (`packages/projects/` — id, title,
schemaVersion 1, durable revision, timestamps, theme ref, origin,
ordered scenes), a SQLite `ProjectStore` seam (`src/projects/store.js`,
serialized `BEGIN IMMEDIATE` saves, optimistic concurrency, noop
detection), thin HTTP routes (`app/server/v2-projects-routes.js` —
CRUD + stored-document PPTX export, local-anon/hosted-session gating),
a client save-state machine with autosave lane
(`app/web/src/lib/v2project.js`), and viewer workflow
(`SceneViewer.jsx` — Save pill, Projects dialog, refresh recovery,
switch guards, draft policy).

**Result for the reviewer.** Save → refresh → reopen → edit → save
works with byte-identical scenes and no silent overwrites; stale
writers get 409 with edits intact. Undo history does not survive
reload (deferred by design, asserted). No accounts, sharing,
collaboration, imports, renderers, templates, or agent runtime.

## Verification (at push)

- Headless `test/v2-projects-6a.test.js` 15/15; fail-first
  `ERR_MODULE_NOT_FOUND` on isolated `fa557c4`.
- Chrome `test/v2-edit-chrome-6a.test.js` 5/5 (isolated API+dist);
  hosted 401 / traversal 400 / oversize 413 / local 200 by live curl.
- Focused regression family 368/368 (engine through 5k + new).
- `npm run typecheck` clean; production build green; benchmark 50
  cells L1 zero.
- Full `npm test` — exact totals in `docs/V2-6A-EVAL.md` §15
  (background run at close; BYOK locale out of scope).

## Continue from here

1. Independent review of V2-6A (commits, eval doc, architecture doc,
   evidence, both suites, PPTX bytes).
2. Do NOT begin V2-6B (audit log), hosted-DB replacement, layout
   switching, or AI integration without authorization.
