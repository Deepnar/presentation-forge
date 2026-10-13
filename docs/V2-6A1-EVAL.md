# V2-6A-1 Evaluation — project ownership isolation & revision-safe renaming

Date: 2026-10-14. Baseline `a5fa83b` (V2-6A implemented, pending
acceptance). Narrow correctness slice: the project model, engine, and
autosave architecture are untouched; the store's authorization
predicate and rename path are corrected, with the route, client, and
dialog carrying the new contract. Driver:
`test/v2-projects-6a1.test.js` (18/18).

## Verdict

Account-owned projects are no longer reachable across owners,
ownerless rows are no longer public, and renames obey the same
no-lost-update principle as saves. PASS recommended as a correction
to V2-6A; V2-6A stays `[~]` for independent acceptance, V2-6B not
started.

## 1. C1 root cause

`canRead()` in `src/projects/store.js` returned true for any row with
`owner: null`, regardless of the caller. Since the same helper
authorized reads and writes, an authenticated Alice could get, list,
save, rename, delete, and export Bob's rows — and every ownerless
local row — while an anonymous caller could read any account row
through the same hole wherever the route admitted them. The rule
confused "no owner recorded" with "public".

## 2. Corrected policy

One canonical predicate, `canAccessProject(row, { owner, admin })`,
used by get, list, save, rename, delete, and (through get) export:

- admin → allow (established behavior retained);
- otherwise exact match: `(row.owner ?? null) === (owner ?? null)`.

Access matrix (non-admin):

| caller \ row | Alice | Bob | ownerless |
|---|---|---|---|
| Alice | allow | deny (404) | deny (404) |
| Bob | deny (404) | allow | deny (404) |
| anonymous local | deny (404) | deny (404) | allow |
| hosted anonymous | 401 before the store | 401 | 401 |

Local single-user flow is preserved: anonymous local callers keep
full CRUD on the ownerless rows they create. Nothing is silently
claimed — an authenticated visitor gains no access to ownerless rows,
so a future local-to-account migration needs the explicit
claim/import workflow recorded in §9 rather than happening by
accident. IDs remain unguessable but are not the boundary.

## 3. Route and trust audit

Every project route derives `owner`/`admin` from the session via
`resolveProjectOwner` (bearer or cookie session, `isAdmin` from the
user record) — no `req.body.owner` is read anywhere in
`v2-projects-routes.js`, and no `admin` value crosses the HTTP
boundary. Denied lookups answer 404 ("no such project"), leaking
neither scenes, metadata, nor existence beyond the 404 itself.
Unauthorized writes change no bytes and advance no revisions
(asserted by re-reading as the owner after each attempt).

## 4. C2 root cause

`renameProject` took `{ owner, id, title }` with no expected-revision
check: the `WHERE id=? AND revision=?` clause compared the just-read
revision to itself, so two same-base renames both committed and the
second title silently won. The UI likewise sent no base.

## 5. Revision-safe rename API

`PATCH /api/v2/projects/:id` now takes
`{ "title": "New title", "baseRevision": 4 }`. Missing, negative,
non-integer, or otherwise malformed revisions refuse with 422 before
any transaction opens. The check and the write share one `BEGIN
IMMEDIATE` transaction on the existing writer lane: stale bases return
`stale` (409 with `expectedRevision`/`actualRevision`, the same shape
as saves), identical titles return `noop` without advancing, success
advances exactly once with scenes, timestamps aside from `updatedAt`,
and ownership untouched. Failed renames preserve everything
(asserted per class, plus close/reopen durability). Concurrent
same-base renames serialize to one winner and one stale — no sleeps,
the lane orders them. No full-scene retransmit is required.

## 6. Browser rename and autosave interaction

The dialog sends the bound project's durable revision (falling back
to the list row's revision for unopened rows). On success it updates
title and revision only — scenes, undo history, and the dirty/saved
bookkeeping stand, so a rename never marks scene edits saved. On a
stale conflict the row stays open with the attempted title intact for
copy-out, plus a Reload-list action; nothing auto-retries. Because the
bound revision advances on rename success, the next autosave submits
the fresh base instead of going stale forever; an autosave already in
flight with the old base surfaces the standard stale banner with the
existing reload-newer / save-as-new / retry choices. Multi-client
behavior is covered at the store level in both directions
(rename-then-stale-save, save-then-stale-rename).

## 7. Test results

- `test/v2-projects-6a1.test.js` — 18/18: predicate unit, read/list/
  write matrices, rename preconditions, stale/noop/success/concurrency
  races, cross-operation stale pairs, durability reopen, hosted HTTP
  (401, cross-owner 404s with no leak, 409/422 rename shapes, JSON
  owner ignored), local HTTP (anon ownerless CRUD, exact-match both
  ways), traversal 400, oversize 413, `FORGE_V2_PROJECTS=0` 403.
- Fail-first on isolated `a5fa83b`: the C1 read/write tests and the
  concurrent-rename test fail there (3/3 on the filtered run) — the
  cross-owner read returns a document and both renames commit.
- Regression: V2-6A headless 17/17, typecheck clean, production build
  green; engine/gallery/editor/PPTX families plus bulk and bounded
  Chrome totals in §9.

## 8. Remaining persistence risks

Ownerless rows from the V2-6A window stay exactly where they are
(accessible to anonymous local callers only) until the explicit claim
workflow exists. Rename and save share the durable counter, so a busy
multi-editor deck can stale either operation — intended, and both
surfaces offer the same three recoveries. The writer lane is still
per-process; multi-host deployments await the hosted-DB slice.

## 9. Recommendation for V2-6A acceptance

Accept V2-6A with this correction: both findings have isolated
failing-baseline proof, the policy is exact-match everywhere with one
predicate, the rename contract matches saves, and no regressions were
introduced. Suggested follow-ups (not this slice): the explicit
local-to-account claim/import workflow, and per-operation audit
logging for conflict forensics.

## 10. Full-suite totals

Method: bare `npm test` runs the 14 Chrome files in parallel and each
`before()` rebuilds `dist/` — observed `ENOTEMPTY` build collisions
plus the roadmap's known un-bounded-CDP-`send()` wedge. Totals come
from the reliable split instead: 167 non-browser files in one
parallel run, then each Chrome file serially with a 15-minute
watchdog (no watchdog fired).

- Non-browser bulk: **1911 tests — 1910 pass, 1 fail**, 0 skipped.
  The single failure is `test/byok-budget.test.js` ("between 10,000
  and 50,00,000" vs "5,000,000") — the standing BYOK locale failure,
  out of scope, in code this slice does not touch.
- Chrome serial (14 files): **66 tests — 66 pass, 0 fail**,
  0 skipped (5c 7, 5d 4, 5e 5, 5f 5, 5i 6, 5j 5, 5k 9, 6a 5,
  chart 2, table 3, fontgate 2, live-chrome 5, selection 5,
  smoke 3).
- **Grand total: 1977 tests — 1976 pass, 1 known fail**, 0 skipped,
  0 cancelled, 0 unexecuted.
- Focused: correction suite 18/18, V2-6A headless 17/17, related
  engine/editor/gallery/PPTX family 400/400. Typecheck clean,
  production build green, canonical benchmark 50 cells L1 zero.
