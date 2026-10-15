# Decisions

Recovered from the cited repository records. Sources describe implementation;
no historical discussion or reviewer identity is invented. Dates/commits identify
the source snapshot or adoption, not an inferred earlier conversation. Alternatives
and original motivation are labeled undocumented when absent.

## D1 — semantic intent, deterministic compiler, authoritative scene

**Decision:** Layer A contains meaning, B resolves layout, C is the editable scene
shared by browser and PPTX. **Context/source:** V2 program, [ROADMAP.md §12](ROADMAP.md#12-v21--agent-native-re-architecture-program),
[ARCHITECTURE.md](ARCHITECTURE.md), V2-0 at `3d11971` baseline and subsequent V2
implementation. **Alternative:** rejected `canvas` branch used PNG backgrounds
and proxy rectangles (roadmap records rejection). **Reasoning:** one scene avoids
divergence; deterministic layout keeps coordinates out of model intent.
**Consequences:** extend semantic/compiler vocabulary, preserve human overrides;
never add intent layout escape hatches. **Revisit:** a new consumer exposes a real
scene-contract gap, through an explicit architecture decision.

## D2 — theme tokens and voice remain disjoint; chrome protected

**Decision:** machine values feed render/compiler code; tone guidance feeds the
model. Institutional furniture is locked. **Source:** AGENTS/ARCHITECTURE at
`a298767`. **Alternative/original discussion:** undocumented. **Reasoning recorded
in source:** exposing exact styling encourages invented layout values.
**Consequences:** theme/schema/import boundary tests and canonical chrome lock
checks. **Revisit:** only with evidence that the same separation is preserved.

## D3 — all editing shares revisioned commands and ownership

**Decision:** validated atomic commands, optimistic revisions, snapshot undo,
customization flags, deletion tombstones and detached scenes. **Source:**
[V2-5A contract](V2-5A-EDITOR-ARCHITECTURE.md), [V2-5B correction](V2-5B1-EVAL.md),
[V2-5J lock correction](V2-5J1-EVAL.md); accepted editor milestones in roadmap.
**Alternatives:** semantic inverse-only undo did not restore all metadata; UI-only
lock checks could be bypassed headlessly. **Reasoning:** engine boundary protects
every caller and restores exact state. **Consequences:** future agent editing
uses the same commands, not raw scene mutation. **Revisit:** concurrency model
changes require a separately approved design, not silent last-writer-wins.

## D4 — manual layout templates are separate from AI composition

**Decision:** human insertion uses editable scene skeletons; AI generation uses
semantic composition families. **Source:** [V2-5K evaluation](V2-5K-EVAL.md),
accepted `fa557c4`. **Alternatives:** constraining generation to the legacy catalog
is explicitly rejected in the roadmap. **Reasoning:** preserve flexible generation
and predictable manual insertion. **Consequences:** common Layer C and slide.insert
engine seam. **Revisit:** demonstrated semantic coverage gap, not catalog size.

## D5 — one ProjectStore, SQLite default, PostgreSQL opt-in

**Decision:** identical validated documents/contracts on both stores, DB transactions
and compare-and-swap, honest 503 without fallback. **Source:**
[V2-6C hosted-storage decision](V2-6C-HOSTED-STORAGE.md), accepted baseline
`97a12de`. **Alternatives:** see that record; no additional historical candidates
are asserted here. **Reasoning:** multi-process correctness cannot rely on a
per-process mutex. **Consequences:** shared contracts, separate operational shared-
volume/backup obligations. **Revisit:** a new storage backend must preserve the
same contract and receive explicit approval for user-data handling changes.

## D6 — durable history is separate from interactive undo

**Decision:** newest 20 recoverable snapshots, older audit-only up to 100; restore
as a new revision; session undo is not persisted. **Source:**
[V2-6 persistence architecture](V2-6-PERSISTENCE-ARCHITECTURE.md), V2-6B accepted
`0ec8aa4`. **Alternatives/original retention sizing discussion:** undocumented.
**Reasoning:** bounded recovery/audit with atomic saves and honest pruning.
**Consequences:** refresh/restore clears session undo, pruned restore returns 410.
**Revisit:** approved retention requirements or persistent-undo scope.

## D7 — hosted Auto is the writing-quality reference

**Decision:** evaluate generated content on hosted Auto; local Ollama remains
supported and can exercise plumbing during gateway outages. **Source:** AGENTS
at `a298767`. **Alternative:** local quality evaluation rejected because hosted
users receive different output. **Consequences:** name the actual model/backend
in reports; unavailable gateway leaves quality unjudged. **Revisit:** explicit
change to the product's reference backend.

## D8 — implementation, review and acceptance are distinct

**Decision:** direct repository work; no mandatory orchestration tool or provider.
A separate reviewer/context or explicit human approval accepts an exact commit.
**Adopted:** 2026-10-14, development-continuity task and working-agreement refresh.
**Alternative:** previous AGENTS required Hermes/opencode, fixed providers and
main-branch pushes; that workflow no longer matches current development.
**Reasoning:** a fresh contributor must continue using repository knowledge;
self-review does not establish independence. **Consequences:** state/evidence
checks validate consistency, never auto-accept; `origin/v2` is this task's push
destination. **Revisit:** workflow tooling may change without weakening acceptance
or scope gates. Task-entry baseline `97a12de` was supplied by the human task and
corroborated by the later roadmap entry; historical eval recommendations are not
new acceptance decisions.
