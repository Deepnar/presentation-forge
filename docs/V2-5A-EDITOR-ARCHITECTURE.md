# V2-5A Editor Architecture — command, revision, and ownership contracts

Date: 2026-10-11. Baseline `5beba39` (V2-4 accepted).
Implementation status: **V2-5B implements §§2–8 and §12 of
this record** in `packages/model/engine.ts` (headless,
framework-free, import-tested from tests only — no UI
binding yet). **V2-5B-1 corrects two findings without
changing the architecture:** C1 concurrent stale-base
acceptance is closed by a per-document FIFO transaction
boundary with checks inside the turn; C2 incomplete undo
ownership is closed by snapshot history (per-touched-slide
or full-array state images beside the retained semantic
inverses), so undo/redo restore exact metadata.
Decided in implementation, against the
proposal: duplicate envelopes are *rejected* (not
replayed); effective no-ops *succeed without recording*
(history pollution rejected); undo depth caps at 200 while
the applied-id set stays unbounded (replay protection
outlives undo depth; V2-6 compacts); delete inverts to an
*indexed* add (new optional `element.add` index) so undo
restores exact z-order. Text-vs-geometry ownership is
implemented, not just specified: optional schema field
`contentCustomized`, set only by `element.updateText`,
merged in `recompileSlide` same-kind-only with refit, proven
by Cases A–E (`test/v2-ownership-5b.test.js`, B/C fail on
the V2-5A baseline). D1–D5 remain open as written.

## 1. Existing contracts and reusable foundations

- `DeckCommand` (`packages/model/commands.ts`): move, resize,
  updateText (+ inverse shape), add, delete. Each `apply`
  returns its inverse. Locked elements reject; unknown ids
  throw; nothing here is UI-specific.
- Deck-level pure ops in the same file: insert, delete (never
  empties), duplicate (re-ids with `-copy`), reorder. The V1
  shell already drives slide reorder/duplicate/delete through
  these (`app/web/src/lib/slides.js`, `test/ops.test.js` for
  the V1 op layer — same one-path principle).
- Identity: `compilerId(slide,block,role)` (deterministic
  across recompiles) vs `humanId()` (random, no semantic
  parent); `findElement` walks groups. Slide identity is
  `scene.id`.
- Ownership today: `markCustomized` flips compiler→human
  provenance, sets `customized` on geometry edits, and moves
  `managed→customized`. `recompileSlide` preserves exact-id
  geometry first, then semanticRef+kind matches, carries
  human-added elements forward, and returns `detached`
  scenes untouched (`test/v2-preservation.test.js`).
- Read-only seams (V2-4E): `selectedIds` + outermost-unit
  resolution, `inspect()`, overlay boxes, frozen scenes.
- Export safety (V2-5A): `preflightScenes` +
  `ExportUnsafeError` at `renderPptx`; invalid or unsafe
  scenes never reach bytes.
- Validation: `validateDeckIntent`, `validateScene`
  (AJV over the schemas — the only validators; no second
  schema is created for commands unless agent tool inputs
  need runtime checks later).

## 2. Proposed command envelope

`DeckCommand` stays the mutation vocabulary; later slices
extend the union (slide add/remove/reorder/move, group/
ungroup, style, chart-data, theme change) rather than
inventing a parallel one. Every application travels in one
envelope:

```ts
type CommandEnvelope = {
  id: string;            // random, for log identity
  cmd: DeckCommand;      // the mutation (extended union later)
  baseRevision: number;  // optimistic concurrency, see §3
  actor: "human" | "agent";
  agentId?: string;      // audit only, never a capability
};
```

All fields are plain JSON: the envelope serializes into
history, wire payloads, and (later) persistence without
translation. Two illustrations of later extensions (NOT
implemented here):

```ts
{ type: "element.setChartData"; id: string; categories: string[]; series: { name: string; values: number[] }[] }
{ type: "element.setStyle"; id: string; style: { fill?: Hex; alpha?: number } }
```

## 3. Revision strategy

