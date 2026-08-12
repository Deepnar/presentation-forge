# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`. Then the sections below. This
file is overwritten at the end of every session; git history preserves older
handoffs.

## Session summary

**The app is now chat-first: the chat window is the product. Log-in/register is
the landing, the deck workspace is per-user, a topic sent in a thread walks a
guided briefing one question at a time (visual theme gallery, defaults
everywhere), and the outline gate lives in the chat with a plain-language card
per slide. The old wizard form, home prompt box and standalone outline view are
deleted. The deck detail's six-action row folds into one Export menu. Per-user
ownership is enforced server-side (401 gate + per-slug checks + list filter).**
`npm test` 153/153, `vite build` clean, the full create→brief→plan→approve→
generate→open flow verified over CDP end-to-end twice with zero console errors,
and the theme gallery + outline + de-clutter vision-checked with `mimo-v2.5`.
Dev servers running at :5174/:5173.

## What shipped

### Server (`app/server/index.js`, `src/ai/pipeline.js`, `src/ai/catalog.js`)

- **Auth-first workspace.** `app.use("/api/decks", …)` and `/api/reports`
  require a session (401 otherwise); the raster/download GET routes are exempt
  because `<img>` tags cannot send a bearer token (their slugs are only
  discoverable via the gated list). `createDeck`/`createReport` stamp
  `meta.yaml` with `owner: <email>`. The deck list and `/api/decks/search`
  filter by owner; every per-slug route checks ownership and answers "no such
  deck" (never "not yours") for another account's deck.
- **Legacy decks stay shared.** A folder whose `meta.yaml` has no `owner` is a
  legacy/CLI deck, visible to every logged-in account. Existing committed demo
  decks (type-batch*, flow-ttb, raytracing-ai, the user's exploring-* folders,
  solar-water-copy) are all ownerless and behave this way. Migration note: if
  the user wants old decks under one account only, that is a one-off re-stamp
  of `meta.yaml` `owner:` fields — no code change needed.
- **`TYPE_DESCRIPTIONS`** in `src/ai/catalog.js`: every one of the 75 slide
  types gets a plain-language sentence ("Stats — big numbers with captions"),
  guarded by `typeDescriptions()` which throws on a missing entry. Exposed via
  `/api/types` alongside the enum; the in-chat outline renders these.

### Client (`app/web/src`)

- **`LoginScreen.jsx`** — the auth-first landing; register/login, local
  scrypt accounts (pre-existing auth.js), token in localStorage.
- **`ChatView.jsx`** — the app. Thread + bottom input bar. Phases: greeting →
  briefing (9 questions one at a time) → summary → planning → outline →
  generating → done. Free-text answers in the input bar work for most questions
  (`lib/briefing.js` `applyFreeText`); choice cards (theme gallery, density,
  research, slide counts) have inline controls. Only the summary card's "Plan
  the deck" starts research/planning. Approve streams "Writing slide N/M…";
  "Open the deck" lands on the deck view. Report chats (welcome link / New chat
  flow) go straight to `createReport` with no briefing.
- **`lib/chats.js`** — per-account localStorage chat store; each chat knows the
  deck/report it produced (`deckSlug`, `produced`).
- **`lib/briefing.js`** — question list, identity pre-fill, title suggestion,
  echo strings, free-text answers. The wizard's data model, as a conversation.
- **`lib/progress.js`** — `progressLabel` moved out of the deleted NewDeck view.
- **`ThemeMiniCard.jsx`** — a mini live specimen of a theme from its own tokens.
- **`Sidebar.jsx`** — Chats / Decks tabs, per-user lists, one "+ New chat"
  creation entry, Ctrl+K still focuses deck search.
- **`App.jsx`** — chat-first routing (chat | deck | report | themes | identity),
  boot-time session rehydration, initial-chat minting (StrictMode-safe via
  storage reads), Ctrl+N → new chat, report→companion-deck flows into a chat
  that skips the briefing (`startCompanionChat`).
