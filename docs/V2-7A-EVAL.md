# V2-7A evaluation — unified workspace foundation

Updated 2026-10-14. Accepted baseline: V2-6C
`97a12de92e1b691a8ebab26f524ddc0afd9bf111`. Application implementation under
validation: `a298767ce32df1a0023ada4a1e8d0bda506a1ca9`, branch `v2`.
Later continuity/documentation commits do not change that application SHA.

## Verdict

**HOLD recommended. V2-7A is not accepted.** Full final validation remains
unexecuted because the required quiet shared-machine window has not occurred;
Forge PostgreSQL is unavailable. This session updates continuity/governance and
reviews existing evidence without claiming those activities finish product
validation. No V2-7B or other feature implementation is authorized.

## 1. Implemented scope

Workspace dashboard (`#/projects`, `views/Workspace.jsx`) over the real project
API: project cards, open/rename/delete/export/history, blank/layout creation and
honest loading/empty/permission/unavailable states. Project routes
`#/project/:id[/history]` mount the shared `SceneViewer` editor with top bar,
collapsible slide/layer rail, contextual inspector, present overlay, save state
and navigation guards. The standalone scenes entry remains supported.

Creation builders are in `lib/v2create.js`; engine, schema, command and store
contracts remain the accepted shared foundations. Architecture:
[V2-7 frontend record](V2-7-FRONTEND-ARCHITECTURE.md). UI changes must not become
layout escape hatches or introduce a second authoritative document.

## 2. Contract claims and evidence boundaries

One keyed editor per project, detach on unmount, revision-safe autosave,
conflict refusal, history/restore and native export use existing paths. The
original implementation session reports the covered interactions in §9.
This session has not rerun them. Source inspection confirms fixed-width rails
and shared format panels, but does not measure canvas stability or establish
shell chart/table parity through interaction.

## 3. Generation entry and limit