One integer per deck, held by the future document store,
starting at 0 for a fresh compile. A command applies iff
`envelope.baseRevision === current`; otherwise it is
rejected as conflicting (never rebased silently). History
is an ordered log of `{ envelope, inverse,
resultingRevision }`. Wall-clock timestamps may annotate
for display but never order. This is optimistic
concurrency, not OT: the editor is single-writer at any
moment (human xor agent turn), so last-writer-wins per
command with a surfaced conflict is sufficient — see D3.

## 4. Atomicity

Copy-on-write from V2-5B on: clone the touched slide,
apply to the clone, validate, then swap. A command either
lands wholly or throws with the original intact. Today's
`applyCommand` mutates in place and derives inverses
mid-mutation; the engine wrapper (not each op) will own
the clone/validate/swap so failure atomicity holds for
batches too. Multiselection produces one batch entry with
an inverse list — undo removes the whole drag, never half.

## 5. Validation boundaries

Before: envelope shape, target exists, target editable
(unlocked — locked rejects exactly as today), value ranges
inside the scene contract (e.g. finite numbers, known
enums). After: `validateScene` on the touched slide; any
failure rolls back to the pre-command clone and reports
the schema errors. Export: `preflightScenes` runs before
every `renderPptx`, so even a valid-scene edit that
reintroduces an unsafe chart (multi-series pie via a data
command) is caught at the boundary, not in the file.

## 6. Identity and nested-group paths

Addressing is `(slideId, elementId)` — never indices, which
shift under every insert. Compiler ids embed their slide
and survive recompiles; human ids are random and survive
because recompile carries unknown ids forward. Group
children are addressable by id today (`findElement`
walks); selection resolves to the parent group, but
commands may target a child id directly once V2-5C defines
group-editing semantics (see D4 — the resolution rule for
clicks does not constrain command targets).

## 7. Undo/redo architecture

History owns two stacks. `applyCommand` already returns the
inverse, and applying an inverse returns the forward op —
so undo is "apply the inverse" and redo is "apply the
forward again", with no separate code path to drift.
Pushing a new command clears the redo stack. Batch entries
store inverse lists applied in reverse. History entries are
the envelopes from §2, so undo survives reload once
persistence binds (V2-6).

## 8. Human/agent provenance

Provenance has two layers that must not be confused:

- Scene ownership (`provenance: compiler|human`,
  `customized`, `layoutState`) answers "who owns this
  content?" and drives regeneration suppression (§10).
- Envelope actor (`human|agent` + `agentId`) answers "who
  issued this change?" for history/audit display.

Agent turns execute the same engine, same validation, same
history — the model never writes scenes directly. An agent
command with a stale `baseRevision` (human edited mid-turn)
is rejected and reported, not merged.

## 9. Customization and detachment semantics

- Compiler-generated: `provenance: compiler`,
  slide `managed`. Recompile may reflow freely.
- Human-modified: any command flips provenance to human;
  geometry edits set `customized`; the slide becomes
  `customized`. Recompile preserves by exact id, then
  semanticRef+kind (proven, preservation suite).
- Locked chrome: `locked: true`, compiler provenance, no
  authored refs. Rejects every command; never selectable;
  regenerated with the slide (chrome is planned, not
  edited).
- Human-added: `humanId()`, `provenance: human`, carried
  forward across recompiles, appended order stable.
- Customized regions: slide-level `customized` is the
  region marker; element `customized` is the geometry
  marker. Text-only edits flip the slide but not the
  element flag (current asymmetry, kept: refit policy
  reads the element flag).
- Detached slides: `layoutState: detached` means
  compiler-hands-off, NOT read-only — manual commands
  still apply; recompile returns the scene untouched.
  Detachment is explicit (a future command), never a
  side effect.

## 10. Regeneration suppression rules

Recompile must never silently overwrite human work:

1. Exact-id elements keep human geometry; only their
   authored content refreshes around it.
2. Compatible semanticRef+kind matches keep geometry
   across family changes.
