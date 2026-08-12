# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`. Then the sections below. This
file is overwritten at the end of every session; git history preserves older
handoffs.

## Session summary

**User-review pass over the chat-first redesign, six fixes.** Nothing scrolls
anywhere → `main` is now the scroll container (the old `overflow-hidden`
clipped every page-flow view: deck detail, report, themes, identity; only the
chat scrolled). The chat input bar regains the old PromptBox's controls: a
LOCAL/CLOUD-filtered model dropdown beside the send button (the picked model
rides into `createDeck`/`createReport`/`generate` and persists on the chat), a
Chat/Report mode toggle where the user types (the buried "Start a report chat"
welcome link is gone), and the duplicate header "New chat" button is removed —
the sidebar's one creation entry is the only one. Chats auto-name from the
first topic message (48 chars) and take the deck title once the briefing/plan
settles one. **Registration no longer auto-logs-in** — the server returns no
token, the client stores none, and both auth surfaces switch to the login form
with a success banner and the email pre-filled. Also root-caused and fixed the
long-tracked dev-only "two children with the same key" warning: the deck
detail's presenter picker keyed `<option>`s by `m.name` while the default
identity team has empty-name placeholder members — every empty name collided,
and the empty string is why the message read as a literal `%s`. `npm test`
153/153, `vite build` clean, 24/24 CDP checks + zero console errors, and the
fixes vision-checked with `mimo-v2.5`. Dev servers running at :5174/:5173.

## What shipped

### Client

- **`App.jsx`** — `main` is `overflow-x-hidden overflow-y-auto` instead of
  `overflow-hidden`. The chat view is `h-full` and keeps its own inner
  scroller, so the footer stays pinned; every other view scrolls in `main`
  (the report view's sticky action bar works against it too).
- **`views/ChatView.jsx`** — the bottom bar is now a two-row well: textarea +
  send on top; a Chat/Report mode toggle (visible only while no topic is sent;
  flipping it just changes the greeting/placeholder) and the model dropdown on
  the row below. `chatName(title, topic)` derives the sidebar name (deck title
  wins once chosen, else the topic's first 48 chars). `model` is sent with
  createDeck / createReport / generate and saved back onto the chat. The
  header's "New chat" button and the Welcome's inline "Start a report chat"
  link are deleted.
- **`components/LoginScreen.jsx` + `components/AuthModal.jsx`** — register
  success now flips to the login form ("Account created for X — log in to
  start."), email pre-filled, password cleared; `onDone` is only reached by
  login.
- **`views/DeckDetail.jsx`** — the presenter dropdown filters out empty-name
  team members and keys by index (the duplicate-key fix).
- **`api.js`** — `api.register` no longer calls `rememberToken`.

### Server (`app/server/index.js`)

- `POST /api/auth/register` returns `{ user }` with no session token; only
  `login` mints one.

### Docs

- `docs/ROADMAP.md` — the "two children with the same key, `%s`" Learned note
  now records the root cause (empty-name presenter options) and the fix.
- `docs/ARCHITECTURE.md` — auth paragraph states register mints no session.

## Verification notes

- `npm test` 153/153; `npx vite build --config app/web/vite.config.js` clean.
- **CDP (headless Chrome, 24/24):** register → still on the login screen, no
  `forge.token` in localStorage, success banner shown, email pre-filled; manual
  login then works and stores a token. Model dropdown present in the chat
  input, Chat/Report toggle present, welcome swaps when toggled; zero header
  "New chat" buttons and exactly one in the sidebar; the inline report link is
  gone. Sending "Solar water pumping…" renames the sidebar row to the truncated
  topic. Chat thread, sidebar list (13 chats), deck detail (11 slides), report
  view and themes all have `scrollHeight > clientHeight` and a scrollTop that
  changes. **Zero console errors** — the old `%s` key warning is gone.
- **Model wiring:** picking `deepseek-v4-flash` in the pill persisted it on the
  chat and the intercepted `POST /api/decks` body carried `"model":
  "deepseek-v4-flash"` (fetch mocked in-page, request never reached the model
  provider — local Ollama untouched; the intercepted run was also aborted and
  its stray `decks/green-hydrogen-electrolysis-compared/` folder deleted).
- **Vision (`mimo-v2.5`, confidence 0.97):** login screen with the success
  banner and pre-filled email (not the app); chat input shows the sparkle
  model pill ("auto · deepseek-v4-flash"), Chat/Report toggle, send button, no
  header button; sidebar has one "+ New chat"; deck/report/themes each reach
  the bottom of the viewport with full content visible.
- `config/local.yaml` was left as `routing.default: cloud` (a generation-test
  leftover); restored to `local` per the handoff's documented end state. Cloud
  key untouched.
- Generation itself was not re-run this session — only the deck render
  (`POST /render`, no model) for the scroll test, plus the aborted mock.

## Seams and leftovers

- **Chat input bar is busier than the old prompt box.** Textarea row + a
  second row carrying the mode toggle and the model dropdown. Two rows reads
  fine but the well is taller; if the user complains about vertical space, the
  toggle could move into the header or into the welcome area.
- **Model pill shows during the whole lifecycle** (disabled while busy / at
  summary / outline / done). Fine, but a user mid-briefing can still flip it —
  intended.
- **`switchKind` only works on a topic-less thread** by design; a chat that
  already has a topic can't become the other product.
- **Auto-scroll effect fires on model change** (the `chat` dep), pulling the
  thread to the bottom when the pill is used mid-thread. Harmless while typing,
  mildly annoying if a user picks a model while reading up-thread.
- **Briefing is forward-only** (from the previous handoff, unchanged): "change"
  on an answered card rewinds `briefStep`; no per-field backward edit.
- **Auth-modal still exists** for the Identity view's cloud-key gate; the
  landing is the full-screen LoginScreen (both now share the no-autologin
  register flow).
- **F13 image grounding / F16 i18n** designs from the earlier handoff remain
  unbuilt.
- The `%s` duplicate-key warning is fixed, but a **code smell remains**: the
  default identity team's placeholder members (empty names) exist only to pad
  the team card. If that changes, the presenter-picker filter in DeckDetail is
  the seam to recheck.

## End-of-session state

- Dev servers running: API `http://localhost:5174` (node --watch), UI
  `http://localhost:5173` (Vite). Restart with `npm run api` / `npm run web` if
  down; check `/api/health` before trusting an endpoint.
- `config/local.yaml`: cloud key attached, `routing.default: local`.
- All commits pushed to `origin/main` (last push: the six-fix tranche + docs).
  Server code is the thin transport as before — the CLI shares
  `src/ai/pipeline.js`, and CLI-created decks stay ownerless/shared.
