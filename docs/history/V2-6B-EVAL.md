# V2-6B Evaluation — durable project history, audit trail & recovery

Date: 2026-10-13. Baseline `af812ad` (V2-6A + V2-6A-1 implemented,
pending acceptance — accepted by this slice, see §16). Parent V2-6
stays in progress. No cloud migration, accounts, collaboration,
CRDTs, sharing, visual diffing, unlimited history, agent runtime,
PPTX import, redesign, or template work.

Drivers: headless `test/v2-projects-6b.test.js` (29/29);
browser `test/v2-edit-chrome-6b.test.js` (4/4, isolated API +
built dist). Evidence: `docs/v2-6b-evidence/` + README.
Architecture deltas: `docs/V2-6-PERSISTENCE-ARCHITECTURE.md` §10.

## Verdict

A user can recover a previous saved version after closing the
application: revisions survive restarts, restoring creates a new
current revision without touching newer history, and stale restores
refuse instead of overwriting. PASS recommended; V2-6B `[~]`
pending independent review.

## 1. Command-engine audit (what exists, what does not)

Inspected `packages/model/engine.ts` (`HistoryEntry` 90–109,
`transact`/`commit` 717–777, `log()` 810–816) against the mission:

| field | status |
|---|---|
| envelope id | recorded (`envelopeId`), duplicates rejected |
| command / batch | recorded as `forward` (effectiveness-filtered) |
| actor + agent attribution | recorded (`actor`, optional `agentId`); production path sends human-only |
| engine revision | recorded (`baseRevision` → `resultingRevision`) |
| forward + inverse ops | recorded; inverses retained for audit/replay only |
| before/after states | recorded as exact snapshot images (the V2-5B-1 lesson) |
| ownership metadata | inside the images (provenance, customized flags, tombstones, z, recipeId) |
| timestamp | ABSENT — nothing in the engine, entry, or `log()` carries wall time |
| durable association | ABSENT — history is process-local; the store held latest-only |

Consequence: durable history cannot be "persist the undo stack".
It is full snapshots per durable revision (recoverable) plus
operation descriptions (audit) — two stores, one transaction.

## 2. Three concepts, three contracts

- **A. Durable saved revision** — a complete, validated project
  document per durable revision number (`v2_project_revisions`
  payload). Reopening and export read these bytes; the compiler is
  never asked to regenerate them.
- **B. Audit record** — the `audit` JSON beside each row: kind
  (`create`/`save`/`rename`/`restore`/`baseline`), save origin,
  actor hint, envelope ids, engine revision, history length,
  summaries. Envelope ids and summaries only — no op payloads, so a
  stored audit entry is data and can never execute.
- **C. Interactive undo/redo** — session-scoped engine snapshots,
  unchanged. Reload and restore start with empty stacks and the UI
  says so. Durable history is not persistent undo (limitation §14).

## 3. Storage design

`src/projects/history.js` + `src/projects/store.js` over the
existing node:sqlite database (WAL, writer lane, `BEGIN IMMEDIATE`
conventions unchanged):

```sql
v2_project_revisions (
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  audit TEXT NOT NULL,   -- JSON description, never executable
  payload TEXT,          -- full document JSON; NULL when compacted
  PRIMARY KEY (project_id, revision)
);
```

Retention: newest **20** payloads per project stay recoverable;
older rows compact to audit-only (payload NULL, metadata kept);
audit-only rows beyond **100** are dropped. The current document is
never pruned; a restore transaction exempts its source revision.
Measured payloads (6-slide deck ~10 KB, 16-slide ~25 KB,
36-slide ~64 KB): 20 snapshots cost ~0.2–1.3 MB per project, so no
compression — complexity without a measurement behind it.

## 4. Atomic save-plus-history

Create/save/rename/restore write the project row, the history row,
and pruning inside one transaction on the existing lane. Verified:
failed saves (validation, malformed provenance) add no row and move
no revision; concurrent same-base writers still serialize to one
winner + one stale; the suite asserts row counts and bytes after
every failure class.

## 5. Migration

Pre-history (V2-6A) rows open byte-identical. The first history
touch captures a `baseline` row from the stored document
(`INSERT OR IGNORE`, concurrency-safe): no fabricated earlier
revisions, no project rewrite. Unknown future `schemaVersion`
still refuses on save and restore paths.

## 6. Provenance

Saves carry optional `provenance` (validated, 422 otherwise):
actor hint, envelope ids committed since the last confirmed save
(coalesced autosaves arrive as several ids), engine revision,
history length, save origin. Undo-then-save records the undone
state honestly (a no-op when it matches the stored state — asserted);
redo-then-save records the redone envelopes plus history length.
Paths that recorded no commands store empty envelope lists, never
invented history. Browser actor strings are descriptive only: the
routes still derive owner/admin from the session, and a
cross-owner write with an agent identity refuses identically.

## 7. Command-boundary findings

- Restore-shaped envelopes (`priorChart`/`priorRows`/`paragraphs`)
  are accepted publicly but run through the identical semantic
  validators as forward edits (`assertChartPayload`,
  rectangularity, paragraph checks) — well-formed ones apply,
  malformed ones refuse with the same codes. No new validator
  hardening was necessary; the boundary is tested, not assumed.
- `element.setLocked` refuses system chrome
  (locked + compiler + no semantic ref) on single and batch paths
  from any actor; ordinary locks keep the toggle.