3. Human-added elements survive, appended.
4. Detached slides pass through byte-identical.
5. Locked chrome regenerates (it is not human work).

Unresolved D1: deleting a compiler element, then
recompiling, resurrects it — no tombstone exists. Options
are a per-slide tombstone list, detach-on-delete, or an
explicit keep/deleted choice at delete time. Deferred to
the slice that implements delete in the UI (V2-5C),
decided there with a test, not here.

## 11. Interaction-to-command flow

scene-dom keeps owning mechanics and ephemeral state
(pointer capture, drag previews, rubber states, selection);
the engine owns authoritative transitions. Later slices:

- Pointer drag → transient preview against a frozen
  scene (nothing mutates) + one `element.move` (or atomic
  batch for multiselection) on release.
- Keyboard nudge → one `element.move` per press
  (coalescing policy deferred to the slice).
- Text commit → one `element.updateText` with the full
  new paragraphs (per-keystroke commands deferred, D2).
- Undo/redo buttons and `Ctrl+Z/Y` → history inverse/
  forward application, never snapshot surgery.

The editor must not become a second compiler: no fitting,
no planning, no palette resolution in the interaction
layer. If a command would violate fit, validation reports
it and the author shortens text — the same honesty rule
as generation.

## 12. Browser/server ownership

The command engine is a framework-free package beside
`scene-dom` (importable from browser, server, and CLI
alike). Revision authority lives with the document: the
browser working copy during interactive editing, the
server for agent turns and saves. Both execute the same
`apply` path; the wire carries envelopes. This keeps one
transition implementation while V2-6 decides persistence
binding — recorded explicitly so a later slice does not
accidentally fork the engine per platform.

## 13. Compatibility with future persistence

Envelopes and inverses are plain JSON today, so history
replays without migration. Durable shape (for V2-6):
snapshots plus the log (never log-only — load time),
revision integer beside the snapshot, tombstones if D1
lands that way. Nothing in §§2–8 contradicts Neon/JSONB
or filesystem/SQLite adapters.

## 14. Known risks and unresolved decisions

- D1 tombstones for deleted compiler elements (decide in
  V2-5C).
- D2 text-edit granularity: per-commit (recommended)
  vs per-keystroke.
- D3 concurrency: stale-base rejection is specified;
  the UX for surfacing it (banner vs silent rebase
  offer) belongs to the slice that wires agent turns.
- D4 group editing: child-targeted commands vs
  group-atomic commands; selection stays parent-first
  either way.
- D5 clipboard/drag-data formats between slides/decks.
- Rotation has no editor or export behavior yet
  (rotation-blind bounds predate this slice).

## 15. Proposed V2-5B, V2-5C, and later slices

- **V2-5B — command engine.** Envelope, revision log,
  history with undo/redo, copy-on-write atomic apply
  with before/after validation, wire the five existing
  ops plus slide add/remove/reorder/duplicate through
  it. No UI, no persistence; headless tests prove
  inverses, conflicts, batches, and rollback.
- **V2-5C — first interactions.** Drag-move, nudge,
  and delete in the viewer through the engine, with
  transient previews and the D1 tombstone decision
  implemented and tested. No text editing yet.
- **Later:** text editing (D2), add/style/chart-data
  commands, slide management UI, theme switching as a
  command, persistence binding (V2-6 seam), agent turns
  through envelopes (V2-8 seam).

## Appendix — legacy demo migration (§10 findings)

`packages/editor/demo.html` mutates live scene objects in
place: direct `target.paragraphs = …` assignment (line 57)
with no validation, no customized marking, no inverse;
`scene.elements = …filter…` reassignment on delete (line
123) with no tombstone or history. Both conflict with
§§4–7 and §10. Migration strategy (not this slice): keep
the demo running untouched until V2-5B lands, then route
its three mutations (edit text → `element.updateText`;
move → `element.move` if present; delete →
`element.delete`) through the engine with a visible
history panel, proving the engine before the viewer
adopts it. No second editor is introduced; the demo is
never rewritten from scratch.
