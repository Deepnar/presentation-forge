# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`. Then the sections below. This
file is overwritten at the end of every session; git history preserves older
handoffs.

## Session summary

**Two queued user tasks, both done and verified end-to-end: (1) product
framing + entry flow — "the app does the bulk, you do the final touches", the
landing page as the front door, and New chat as the constant post-login
landing; (2) report button states — a shared report-write state so Render
.docx / Download / Plan can never be clicked mid-write.**

### Task 1 — Product framing + entry flow

1. **Framing reframed everywhere.** Every product-describing surface now says
   "the app does the bulk — research, structure, draft content, render — you do
   the final touches: verify the facts, tune the words, make it yours", with
   "Bulk by machine, polish by you" as the short form: `#/home` hero/tagline/
   how-it-works/capability copy, the auth modal (which inherited the old login
   screen's tagline), the chat welcome + footer hint, README + LOCAL_SETUP
   taglines, the sidebar empty states and the report view's no-report hint.
2. **Landing-first entry.** An unauthenticated visitor lands on `#/home` — the
   landing is the front door whatever the hash (an auth-gated deep link still
   redirects to it, and its hash survives so login can honour it). The landing
   carries the auth: a slim Log in / Sign up bar, and the hero "Start a chat"
   opens the register modal. All auth actions go through the existing
   `AuthModal` (which gained the registration-closed handling the old
   LoginScreen had). The full-page `LoginScreen.jsx` was **deleted** — its role
   and tagline folded into the landing + modal.
3. **New chat is the constant landing.** Post-login and post-register the app
   routes to a fresh New chat every time (reusing the account's empty thread,
   minting one when none exists) — never the last route, never the decks list.
   Only an explicitly-opened artefact deep link (`#/deck/<slug>`, `#/report/…`,
   `#/research/…`) is honoured; a chat id in the URL is the last route, not a
   deep link, so it resets to a bare `#/chat`. Logout resets the hash to
   `#/home`. This supersedes the earlier "reopen at last position" idea.

### Task 2 — Report button states

- `lib/reportWrites.js` (new): slug-keyed mirror of `runs.js` —
  `begin/update/end` + subscribe.
- The deck's ReportPanel `generate` registers the write and streams its status
  into it; the ReportView subscribes for its slug and — while a write is in
  flight — disables Render .docx (spinner during both write and render),
  hides the Download link, disables "Generate companion deck" and "Add as
  slide", and shows the write status + a Stop that aborts through the registry.
  A remounted ReportPanel re-adopts an in-flight write.
- Download link only after a render exists (`result`), and hidden during a
  write. One-click "render and download" verified (auto-download anchor).

## What shipped

- `app/web/src/lib/reportWrites.js` (new) — slug-keyed report-write registry.
- `app/web/src/App.jsx` — landing-first logged-out branch (always Home +
  AuthModal), chats effect always lands on the account's empty thread (New
  chat), boot effect honours only artefact deep links and resets chat-id hashes
  to `#/chat`, logout resets to `#/home`. The `pendingChatIdRef` mechanism was
  removed (chat-id restore at login is gone by design; mid-session back/forward
  still works through `applyHash`).
- `app/web/src/views/Home.jsx` — auth bar + auth-aware hero/CTA routing, new
  framing copy everywhere.
- `app/web/src/components/AuthModal.jsx` — registration-closed handling +
  human-touch tagline.
- `app/web/src/components/LoginScreen.jsx` — **deleted** (superseded by
  landing + AuthModal).
- `app/web/src/views/DeckDetail.jsx` — ReportPanel registers into
  reportWrites, re-adopts on mount, disables during write.
- `app/web/src/views/ReportView.jsx` — subscribes to reportWrites; write state
  disables Render/Download/Plan/Add-as-slide, shows status + Stop.
- `app/web/src/views/ChatView.jsx`, `Sidebar.jsx` — framing copy.
- `README.md`, `LOCAL_SETUP.md` — tagline framing.
- `docs/ROADMAP.md`, `docs/ARCHITECTURE.md` — two new checked entries + sync.

## Verification notes

- `npm test` 261/261; `vite build` clean.
- CDP scripts (under `/tmp/opencode/`):
  - `cdp-entry-report.mjs` — full Task 1 + report render/download round: boot
    lands on `#/home` with Sign up visible + the framing hero; register from the
    landing → login → lands on New chat (`#/chat`, 1 empty row); New chat twice
    stays 1 row (reuse); logout → landing → re-login → New chat; explicit
    `#/deck/gpu-demo` deep link opens the deck after login (auth-gated);
    ReportView: no Download before any render, one click renders AND
    auto-downloads, Download appears after. All assertions pass.
  - `cdp-rw.mjs` — Task 2: deck without report.yaml → Generate report in the
    Report panel registers a write; while it runs the panel's Generate is
    disabled and "Planning/Writing section N of M" + Stop show; navigating to
    the ReportView for the same slug mid-write surfaces the same write status +
    Stop and no render action; Stop clears the status. All pass.
  - `mimo-v2.5` vision check on the screenshots: landing hero/auth bar clean,
    deck detail clean, report view's sticky bar with Render .docx + Download
    clean, and the mid-write ReportView shows "Planning the report…" + Stop
    cleanly. No overlap/clipping anywhere.
- The `data-centre-energy-consumption-how-much-elec-2` deck was used for the
  write-state test; its `report.yaml` was removed at the end (keep or delete
  the deck freely).

## Seams and leftovers

- Registration never hands out a session (by design), so "register from the
  landing → New chat" is register-then-log-in; the CDP flow does both steps.
- The `reportWrites` registry is only fed by the ReportPanel's `generate` (the
  chat's standalone-report path knows its slug only at result, so it can't
  register mid-write — and the ReportView can't be open for it mid-write
  either, since report.yaml doesn't exist until the write completes). If a
  future regenerate path appears, route it through `reportWrites.begin` too.
- `schema/report.schema.json` still carries the unrelated reformat diff from
  prior sessions — left untouched as before.
- The untracked `decks/*` dirs are prior fixtures + this session's test decks;
  keep or delete freely. `config/users.json` (gitignored) holds the operator
  (`operator@forge.local`, `operator-pass-1`) plus this session's
  `cdp-*@entry.local` account.

## End-of-session state

- Servers running: API `http://localhost:5174` (plain `node
  app/server/index.js` via setsid, NOT watch mode), web `http://localhost:5173`,
  SearXNG `:8888`, Ollama `:11434`. Frontend-only changes this session, so no
  API restart was needed. If you change server code, restart the API yourself.
- All commits pushed to `origin/main`. Commits (one logical change each):
  the copy reframe; the landing-first entry; the always-New-chat landing;
  the report write state; the roadmap/architecture sync; this handoff.
- ROADMAP (two new checked entries), ARCHITECTURE (entry flow + report-write
  registry), and the handoff all updated to match.