- Stored audit contains no executable keys (asserted per row), and
  restore replaces whole scene arrays — it never applies stored
  ops. There is no stored inverse to escalate with.

## 8. Restore behavior

`POST :id/restore { revision, baseRevision }`: access check,
precondition check (409 + expected/actual on stale, nothing
written), target load (404 unknown, 410 pruned), re-validation,
then a new revision carrying the historical scenes with current
title/theme/origin (a restore recovers content, not renames).
Historical and newer rows are preserved; the audit records
`restoredFrom`. Concurrent restore-vs-save yields one winner and
one stale with exactly one new history row.

## 9. Access control

History endpoints reuse `canAccessProject` and the session-derived
owner: cross-owner list/get/restore answer 404 without leaking
titles, scenes, or revision existence (asserted, including that
denied restores change no rows); ownerless rows serve local
anonymous callers only; hosted anonymous gets 401 before the
store; admin keeps full access; `FORGE_V2_PROJECTS=0` answers 403.
Delete removes revision rows with the project.

## 10. Browser workflow

Toolbar and per-row History buttons open a restrained dialog:
revision numbers, save times, kind labels (created / saved /
autosaved / renamed / restored-from / baseline), summaries, and
the retention limit stated up front. Selecting a recoverable
revision previews slide count + headlines (no visual diff in this
slice). Restore explains it creates a new revision, requires
explicit confirmation, and offers Save / Discard / Cancel for
unsaved edits; pending text drafts commit first and block on
failure; unapplied chart/table grids never enter payloads (prior
policy, unchanged). Post-restore the editor reloads on the new
revision with cleared undo, stated in the confirmation result.

Two real defects surfaced here, both fixed:

1. `attachEditor` never seated the viewer on attach — opening or
   restoring a project left the stage on stale scenes while the
   filmstrip and engine moved on (invisible when fixture equals
   saved state, which is why V2-6A never saw it). The attach now
   seats viewer scenes silently: no `onSync`, so the
   one-sync-per-commit contract stands (v2-5c green unchanged).
2. Two test-side races (preview measured before load, list read
   before rows) — fixed with waits, not loosened assertions.

## 11. Reload and recovery

Revisions and audits survive process restart (close/reopen
asserted) and browser refresh (recover banner → reopen → restored
revision + wording asserted). Restored documents reopen in the
editor with original scene ids, edit normally, and autosave from
the post-restore revision (rev 2 → edit → rev 3 asserted live).

## 12. Native PPTX after restore

`renderPptx` over the restored document: exact slide count and
order, native chart part, native `<a:tbl>`, no identity
regeneration, no rasterized authored slides — compared against the
historical snapshot, headless-asserted via unzipped OOXML.

## 13. Test results

- `test/v2-projects-6b.test.js` — 29/29 (fail-first:
  `ERR_MODULE_NOT_FOUND` for `src/projects/history.js` on
  isolated `af812ad`).
- `test/v2-edit-chrome-6b.test.js` — 4/4 (same baseline fails at
  build; stale-restore conflict included).
- Regression: V2-6A headless 17/17 + V2-6A-1 18/18 (35/35),
  V2-6A Chrome 5/5, editor/engine/gallery/editor families
  (5c headless+Chrome 30/30 after the attach fix; one initial
  failure caught the sync-contract interaction and was fixed in
  the product, not the test).
- `npm run typecheck` clean; production build green (vite build in
  the Chrome suite).
- Full `npm test` totals recorded in §15.

## 14. Remaining limitations

- Durable history is not persistent interactive undo (by design).
- SQLite remains local-disk storage; no multi-host consistency.
- Retention is bounded and honest: only the newest 20 revisions
  restore; older ones keep descriptions only.
- No full deck-level AI regeneration; no account-claim workflow
  for ownerless projects.
- No visual slide-by-slide diff in the history dialog.

## 15. Full-suite totals

Method: 167 non-browser files in one parallel run, then each
Chrome file serially with a 15-minute watchdog (the roadmap's
known parallel-CDP wedge; no watchdog fired). Recorded at close:

- Non-browser bulk: **1937 tests — 1936 pass, 1 fail**, 0 skipped,
  0 cancelled. The single failure is `test/byok-budget.test.js`
  ("between 10,000 and 50,00,000" vs "5,000,000") — the standing
  BYOK locale failure, out of scope, in code this slice does not
  touch.
- Chrome serial (15 files): **70 tests — 70 pass, 0 fail**,
  0 skipped (5c 7, 5d 4, 5e 5, 5f 5, 5i 6, 5j 5, 5k 9, 6a 5,
  6b 4, chart 2, table 3, fontgate 2, live-chrome 5,
  selection 5, smoke 3).
- **Grand total: 2007 tests — 2006 pass, 1 known fail**, 0 skipped,
  0 cancelled, 0 unexecuted. No incomplete run is counted as passing.
- Focused: 6b headless 29/29, 6b Chrome 4/4.

## 16. Roadmap status

V2-6A and V2-6A-1 marked accepted at `af812ad` (both reviewed
clean with isolated fail-first proof and no regressions); V2-6B
implemented on this branch pending review; V2-6 parent stays
`[ ]` (hosted storage and further editor work open).

## 17. Recommended next slice

Hosted-database replacement of the `ProjectStore` adapter behind
the unchanged interface (history tables included), or the
V2-6A-1 follow-up claim/import workflow for ownerless rows —
whichever the review prioritizes. No AI-agent execution on top of
audit records without a separate execution-authorization design:
audit entries are not commands.