- **`DeckDetail.jsx`** — action row collapsed into one Export ▾ menu (PDF /
  Markdown / Bundle / Clone / Versions / Dark mode); Render + .pptx stay in the
  header. **Deleted:** `Home.jsx`, `NewDeck.jsx`, `Outline.jsx`, `PromptBox.jsx`.

## Verification notes

- `npm test` 153/153; `npx vite build --config app/web/vite.config.js` clean.
- Full CDP flow (headless Chrome, Node 24's global WebSocket) run end-to-end
  twice, clean: login screen → register → new chat → send topic → questions one
  by one → **member add with the network counter flat (0 requests)** → theme
  gallery shows visual mini cards → summary → Plan the deck → outline with
  plain-language slide cards → Approve & generate → streaming status → Open the
  deck. Deck view shows a single Export menu; no "+ New deck" anywhere.
- Auth flow over CDP: logout → login screen; login → prior chat restored; Ctrl+N
  mints a new chat.
- Per-user separation over the API: user A's ready deck appears in A's list
  (count 17) and not B's (16); B opening A's deck gets 404; `meta.yaml` owner
  stamped correctly.
- Generation tests ran with the cloud model (routing temporarily flipped to
  `config/local.yaml` `default: cloud`, restored to `local` after). Local Ollama
  untouched. `config/local.yaml` routing is back to `local`.
- Vision (`mimo-v2.5`): login screen clean; theme gallery = real visual
  previews (Art Deco / Aurora Mesh / Bauhaus specimens visible); outline rows
  read "17 Scorecard — criteria scored in a simple table"; deck view has one
  Export dropdown with the six plain labels, Render + .pptx present, no
  creation entry beyond New chat.

## Seams and leftovers

- **One React dev-only warning observed once, never reproduced:** "Encountered
  two children with the same key, `%s`" appeared in a single full CDP run; three
  subsequent full runs logged zero console errors. The literal `%s` suggests a
  lost key argument in React's own formatting; no colliding-keys code path has
  been found. Tracked in the ROADMAP entry, not chased.
- **Briefing is forward-only.** "change" on an answered card rewinds
  `briefStep` and re-asks from there (later answers are discarded). No
  backward-only edit without re-answering — acceptable, but a per-field edit
  would be smoother.
- **Theme gallery default selection ring** sits below the compact grid's scroll
  (warm-humanist sorts last). Auto-scrolling the selected card into view is a
  natural follow-up.
- **Slides-per-member is guidance, not enforcement.** It is appended to the
  planning brief ("roughly N per presenting member") — the writer sees it, but
  no code splits presenters. Real per-slide presenter distribution remains the
  free-form field on the deck detail.
- **Companion-deck flow** (report → "Generate companion deck") routes into a
  chat pre-loaded with the plan (skips briefing). Verified by construction (it
  reuses the verified outline card), not run end-to-end — running it writes
  `plan.yaml`/`deck.yaml` into a committed report deck's folder.
- **Density** is folded into the planning brief text; there is no schema field
  for it.
- **Auth-modal still exists** for the Identity view's cloud-key gate; the
  landing is the new full-screen LoginScreen.
- **F13 image grounding / F16 i18n** designs from the previous handoff are
  unchanged and still not built.

## End-of-session state

- Dev servers running: API `http://localhost:5174` (node --watch), UI
  `http://localhost:5173` (Vite). Restart with `npm run api` / `npm run web` if
  down; check `/api/health` before trusting an endpoint.
- `config/local.yaml`: cloud key attached, `routing.default: local`.
- All commits pushed to `origin/main` (last push: the chat-first tranche; the
  gating follow-up; docs). Server code is the thin transport as before — the
  CLI (`forge new/generate/chat/report`) shares `src/ai/pipeline.js` and the
  per-user owner field is simply absent on CLI runs, so those decks stay shared.