“Create with AI” opens legacy chat. No generated-deck-to-Layer-C saved-project
translator is wired. The next candidate is [V2-7B](ROADMAP.md#v2-7b-candidate),
not authorized scope. The Assistant tab is a labeled placeholder.

## 4. Existing design evidence, inspected 2026-10-14

Six committed PNGs at `a298767` were opened and inspected. Desktop captures are
1440×757; `editor-narrow.png` is **500×757**, despite the driver requesting
480×900 (Chrome headless viewport clamp). Dashboard cards and empty-state
controls are readable without overlap. The history modal bounds are inside the
viewport with a scrolling revision list. The read-only/assistant image shows
its placeholder and no edit tools in the visible region.

The narrow image shows only part of the top bar; inspector/history/other controls
are outside the capture. It does not prove inspector access or narrow dialog
usability. Source inspection shows the top bar lacks the secondary toolbar's
horizontal-overflow treatment, while the host clips horizontal overflow. This is
a **narrow-control clipping finding requiring behavioural confirmation and a
scoped correction** in the final browser pass, not evidence of responsive success.

The desktop center column is approximately 721px of 1440px (~50% of the full
viewport); the earlier ~68% claim excluded other shell space without saying so.
No controlled same-scene before/after pair exists here to prove selection never
shifts the canvas. Details and image hashes: [visual review](v2-7a-evidence/VISUAL-REVIEW.md).
These are existing-image observations, not new frontend execution.

## 5. Interaction claims still requiring final execution

Locks/visibility through the new shell and undo/redo; keyboard shortcuts, Escape
and focus; hosted sign-in/dashboard; navigation/switch guards and pending edits;
chart/table editing in the embedded shell; history restore, slide management,
read-only and cleanup; narrow inspector reachability and geometry stability.
The existing keyboard case exercises read-only arrows and Projects Escape/focus,
not the entire shortcut matrix. The save/discard-named case actually executes
save-and-leave; discard needs explicit verification. Existing chart/table suites
drive the standalone entry, so those alone cannot prove embedded-shell parity.

## 6. Performance

**No final-session opening measurement exists.** The 120-slide case remains
unexecuted; there is no `large-deck.json` to cite. Its existing threshold is
<120000ms, including Chrome startup, font-gated fixture boot and route navigation.
Record the observed time and 120 rendered thumbs after a successful real run.
Do not call that broad measurement isolated editor-render latency.

## 7. Known product limitations

Legacy chat/deck lists coexist with saved projects; no cover thumbnails; fixture
controls remain in the production editor toolbar; Assistant is a placeholder;
generation handoff is missing. Preserve these as roadmap work rather than a
second work list: [workspace followups](ROADMAP.md#workspace-followups),
[V2-7B](ROADMAP.md#v2-7b-candidate), and V2-8 in roadmap §12.

## 8. Next-slice boundary

[V2-7B](ROADMAP.md#v2-7b-candidate) remains a candidate. Frontend findings and
ordering are in [the roadmap](ROADMAP.md#workspace-followups). Independent
acceptance of V2-7A must precede dependent planning; no new feature is started
by this validation/continuity task.

## 9. Historical validation at the implementation entry

These are the prior implementation session's recorded results, **not reruns**:

- `test/v2-create-7a.test.js`: 4/4.
- 7A dashboard: 5/5; navigation: 3/3; editor shell: 6/10. Locks/hide/undo,
  large-deck, keyboard and hosted cases await successful execution.
- Earlier Chrome suites reported green: 5c 7, 5d 4, 5e 5, 5f 5, 5i 6, 5j 5,
  5k 9, chart 2, table 3, fontgate 2, selection 5, smoke 3, live 5, 6a 5, 6b 4.
  Those historical numbers do not complete this task's full regression set.
- Typecheck and production build were previously green; PostgreSQL absent.
- Full bulk, serial browser, PostgreSQL and 50-cell benchmark final pass deferred.

The original evaluation's references to §§15–18 were dangling. This revision
replaces them with actual sections/evidence and separates claims from execution.

## 10. Current final-validation ledger

Application checks newly executed: **0**. No pass, failure, skip or cancellation
is claimed for tests that were not started. This is not a zero-test product pass.

Required but **unexecuted**:

| Group | Inventory / reason |
|---|---|
| Full 7A Chrome | 18 existing leaf cases; quiet window absent |
| Non-browser bulk | 166 files including governance suite; complete bulk not started |
| Serial build/browser | 21 files including full 7A and the font-assets Vite-build suite; not started |
| PostgreSQL contract | 17 real cases, unavailable service |
| Cross-process persistence | 11 cases (10 PG + 1 shared SQLite file); containing suite not executed |
| PostgreSQL faults | 8 real cases, unavailable service |
| PostgreSQL browser | 3 cases, included in serial inventory; unavailable service |
| Production build / typecheck | Each unexecuted in this final pass |
| Canonical benchmark | All 50 cells unexecuted; 12 assertion tests are not a substitute |
| Frontend final execution | Existing image inspection only; required interactions remain pending |

Inventories overlap only where explicitly stated: 7A and PG browser are subsets
of the serial inventory; SQLite contract is in bulk; PostgreSQL contract,
concurrency and faults are three separate files. Do not add these rows as if
each were disjoint. [The runbook](v2-7a-evidence/RUNBOOK.md) and
[190-file manifest](v2-7a-evidence/validation-plan.json) provide exact commands,
file lists and watchdog policy. Governance checks are recorded separately in §15.

Standing failure remains separate: `test/byok-budget.test.js`, `5,000,000` versus
Indian grouping `50,00,000`, recorded before V2-7A in V2-6C eval §14. It was not
rerun, altered or waived in this session.

## 11. Roadmap/acceptance status

V2-6C is the supplied accepted baseline at `97a12de`. V2-7A stays `[~]`, pending
validation and independent acceptance. V2-6/V2-7 parents stay open. Duplicate
V2-6C pending/accepted roadmap entries were consolidated without revoking its
accepted baseline. State: [development-state.json](development-state.json).

<a id="final-validation-environment"></a>

## 12. Final-validation environment

Entry: `v2`, HEAD `a298767`, matching origin/v2, no tracked changes. Pre-existing
untracked `.agents/` and the two `PRESENTATION_FORGE_*` files are untouched.
Node 24.16.0 and Chrome are available. Forge test PostgreSQL on 127.0.0.1:5544
returns ECONNREFUSED. Other projects' PostgreSQL services were not reused.

Repeated shared-machine samples during documentation work showed approximately
40–62.4% I/O pressure, GPU utilization ranging from idle gaps to 94%, and an
unrelated long-running workload. Low average CPU load did not mean a quiet I/O
window. No expensive validation or unrelated-process interruption was performed.
[Environment evidence](v2-7a-evidence/environment.json) records measured samples.
The busy-machine fallback in the approved continuity task permits documentation
and lightweight checks while retaining pending product validation.

## 13. Regressions and corrections

No new application regression was reproduced by test execution; no application
source or browser assertion changed in this session. The narrow-control clipping
finding in §4 is preserved as an unresolved validation/correction task. Historical
product fixes already in the code: V2 bearer (`4dfcc65`), host-route preservation
(`c786333`), switch-dialog guard visibility (`ab3119b`), signed-out dashboard and
Escape (`8c99540`). These are not presented as newly applied fixes.

This session corrects stale AGENTS orchestration/model/language/branch guidance,
dangling eval references, misleading measured/performance claims, duplicate
roadmap state, external-procedure dependence and historical blocker/architecture
wording. Governance tests and state consistency checks are separate from editor
regression tests. Assertions were not weakened.

## 14. Task-specific acceptance gates

Scope: final validation, narrow regression corrections if reproduced, repository
continuity; no compiler/layout/engine/storage redesign, new features or deployment.
The final implementer report recommends only; it cannot accept V2-7A.

| Common gate | Applicability / required evidence |
|---|---|
| Correctness | Full 18-case 7A suite plus missing shell interaction checks in §5 |
| Data integrity | Bulk SQLite contracts; PG contract, concurrency/fault and pending-save navigation paths |
| Security/authorization | Signed-out hosted dashboard, authenticated ownership and read-only checks; no new auth policy |
| Undo/redo | Exact scene/ownership/order after both operations, including locks/visibility and slide changes |
| Ownership/regeneration | Existing preservation/engine regression suites; no new regeneration behaviour |
| Native PPTX | Export restored/edited scenes, inspect native OOXML/text/chart/table data; raster/inspect representative exports |
| Browser interaction | All §5 flows, guarded exits, no duplicate commits/listeners after remount |
| Accessibility | Shortcut/region/Escape/focus behaviour, labeled controls and usable narrow dialogs |
| Responsive | Reachable narrow inspector/top-bar controls, no overlapping/clipped controls; controlled same-scene canvas bounds before/after selection |
| Regression | Complete manifest, serial build/browser isolation, exact totals, standing BYOK issue separate |
| Performance | Real 120-slide open with all 120 thumbs and <120000ms; record broad measurement components |
| Documentation/evidence | Final logs, tested SHA/delta, inspected final captures, state/handoff/architecture consistent; cold-start continuity audit |
| Backward compatibility | Existing standalone browser/engine/persistence/export suites retained |
| Deployment safety | No deployment/migration in scope; build/config compatibility checked; no production readiness claim |

## 15. Continuity-system verification

A separate agent context started from the repository, AGENTS.md and
CONTINUATION.md. It recovered the accepted baseline, active task, forbidden
follow-on work, standing failure and review procedure. It found missing exact
reproduction commands, dangling eval references, stale blocker/external-procedure
claims and absent gate applicability; those findings were corrected here.
This was a documentation cold-start audit, **not independent V2-7A acceptance**.
Final lightweight check totals and the audit follow-up are recorded in
[continuity evidence](v2-7a-evidence/CONTINUITY-VALIDATION.md).
