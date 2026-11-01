# V2-5J1 Evaluation — system-chrome lock-boundary correction

Date: 2026-10-13. Baseline `015835d` (V2-5J pending review).
No gallery, persistence, or agent paths. One product-code
correction (`packages/model/commands.ts` + predicate
consolidation), one test file added, docs updated. No UI,
schema, engine-shape, or renderer changes.

## Verdict

Protected system chrome now refuses unlocking from every path
— adapter, direct envelope, atomic batch, duplicate copies —
while ordinary lock/unlock, undo/redo, regeneration, and
export behave exactly as before. PASS recommended as a
correction to V2-5J; V2-5J stays `[~]` for independent
acceptance, V2-5 parent stays `[~]`.

## 1. Root cause

V2-5J enforced the chrome boundary only in the browser
adapter (`scene-edit.js` refused with "system chrome", proven
by panel tests). The canonical primitive,
`applyCommand`'s `element.setLocked` case, performed no such
check — and the engine deliberately exempts `setLocked` from
its own locked gate (the toggle is the escape hatch for
ordinary elements). Net effect, proven live on the baseline:
a direct `doc.apply({ element.setLocked: { chrome, false } })`
returned `{ok: true, revision: 1}` with the lock removed.
Any headless caller — and any future agent turn through the
same engine — bypassed the boundary the UI claimed.

## 2. Canonical classification (§5 audit)

`isSystemChrome(el)` := locked + compiler provenance + no
authored-block semanticRef. Audited against the authoritative
emitter (`packages/compiler/chrome.ts` header: chrome carries
stable `:chrome:*` ids, compiler provenance, `locked: true`,
and NO authored-block semanticRef) and against real scenes
(all 34 locked elements in the chromed fixture match, all
carrying `:chrome:` ids; the compiler emits locked elements
nowhere else). The triple is the documented contract, not a
guess — and the policy stays conservative: anything matching
it is protected, with no new permissions system.

## 3. Enforcement shape

- Canonical predicate lives in dependency-free
  `packages/model/scene-constants.ts` — the one shared
  definition for primitive, adapter, and tests, with zero
  bundle-weight change (the editor copy it replaces existed
  only to dodge the AJV import).
- `applyCommand` refuses `locked: false` on matching elements
  (`locked` result code, same as every other lock rejection).
  The `actor` field is never consulted — it is audit
  metadata, not a capability, so no envelope string can
  exempt the check. No privileged-internal bypass was added;
  undo/redo need none (snapshot images, never inverse
  impersonation).
- Ordinary locked elements keep the intentional escape hatch
  (lock and unlock freely); the adapter keeps its fast-path
  refusal with the user-facing message.
- Duplicated slides inherit protection: copies keep locked
  status, compiler provenance, and ref-less identity, so the
  predicate still matches — proven, not assumed.

## 4. Regression tests

`test/v2-layers-5j1.test.js` — 12/12 (direct bypass repro
with byte-identical/scene/revision/history assertions; batch
atomicity with the valid companion rolled back; actor
strings buying nothing; human-added lock/unlock; compiler
content lock/unlock; lock→undo→redo exactness; frozen
move/resize/edit/delete on user locks; duplicate-copy
protection; nested inheritance; neighboring ops untouched;
regen carry + abandon-fresh; native export of protected
chrome). Baseline `015835d`: the file fails at import (new
shared predicate absent), and a standalone bypass script
returns `{ok: true, revision: 1}` with the lock removed —
the vulnerability, demonstrated, then removed by the fix
(`{ok: false, code: locked}`, lock held). No old
expectations changed; base suites green without
modification.

## 5. Full-suite and benchmark results

Recorded at close: layers family green, engine/batch/
duplication/ownership/export suites green, typecheck clean,
benchmark 50 cells L1 zero, full `npm test` with exact totals
(BYOK standing; browser files isolated per the standing
bounded-concurrency rule, none counted on kill/timeout).

## 6. Remaining limitations

Unchanged from V2-5J (no grouping, no bulk reorder,
per-mount collapse, unselectable hidden rows, no dark/group
fixtures). Additionally: the engine stays permissive about
LOCKING anything (locking is always safe); only unlocking
protected chrome is refused. The general inverse-as-input
surface beyond setLocked/setTableData/setChartData restores
remains a pre-agent hardening item per the roadmap pattern —
this slice closes the chrome instance of it, not the class.

## 7. Backward compatibility

Envelope shapes, result codes, revision monotonicity, no-op
policy, snapshot undo/redo, ownership marking, and all
25+12 base tests unchanged. The only observable differences
are the refused unlocks: direct, batched, actor-varied, and
duplicated-chrome — each previously succeeding.
