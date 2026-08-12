# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`. Then the sections below. This
file is overwritten at the end of every session; git history preserves older
handoffs.

## Session summary

**Chat-first batch 2 — nine fixes from the user's review.** Section dividers
no longer get assigned a presenter (grammar exclusion, pipeline strip and a
chrome-footer rule, not a prompt nudge); deck and report sections now scale to
the team (`clamp(members, 3, 8)`, report floored at the graded core); the
research pass is deep — 2-4 subtopic queries plus follow-ups, ~21 pages in a
real run instead of five; the writer must draw every figure from the research
and never invent images, and the grounding guard was verified live; the
briefing gained audience/emphasis questions, a rebuilt team editor and a
"Remember as defaults" button that writes config/identity.yaml; generation
runs survive leaving the chat (module-level runs registry, errors persisted);
report chats auto-name (root cause: `??` on empty strings); the sidebar gained
hover "⋯" row menus and `DELETE /api/decks/:slug` (new endpoint). Also fixed a
cloud-revealed failure: a large-team outline occasionally truncated at the old
8192 `num_predict` (now 12000), and invented image URLs crashed the render
(now degrade to a placeholder). `npm test` 166/166, `vite build` clean, 17/17
CDP checks, generation + vision checks passed with the cloud model
(`deepseek-v4-flash`), local Ollama untouched. All commits pushed to
`origin/main`.

## What shipped

### Pipeline (`src/ai/`)

- **`team.js` (new)** — `presentingNames`, `teamSize`, `targetSections`,
  `DIVIDER_TYPES`. Single source for the "who presents" rule and section caps;
  filters the padding empty-name members of a fresh identity.
- **`generate.js`** — `buildOpsSchema` call gains `excludeProps: ["presenter"]`
  for divider types in `writeSlide`; `generateDeck` strips stray presenter off
  dividers after the loop; `planDeck` sizes `sections` to
  `targetSections(identity)` and tightens the outline schema's cap to match,
  and instructs the planner about team size and avoiding image-requiring types;
  `writeSlide` hands content slides the presenting-members list (grounded
  assignments) and demands figures from the research and no invented image
  paths.
- **`ops.js`** — `buildOpsSchema({ excludeProps })` drops shared fields from the
  payload grammar.
- **`chrome.js`** — the footer's presenter line is suppressed on divider
  surfaces (section/chapter/closing/epigraph; title never reaches it). The
  fallback (whole presenting team) would have painted names on dividers too.
- **`report.js`** — `planReport` sizes its section cap to the team (floor 4,
  the graded core), schema and prompt both.
- **`research.js`** — `deepResearch` (subtopic queries + follow-ups) and
  `expandQueries` (research-role call, falls back to the brief alone). Excerpt
  budget unchanged at 80K (local 32K window).
- **`pipeline.js`** — `runResearch` takes `onProgress` and uses `deepResearch`;
  `createReport` returns `title` so the server can name the chat.

### Server (`app/server/index.js`)

- `DELETE /api/decks/:slug` — removes the deck folder, behind the same
  per-slug ownership gate as every other route.
- `/api/reports` SSE result now carries `title`.

### Client (`app/web/src/`)

- **`lib/runs.js` (new)** — module-level registry of live generation runs
  `{abort, status, finished, subs}`; only subscriptions are tied to the
  component, never the run.
- **`views/ChatView.jsx`** — runs registered in `planDeck`/`approve`/`runReport`,
  re-adopted on mount, errors persisted onto the chat; report chats rename from
  the topic then the report title; `chatName` uses `(title?.trim() || topic)` —
  `??` on an empty string was the report-naming bug; audience/emphasis questions
  + `FreeTextCard`; rebuilt `TeamCard` (headers, add/remove, Enter-to-add, live
  count, empty rows filtered); "Remember as defaults" writes config/identity.yaml
  via `api.saveIdentity` and re-feeds the app.
- **`lib/briefing.js`** — audience/emphasis questions, pre-fill filters
  empty-name members.
