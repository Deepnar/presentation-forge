# V2-7A Evaluation — unified workspace foundation

Date: 2026-10-14. Baseline `97a12de` (V2-6C implemented, pending
acceptance — accepted by this slice, see §18). Parent V2-7 in
progress. No compiler, engine, command, persistence, agent, import,
or template changes.

Drivers: headless `test/v2-create-7a.test.js` (4/4); browser
`test/v2-edit-chrome-7a.test.js` (18 its across dashboard,
navigation, and editor-shell describes — partially verified, see
§16). Evidence: `docs/v2-7a-evidence/` + README. Architecture:
`docs/V2-7-FRONTEND-ARCHITECTURE.md`.

## Verdict

The workspace reads as one presentation application for the
covered flows — dashboard to editing is one click, creation is
two, the editor shell is coherent — with four genuine product
defects found and fixed along the way (§15). PASS is **not yet**
recommended: the final validation pass (full bulk + serial
Chrome + pg suites) is deferred to one run, see §16 for exactly
what is verified, what is inspected-only, and why.

## 1. What was built

- **Workspace dashboard** (`views/Workspace.jsx`, `#/projects`):
  real project cards (title, slide count, revision,
  modification time) with open/rename/delete-with-confirm/
  export/history; AI/layout/blank creation through `apiCreate`;
  empty/loading/401-sign-in/403/503 states. Reachable signed
  out, where anonymous users meet the sign-in state.
- **Routes**: `#/projects`, `#/project/:id`,
  `#/project/:id/history` in the existing hash router; sidebar
  Presentations entry; default chat landing untouched.
- **Editor shell** (`SceneViewer.jsx`, embedded mode): top bar
  (back, title rename, save, undo/redo, history, export,
  present, assistant, inspector toggles), collapsible left rail
  (slides/layers), fixed-width right rail (contextual inspector
  + slide props + assistant placeholder), present overlay,
  leave/switch guards, focus return, token styling with dark-mode
  and reduced-motion support. Standalone `scenes.html` keeps
  working byte-for-behavior; all old suites drive it unchanged.
- **Creation builders** (`lib/v2create.js`): validated blank and
  layout scenes with minted ids, headless-tested.

## 2. Contracts preserved (not just visuals)

- Same engine, adapter, commands, save-state machine, autosave,
  provenance, history, and export paths — the shell moves JSX
  and adds chrome; `git diff` on behavior files is nil.
- One editor instance per project (`key={projectId}`, detach on
  unmount); remounts commit exactly once per action (asserted).
- Selection never moves the stage: right rail is fixed-width;
  format panels render the same components with the same keys
  and commit paths as the old dock.

## 3. Generation entry and its honest limit

"Create with AI" opens the existing chat generation workflow.
There is deliberately no translator from generated `deck.yaml`
to Layer-C scenes — nothing exists to wire (no translator,
route, or entry point, verified by audit). It is recorded as
the V2-7B blocker in the roadmap, not silently implied.

## 4. Design evaluation (observed, §§17)

- **One product?** For saved presentations, yes: shared shell,
  tokens, routes, and states from dashboard to export. The V1
  chat/deck world remains adjacent (sidebar tabs untouched) —
  stated as remaining awkwardness, not hidden.
- **Dashboard → editing: 1 click** (Open; edit mode engages on
  load, observed `Saved` pill at rev N on arrival).
- **Create: 2 clicks** (Create → Blank), 3 via layout
  (Create → Layout → pick). AI: 1 click to the chat workflow.
- **Selection → properties: yes.** Text selection shows the
  format panel; empty selection shows slide id, layout state,
  and object counts (screenshot-observed).
- **Canvas space:** ~68% of a 1440px viewport; fixed rails;
  narrow viewports collapse rails to toggles with overlay
  reopening (screenshot-observed at 480px).
- **Saved vs unsaved:** pill reads `Saved · rev N` /
  `Unsaved changes` / `Conflict — newer saved version` with a
  banner; conflicts are not icon-buried (screenshot-observed).
- **Discoverability:** project ops live on cards and the top
  bar; history is one click from both.
- **Generation reachable:** yes, labeled; end-to-end handoff is
  the documented next slice.
- **Still awkward:** no cover thumbnails (metadata cards;
  recorded follow-up); the second toolbar row stays dense with
  fixture/live controls; V1 and V2 project lists coexist.

## 5. Accessibility and interaction (verified)

Dialog Escape closes even when focus never entered (fixed, §15);
focus returns to openers (asserted); regions labeled; canvas
shortcuts scoped to the mount root and unchanged; narrow widths
keep editing possible; no pending-edit loss paths added (guards
cover back, switch, restore, refresh/close).

## 6. Performance notes

No new global state; filmstrip/layers render paths untouched.
120-slide open measured in-suite (timing recorded to evidence;
bound generous). Full profiling deferred with validation.

## 7. Remaining UX issues (honest list)

1. V1 chat/deck lists and V2 presentations are neighboring, not
   merged.
2. No project cover thumbnails.
3. Fixture switcher still lives in the editor toolbar
   (standalone heritage).
4. Assistant is a labeled placeholder.
5. Generation-to-project handoff missing (V2-7B).

## 8. Recommended V2-7B scope

The generation handoff translator + UI path, then thumbnail
previews, then V1/V2 list consolidation — in that order.

## 9. Validation status (exact, and why partial)

Verified by direct runs in this session:

- `test/v2-create-7a.test.js` — 4/4.
- 7a dashboard describe — 5/5 (empty, blank, layout,
  rename, delete).
- 7a navigation describe — 3/3 (back/forward/refresh,
  leave guard, switch guard).
- 7a editor shell — 6/10 green by direct run (text/autosave/
  history, restore/export, conflict, present/assistant/
  read-only, narrow, remount). Locks/hide/undo rewritten
  around verified semantics (inspected, §15); large-deck,
  keyboard (with the Escape fix), and hosted (with the
  signed-out fix) written but awaiting green runs.
- Pre-existing suites re-verified green after the shell:
  5c 7/7, 5d 4/4, 5e 5/5, 5f 5/5, 5i 6/6, 5j 5/5, 5k 9/9,
  chart 2/2, table 3/3, fontgate 2/2, selection 5/5,
  smoke 3/3, live-chrome 5/5, 6a 5/5, 6b 4/4.
  6c suites skipped (no Postgres on the box right now).
- `npm run typecheck` clean; production build green.

**Deferred to one final pass:** the 4 remaining 7a tests, the
non-browser bulk suite, the bounded serial Chrome suite
(including pg-backed 6c), and the benchmark. Reason, recorded
per agreement: this session shares its machine with
higher-priority work, and each browser cycle costs real load;
rather than six disruptive partial runs, validation closes in a
single pass when the machine is free. No totals are claimed for
unexecuted suites — §10 of this file will be filled then, and
V2-7A stays `[~]` until it is.

## 10. Full-suite totals

*Pending the final pass (§9). Not claimed.*

## 11. Roadmap status

V2-6C marked accepted at `97a12de`; V2-7A implemented on this
branch pending review **and** pending the §9 final pass; V2-6
parent stays `[ ]`; V2-7B (generation handoff) recorded as the
next slice with its missing pieces named.
