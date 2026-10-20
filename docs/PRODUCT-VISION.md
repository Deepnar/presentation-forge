# Product vision

Presentation Forge is becoming a unified presentation workspace: supply a topic
or raw material, obtain a coherent themed deck, refine it through human editing
and AI assistance, and export editable native PowerPoint. The V2 program in
[ROADMAP.md §12](ROADMAP.md#12-v21--agent-native-re-architecture-program) is the
source of this direction. Legacy generation and academic report workflows remain
supported during migration; a Gamma-like experience is the goal, not a claim that
every end-to-end link already exists.

## One document, two consumers

| Layer | Role |
|---|---|
| A: semantic intent | Content and relationships, without model-authored coordinates, fonts or colours |
| B: deterministic compiler | Composition families, layout, resolved theme styling and fitting |
| C: authoritative scene | Exact editable objects consumed by browser SVG and native PPTX |

The model never writes layout code. Theme `tokens` and model-facing `voice`
stay disjoint. Institutional chrome remains locked. See [ARCHITECTURE.md](ARCHITECTURE.md)
and [the editor contract](V2-5A-EDITOR-ARCHITECTURE.md), read with its later
implementation evaluations and [persistence architecture](V2-6-PERSISTENCE-ARCHITECTURE.md).

Layer C is the editing authority because it holds the actual shapes, text,
charts, tables, identity and ownership that both consumers render. Editing a
screenshot proxy or separately rerendering a server document would split that
authority. Native PowerPoint matters because recipients must be able to correct,
present and reuse the exported text, shapes, chart series and tables. Raster
plates may supply decoration; they must not replace editable slide content.

## Human work survives assistance

Human and future agent edits use validated revisioned commands, with atomic
failure, undo/redo, stale-base refusal and provenance. Regeneration preserves
customized geometry, text/data/style ownership, human-added objects and deletion
tombstones. Detached means compiler-hands-off, while manual editing remains
possible subject to locks. A human's correction must not disappear on a later
AI turn. Persistent version history restores as a new durable revision; it is
separate from session-only undo/redo.

AI composition families interpret semantic intent. Manual layout templates are
editable scene skeletons for explicit human insertion. The template catalog
must not become a rigid limit on AI generation. See [V2-5K](V2-5K-EVAL.md).

## Current workspace and remaining links

V2-7A implements Workspace → Project → Editor, saved project cards, blank/layout
creation, a shared editor shell, contextual inspector and history. Its validation
and acceptance status are in [development-state.json](development-state.json).
The Assistant tab is a labeled placeholder. “Create with AI” enters legacy chat;
completed presentations and the legacy deck page offer an explicit **Open in
editor** action through the shared HTTP/headless conversion boundary. It creates
or reopens a saved Layer-C project, preserves human edits on retry and retains
original-deck access with explicit coverage/refusal gates. V2-7B-1 is independently
accepted; V2-7B-2 is independently accepted for the bounded handoff, with its
exact decision and validation state indexed in [development-state.json](development-state.json).
V2-7C-1 adds first-saved-slide previews to the existing project grid, using the
authoritative scene and canonical SVG renderer. Previews are disposable reads;
their loading, failure or retry never creates another project document. Its
independently accepted source `f79ae07`, validation and review are indexed in
[V2-7C-1-EVAL.md](V2-7C-1-EVAL.md).
C2 unifies generated originals and saved copies in one Projects catalog without
merging documents or importing on reads. C3 separates standalone developer
controls/diagnostics from normal saved-project editing; its current validation
and independent-review state are indexed in development-state.json.
The headless tool/context foundation, durable run core and bounded provider
exchanges are independently accepted. Exchanges propose canonical semantic edits;
the live editor/runtime retains authority. [The V2-8C evaluation](V2-8C-EVAL.md)
distinguishes local protocol/persistence evidence from live content qualification.
The Assistant remains a placeholder.
The sole work registry is [ROADMAP.md](ROADMAP.md); AI editing integration,
native assets/imports, frontend polish and deployment operations retain their
roadmap dependencies.

SQLite remains the default single-instance store; PostgreSQL is the shared-state
option. Hosted workflows need operational readiness as well as database correctness.
No production migration or deployment is implied by editor acceptance. Hosted Auto
is the reference for generated-content quality. Local Ollama remains supported;
when the gateway is unavailable, local runs prove plumbing only.

## Decisions to preserve

No model layout escape hatches; no screenshot/proxy document architecture; no
separate editing command path for agents; no silent overwrite of human work or
stale revisions; no flattening native exports; no unsafe removal of legacy paths
before parity. Real-time collaboration, persistent undo, sharing and autonomous
agent execution are not implied by the current workspace. New direction requires
a scoped roadmap decision rather than inference from this document.
