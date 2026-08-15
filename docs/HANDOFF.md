# HANDOFF — post user-testing-round-5 implementation

All 24 items from the 2026-08-15 user-testing handoff are implemented,
committed and pushed. 286/286 tests pass; the web build is clean; servers were
left running (UI :5173, API :5174, Ollama, SearXNG). This document records
what the current state is so the next session can verify, extend or spot-check
without re-reading the old task list.

## What shipped this round (each committed + pushed)

**Confirmed bugs**
1. **Report view busy-state** — render and report-write now share one busy
   state; `reportWrites.end()` fires the terminal `{finished:true}` patch so a
   write can never leave a stuck "Rendering…". The Download link derives from a
   server probe of `out/report.docx`, so reopening shows it without re-render.
2. **Report blank pages 2-3** — `src/report.js buildBody` now emits exactly ONE
   page break after the cover and ONE after the TOC, with no `pageBreakBefore`
   on section 1. Verified blank-free by rasterising a real report.

**UX batch**
3. **Chat slide-selection panel** — after a deck is ready, a ~40% side panel
   (`SlideSelectPanel.jsx`) shows every rendered slide scrollable; multi-select
   names the chosen slides (index + type + headline + content excerpt) in the
   turn context. The deck view's lightbox writes the focused slide into
   `lib/deckContext.js`, so "make THIS punchier" resolves after returning to
   the chat. Per-slide punch-up and type-swap act on the selection.
4. **Briefing → planner verbatim** — `briefingAnsweredText()` in
   `lib/briefing.js` sends every answered question as an explicit
   "The user answered: …" block (separate from the research brief), threaded
   through createDeck → planDeck.
5. **Intro→conclusion flow** — the planner prompt now always instructs
   title → intro → body → conclusion, regardless of the brief.
6. **Logout confirmation** — shared `ConfirmModal` primitive; logout is
   confirmed before the session drops.
7. **Split-screen auth + one CTA** — AuthModal is a visual-left / card-right
   split labelled "Sign up"; the landing has one strong CTA ("Start a chat"),
   the rest are text links.
8. **Theme previews unified** — Themes page cards use the same 16/8 + 16/5
   specimen proportions as the mini cards; the mini card now shows the theme's
   font names (home + briefing gallery).
9. **List content floor** — bullets/numbered-list/checklist/icon-list/
   stacked-list `minItems` 2→4 in the schema; the trim pass can no longer cut
   below it; placeholder writes four items; budget notes updated.

**Addenda**
10. **Placeholder leak** — `src/placeholders.js` detects placeholders by marker
    text (current + historical). Render gate refuses (422 naming the slides);
    `generateDeck` retries each placeholder once then flags into problems[];
    the deck view shows a red "Needs regeneration" panel with per-slide
    Regenerate (scoped chat turn) + card badges. Existing placeholder decks
    were swept via cloud turns (verified 0 remaining).
11. **Divider intent** — verified: dividers are transition slides carrying no
    presenter; the catalog description reads clearly ("a divider announcing the
    next part of the talk"). No code change.
12. **Per-type when-to-use** — `TYPE_USE_WHEN` map added; folded into
    `slideCatalog`, `catalogForType` and `/api/types`; a guard refuses to ship
    a type without guidance.
13. **Neutral specimens** — Themes page cards show "Title"/"subtitle line"
    placeholders (no gpu-demo content); the type-swap gallery prefers
    hand-written neutral specimens over demo decks.
15. **Slash commands** — `/theme`, `/density`, `/slides`, `/papers`, `/report`,
    `/help` parsed before the turn (`lib/slash.js`); unknown commands get a
    helpful reply.
16. **Per-step telemetry** — `progressLabel` now names research queries,
    writing/sweeping N of M, converting, report sections.
17. **Auto-grow composer** — textarea grows 44px → ~152px cap, larger radius.
18. **Profile chip bottom-left** — `ProfileChip.jsx` (avatar+name, avatar-only
    collapsed) opens a centred modal with the AI's identity context, cloud
    status, and logout-with-confirm. Header logout removed.
21. **Hosted model curation** — `providerModels()` in `src/cloud.js` fetches
    `GET {baseURL}/models` when a provider's static list is empty (key-gated,
    both `{data:[{id}]}` and string-array shapes). Cloud panel labels the list
    "Models this host has enabled"; README deploy docs added.
22. **Sweep leak check** — the sweep prompt explicitly forbids carrying content
    across slides; a test proves the bullets slide's context never contains the
    cards slide's content. Grounding confirmed to run after the sweep.
23. **Generalised copy** — no provider-specific or user-specific wording in
    app/web or app/server; README:8 → "institutional graded submissions".
24. **Coherence pass** — `src/ai/coherence.js` runs after generation AND after
    a density sweep: one bounded review flags topical drift / data-without-a-
    point, rewrites flagged slides via runTurn, then re-grounds + re-trims.
    Writer prompts carry the framing rule. Verified on the real soft-skills
    deck: slide 17 (the flight-attendant chart) became "The Face Is Read Before
    a Word Is Spoken", re-rendered and vision-checked.

## Where the docs point

- `docs/ARCHITECTURE.md` — new sections: the coherence pass, the placeholder
  gate, the chat selection panel/briefing/auto-grow, split-screen auth +
  profile chip, the single page-break report layout, cloud model auto-fetch,
  neutral specimens.
- `docs/ROADMAP.md` — a completion entry for the whole batch with Learned
  blocks (coherence ≠ grounding; validating placeholders; shared busy
  terminal events; schema floor vs prompt floor).
- `docs/TRAPS.md` — new cross-cutting entries for the validating-placeholder
  and coherence-vs-grounding failure modes.

## Verified behaviourally this session

- Report blank pages: rasterised 12-page report, no empty interior page.
- ReportView reopen: Download link present from the server probe, no stuck
  spinner (CDP).
- Chat selection panel: renders, multi-select, turn context names selected
  slides with content excerpts (captured the outgoing instruction), lightbox
  focus flows to chat (CDP).
- Slash commands: /help, /theme, /slides, /density all act with inline
  confirmations (CDP).
- Logout confirm + profile modal (centred, identity + cloud + logout) both
  open/cancel correctly (CDP + vision).
- Auto-grow composer: 10-line paste → 144px, clears → 44px (CDP + vision).
- Placeholder gate: deck with placeholder shows warning + badge, render 422s,
  Regenerate replaces it and clears the badge (CDP).
- Coherence: real deck slide 17 re-framed, re-rendered, vision-confirmed
  serving the topic.
- Theme cards + type-swap: neutral specimens, no GPU/raytracing content
  (vision); 38 cards at consistent width, no clipped headings.

## Open items / notes for the next session

- `schema/report.schema.json` has a pre-existing cosmetic reformat in the
  working tree (JSON reflow, not semantics) — was present before this session;
  left untouched. Commit or revert as you prefer.
- Many untracked `decks/<slug>/` folders exist (user test decks). They are
  working data, not part of the repo; the committed fixtures are all valid.
- The coherence pass and the placeholder gate both run on cloud-author
  generations; on a fully local run they still run but the reviewer/rewriter
  uses the local author role. If local quality degrades, consider gating the
  coherence review to cloud authors only.
- TRAPS: the browser screenshot tool failed intermittently this session; the
  CDP driver at `/tmp/opencode/cdp.mjs` (Node WebSocket, no puppeteer) was
  reliable — reuse it for future UI checks.
