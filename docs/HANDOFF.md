# Handoff — V2-7A workspace implemented, validation partly deferred

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-4 [x];
V2-5 [~]; V2-5A through V2-5K [x] at `fa557c4`; V2-6A [x],
V2-6A-1 [x], V2-6B [x] and V2-6C [x] accepted at `97a12de`;
V2-7A [~] pending independent review **and** a final validation
pass with `docs/V2-7A-EVAL.md`; V2-6 parent stays `[ ]`; V2-7B
generation handoff recorded as next slice).

## Current state

On `v2`, over `97a12de`. This session built the unified workspace
foundation without touching engine, adapters, or commands:

- Workspace dashboard (`views/Workspace.jsx`, `#/projects`) over
  the real project API, with AI/layout/blank creation
  (`lib/v2create.js`, headless-tested) and honest states.
- Routes `#/project/:id[/history]`, sidebar entry, unchanged
  chat default. Signed-out shell renders the dashboard door.
- Editor shell: top bar, collapsible rails, fixed-width
  contextual right rail, present overlay, leave/switch guards,
  focus return, token styling. Standalone `scenes.html` intact.
- Four product defects fixed live: V2 bearer never sent (owners
  saw empty dashboards), `?project=` rewrites wiping the SPA
  hash, switch guard trapped under the dialog overlay, dialog
  Escape dead unless focus was inside.
- Old suites re-verified green (5c–5k, chart/table, fontgate,
  selection, smoke, live-chrome, 6a, 6b); 6c skipped (no pg).
  Test maintenance only: viewport clamps, toolbar scrolling,
  narrow rail toggle, painted-target preference.

## Verification — read this first

Full validation is **deliberately deferred to one final pass**:
this session shares its machine with higher-priority work, and
browser cycles cost real load — agreed to batch instead of six
disruptive partial runs. Exact state in `docs/V2-7A-EVAL.md` §9:
dashboard 5/5, navigation 3/3, editor shell 6/10 green by direct
run; locks (rewritten, inspected), large-deck, keyboard, hosted
await green runs; bulk/serial/pg/benchmark unexecuted. Nothing
unexecuted is claimed. Typecheck clean; build green.

## Continue from here

1. When the machine is free: run the 4 remaining 7a tests,
   then bulk + bounded serial Chrome (+ pg if available) +
   benchmark; fill eval §10; commit evidence.
2. Then independent review of V2-7A.
3. Do NOT begin V2-7B, AI runtime, or imports without
   authorization.