- **`components/Sidebar.jsx`** — hover "⋯" `RowMenu` per chat/deck row
  (outside-click close), `ConfirmModal` for deck deletion.
- **`App.jsx`** — `handleDeleteChat` / `handleDeleteDeck`, `onIdentityChanged`
  passthrough to ChatView.
- **`api.js`** — `deleteDeck`.

### Docs

- `docs/ROADMAP.md` — new "Chat-first batch 2" item with a six-point Learned
  block (grammar-exclusion, cloud outline verbosity, invented images,
  module-state runs, `??` on empty strings, section-cap × slide-budget
  interaction).
- `docs/ARCHITECTURE.md` — web-shell section now describes ChatView/runs/sidebar
  menus instead of the removed Home/prompt-box; new paragraphs on team-sized
  structure, divider presenters, deep research, invented-image degrade.

## Verification notes

- `npm test` 166/166; `npx vite build --config app/web/vite.config.js` clean.
- **CDP (headless Chrome, 17/17):** deck + chat "⋯" menus with the confirm
  modal; team editor add/remove with zero network on add; "Remember as
  defaults" persists; a run started from "Plan the deck" survives navigating to
  Identity and back (status re-adopted, Stop works); report-chat topic renaming.
  Harness: `/tmp/opencode/cdp.mjs` (not in the repo).
- **Generation (cloud, `deepseek-v4-flash` via opencode-go):** 2 members → 3
  sections, 8 members → 8 sections (plan only); a full 10-slide
  "first impressions and networking" deck generated with research on — 5
  dividers carry no presenter, content slides carry real team members'
  presenters, no invented names, and the "60%" stat the writer used is grounded
  in the notes. A standalone brief report (quantum dots) generated all 8 graded
  sections and rendered to .docx.
- **Vision (`mimo-v2.5`, confidence 0.85):** divider slides show no presenter
  footer; content slides show the member's name; no overflow/overlap anywhere.
  The one finding — grey placeholder image boxes on the side-by-side slide — is
  the designed degrade path for the invented-URL case (the deck was generated
  before the no-invented-images prompt landed).
- The render crash that surfaced mid-test is fixed: `resolveAsset` returns null
  for URLs/missing files, so a bogus `image` field is a placeholder, not a dead
  deck.

## Seams and leftovers

- **Image-requiring slide types are effectively unusable until F13 lands.** The
  planner is told to avoid them and the writer never to invent a path, but if a
  user forces one (or an older deck has one), the slide renders as grey
  placeholder boxes. The research panel is where real image supply would slot in.
- **Cloud outline is slow (~80-100s).** deepseek-v4-flash writes verbose JSON;
  the 12K cap guarantees completion but "Plan the deck" can feel slow. The
  brevity prompt rules helped only somewhat — worth revisiting if the user
  complains about wait time.
- **`first-impressions-and-networking-how-people/`** is an untracked test deck
  from this session's generation test (the user's own browser-test folders
  `decks/exploring-first-impressions-*` and the stray
  `decks/solar-water-pumping-for-irrigation-copy/` were left untouched, as
  instructed). Decide whether to keep/commit the new one.
- **Briefing is forward-only** (unchanged from previous handoffs): "change" on
  an answered card rewinds `briefStep`; no per-field backward edit.
- **`switchKind` only works on a topic-less thread** by design.
- **F13 image grounding / F16 i18n** remain unbuilt.

## End-of-session state

- Dev servers running: API `http://localhost:5174` (node --watch), UI
  `http://localhost:5173` (Vite). Restart with `npm run api` / `npm run web` if
  down; check `/api/health` before trusting an endpoint.
- `config/local.yaml`: cloud key attached, `routing.default: local` (restored
  after the cloud generation tests).
- All commits pushed to `origin/main` (last push: the batch-2 tranche + docs).
  Server code is the thin transport as before — the CLI shares `src/ai/`, and
  CLI-created decks stay ownerless/shared.
