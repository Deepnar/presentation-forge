# V2-6A Evaluation — durable project storage and revision-safe save/load

Date: 2026-10-13. Baseline `fa557c4` (V2-5K gallery, accepted as the
foundation — see §17). No accounts, collaboration, sharing, imports,
dashboard redesign, renderers, templates, or agent runtime.
Drivers: headless `test/v2-projects-6a.test.js` (15/15);
browser `test/v2-edit-chrome-6a.test.js` (5/5, isolated API + static
dist). Evidence: `docs/v2-6a-evidence/` + README.
Architecture: `docs/V2-6-PERSISTENCE-ARCHITECTURE.md`.

## Verdict

A user can save a presentation, refresh or close, reopen the saved
project, and keep editing the same authoritative scenes — with stale
writers refused instead of silently overwriting. PASS recommended;
V2-6A `[~]` pending independent review, V2-6 parent stays `[ ]`
(phase one of several).

## 1. Existing-storage audit (what was reused)

- **Database:** `src/db.js` (node:sqlite, WAL) already backs users,
  sessions, keys, prefs, and events. One new table (`v2_projects`)
  reuses it — no new dependency, as required.
- **Filesystem decks:** `decks/<slug>/{deck,meta}.yaml` are the legacy
  AI-pipeline artefact store with per-file YAML writes and no revision
  counter. Reused nothing from it: it has no optimistic concurrency,
  and V2 scenes are not DeckYAML. The new store does not read or write
  legacy decks.
- **Uploads/generated:** `decks/<slug>/assets/`, `out/deck.pptx`,
  `.plate-cache/`, `brand/generated/` are gitignored outputs —
  explicitly NOT treated as durable (architecture §3).
- **Auth:** the existing session gate (`resolveUser`, `isAdmin`,
  `canAccessDeck` rule) is reused for hosted scoping; no accounts were
  added.
- **Hosted gating:** the `liveCompileAllowed` pattern (public local,
  gated hosted, env override) is mirrored by `projectsAllowed` plus a
  session requirement on hosted.

## 2. Persistent project contract

Versioned envelope (`packages/projects/`, schema + pure helpers):
stable `p-`+hex id minted once, title, `schemaVersion: 1`, durable
`revision`, ISO timestamps, optional theme reference and origin
record, ordered `scenes[1..120]`. Every write and read re-validates
each scene through the Layer-C contract; envelope checks refuse
unknown future versions, dangerous keys, functions, oversized payloads,
duplicate slide ids, and empty decks. List responses project to
summaries — scene bytes never ride the list.

## 3. Save/load/list/rename/delete

`POST /api/v2/projects` (create), `GET` one (load),
`GET` collection (list), `PUT` (save with `baseRevision`),
`PATCH` (rename), `DELETE` (remove, UI-confirmed; arming never
deletes — asserted by a 200 between arm and confirm), plus
`GET :id/export.pptx` rendering the *stored* document. Loading returns
scenes that feed `createDocument` directly — no recompile, no id
regeneration (byte-identical round-trip asserted on a mixed deck).

## 4. Atomic writes

Validation precedes the transaction; writers serialize through one
FIFO lane; check-and-write share `BEGIN IMMEDIATE`. Failure classes
(serialization, validation, write, replace, malformed load,
concurrent saves) all leave the stored row untouched — asserted per
class, including revision and bytes after a broken save.

## 5. Revision conflicts

Optimistic concurrency on the durable counter. Same-base racers
serialize to one `saved` + one `stale-revision` (409 with
expected/actual) at the store lane and in two live Chromes. The loser
keeps every unsaved edit with reload-newer / save-as-new / retry —
never a silent overwrite, never a dropped draft. Identical resaves
report `noop` without advancing.

## 6. Engine restoration

Load creates a revision-0 document over the stored scenes; the durable
revision travels beside it (`savedEngineRev` binding). Undo/redo do
not survive reload — `canUndo/canRedo` false, asserted — and the UI
never implies otherwise. History remains an in-memory snapshot cache
under the existing cap; envelopes + inverses stay recorded for a
future audit log.

## 7. Project identity across slide types

One mixed deck round-trips byte-identical: AI-generated slides, blank
manual slides, layout-gallery slides (`recipeId`, human provenance),
duplicated slides (remapped ids), detached slides, edited chart values
and table cells, multi-run styled text, restyled shapes, hidden and
locked elements, reordered layers, and suppression tombstones. Draw
order is rank-sorted and unique per slide; every loaded scene passes
`validateScene`.

## 8. Browser workflow and unsaved protection

Toolbar Save + `Saved · rev N` / `Unsaved changes` /
`Conflict — newer saved version` / `Save failed` /
`Storage unavailable` pill (confirmed PUTs only); Projects dialog with
list/rename/two-step-delete/save-as/export; `?project=` deep link plus
a last-project reopen offer after refresh; `beforeunload` while dirty
or saving; project-switch guard (save-and-switch / discard-and-switch
/ cancel). Open text drafts commit first and block on failure;
unapplied chart/table grids never enter a payload; a save captures the
snapshot + engine revision at submit and only marks that revision
saved. With storage down, editing continues behind an explicit
warning.

## 9. Autosave

Shipped as the documented lane, not a claim: dirty marks schedule one
PUT after a 2s quiet period, saves never overlap, one transient retry,
then a surfaced error that waits for the next edit or manual save.
Proven by the reopened-edit test (edit → autosave/marked saved →
revision advances) and the conflict test (mid-flight edits stay
dirty). No multi-user merging, no CRDTs.

## 10. Security and hosted gating

JSON/schema validation at model and route, ~6MB payload caps (413
verified with a 16MB body), id-shape rejection (400 for traversal
forms — verified live), dangerous-key and function refusal, no silent
mutation (clone-on-entry everywhere), owner scoping with admin
visibility. Anonymous project access is 401 on hosted (verified live
against a hosted-flag server); local boxes allow single-user use.
`FORGE_V2_PROJECTS=0` disables the surface.

## 11. Export after reload

`export.pptx` from the stored document: exact slide count and order,
native chart part with starter data, native `<a:tbl>`, title text in
slide XML, no rasterized slides. Headless-asserted via unzipped OOXML;
the Projects dialog links the stored export.

## 12. Test results

- `test/v2-projects-6a.test.js` — 17/17 (fail-first: `ERR_MODULE_NOT_FOUND`
  for `packages/projects/document.js` on isolated `fa557c4`).
- `test/v2-edit-chrome-6a.test.js` — 5/5 (same baseline fails at
  import; hosted-mode 401/400/413 and local 200 verified by live curl).
- Focused regression family (engine, ownership, tombstones, text,
  style, resize, format, chart, table, slides, layers, 5k layouts,
  preservation): 368/368, plus the 5k gallery/headless suites
  re-verified green against the modified viewer (31/31 headless,
  9/9 + 5i blank/narrow Chrome).
- `npm run typecheck` clean; production build green; benchmark 50
  cells L1 zero.
- Full `npm test` totals recorded in §15 (background run at close).

## 13. Remaining limitations

Undo history does not survive reload (deferred by design). No
accounts, sharing, collaboration, imports, or agent turns. Rename
advances the durable revision (documented; a title-only path that
preserves revision is a possible follow-up). Autosave has one retry,
not a queue. Export uses the stored revision — dirty decks must save
first (stated in the dialog).

## 14. Recommended next slice

V2-6B: durable command-audit log (persist envelopes + inverses for
history/audit and conflict forensics), then hosted-database
replacement of the `ProjectStore` adapter behind the same interface.
Neither started here.

## 15. Full-suite totals

(Filled at close from the background run.)

## 16. Roadmap status

V2-5K marked accepted at `fa557c4`; V2-6A implemented on this branch
pending review; V2-5 parent stays `[~]` (layout switching and
consolidation open — persistence does not complete the editor).
