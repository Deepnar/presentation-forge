# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`. Then the sections below. This
file is overwritten at the end of every session; git history preserves older
handoffs.

## Session summary

**Combined frontend redesign + a security fix.** Two workstreams landed
together, each verified end-to-end:

1. **Per-user deck isolation (the leak).** A fresh account saw two dozen
   stranger decks because legacy CLI/test decks carry no `owner` in meta.yaml
   and the per-user gate treated them as shared. Ownerless decks are now
   operator-only: one `canAccessDeck(user, owner)` policy in `src/auth.js`
   gates the deck list, per-slug detail/render/report, content search AND the
   sweep (which is now admin-only). The seed admin gets `role: "admin"`
   (with `FORGE_ADMIN_EMAIL` fallback for pre-existing installs). CLI decks
   stay usable headless — the CLI never goes through server auth. Verified
   with real accounts: register A + B → B sees 0 decks, 404 on A's deck,
   admin sees all 20 ownerless legacy decks. Both API assertions and a CDP UI
   flow (register fresh account → Decks tab shows the "No decks yet" state).

2. **The visual + structural redesign** (specs `VISUAL_PLAN.md` +
   `DESIGN_CRITIQUE.md` top-10). Warm "ember on charcoal" shell: warm neutral
   ramp, accent `#e0705a`, elevation scale, `::selection`, warm scrollbar,
   one hero glow per screen; motion on one 220ms easing (staggered entrances,
   hover lift, count-ups, typing dots, press 0.98, rising toasts, 6s glow
   breathe, ember-tuned particle field with ×1.5 login boost); self-hosted
   Inter variable + Plex Mono via `@fontsource` (no CDN); type floors at
   15px body / 12px caption. Structure: real `<a href="#/…">` anchors on
   chat/deck/nav rows + wordmark; centred chat-home greeting column with the
   void removed; `#/home` landing page replaces the Docs modal; clickable
   theme cards (set default + toast + undo + search + badge); hover-reveal
   slide toolbars with styled tooltips and crimson delete; unified empty
   states; ProseNotes `**` strip; inline auth errors. Deep-link restore after
   login confirmed (navigate to deck → log out → log in → back on the deck).

## What shipped

### The leak fix (server-side)
- `src/auth.js`: `seedAdmin` stamps `role: "admin"`; `isAdmin(user)` (role or
  `FORGE_ADMIN_EMAIL`); `canAccessDeck(user, owner)` — the single decision.
- `app/server/index.js`: `assertDeckAccess`, `GET /api/decks`, content search
  and `POST /api/sweep` all route through `canAccessDeck`; sweep is
  operator-only. Per-slug gate still 404s ("no such deck", never "not yours").
- `src/ai/pipeline.js`: comment updated — ownerless meta is operator-owned.
- Tests: `test/auth.test.js` gains admin-role and access-policy coverage.

### The visual redesign (app/web/src)
- `styles.css`: full token pass (warm ramp, `--color-field`, `--color-accent-tint`,
  `--color-accent-glow`, `--color-success`, `--color-overlay`), shadow scale,
  `::selection`, warm scrollbar, `hero-glow`/`glow-breathe`, `view-stagger`,
  `toast-in`, `typing-dot`, `press`, 15px/12px type floors. `.scroll-x` dropped.
- `ui.jsx`: `Button` on `--dur-shell` with `.press`; `Panel` carries
  `--shadow-card`; `Field`/`inputCls` use `--color-field` + `line-strong`;
  `Empty` text floors; new `Tooltip`.
- `ParticleField.jsx`: `boost` prop; base 0.16–0.40, accent share 0.22,
  repulsion 150px ×9.
- `main.jsx`: `@fontsource-variable/inter` + `@fontsource/ibm-plex-mono`
  (400/500) imported — fonts were declared but never loaded before.
- `LoginScreen`/`AuthModal`: hero glow + display title + "Take the tour",
  inline per-field auth errors (danger border + message under the field),
  `bg-[var(--color-overlay)]` scrim on the modal.

### The structural pass
- **Anchors**: `Sidebar` chat/deck rows, `NavRow`, icon-rail `IconButton`, and
  `HeaderBar` wordmark are `<a href="#/…">` (middle-click/copy-link work). The
  plain-click handler stays for SPA navigation; meta-click is left to the
  browser. `onView` prop removed.
- **Chat home**: greeting is one centred column (hero → chips → composer)
  built on a shared `composerBar`; centring uses an `m-auto` inner wrapper so
  it scrolls instead of clipping (the `justify-center` clip is a TRAPS-worthy
  failure mode). Typing dots in the running bubble.
- **Landing**: `views/Home.jsx` + `#/home` route; Docs modal deleted; header
  link renamed Tour. Public when logged out; full-bleed (sidebar hidden) when
  logged in.
- **Themes**: cards set the default theme (localStorage `forge.defaultTheme`,
  toast + undo, search box, default badge); `lib/briefing.js` reads the stored
  default into new briefings.
- **DeckDetail**: slide-card actions collapse to a hover-reveal toolbar (3
  primary + ⋯ menu with crimson delete); `Tooltip` everywhere; unused icons
  removed.
- **Sidebar**: deck titles clamp to two lines (was truncating to initials).
- **Empty states**: Research + Report use shared `Empty`; Report's sticky
  "Render .docx" bar hidden when no report; ProseNotes strips `**`,`*`,`.
- **FirstRunHint**: slim corner toast, human copy, persisted.
- **Router**: `#/home` added to `parseHash`/`hashFor`; router tests updated.

## Verification notes

- `npm test` 246/246; `vite build` clean.
- CDP (headless Chrome via `node /tmp/opencode/cdp-shot.mjs`):
  - Leak UI: fresh registered account's Decks tab shows 0 decks + empty state.
  - Deep-link restore: `#/deck/<slug>` while logged out → login → lands back
    on the deck; sidebar rows are real `<a href="#/deck/...">` elements.
  - Landing `#/home`, login screen, chat home, deck detail all render; hero
    glow visible; no contrast failures.
- `mimo-v2.5` vision checks: landing/chat-home/deck "good" after fixes. The
  two real defects it caught — the FirstRunHint toast overlapping the chat
  hero heading, and `justify-center` clipping the greeting heading — are
  fixed and re-verified.

## Seams and leftovers

- `schema/report.schema.json` carries an unrelated reformat diff in the
  working tree from a prior session — left untouched as before.
- The untracked `decks/*` dirs are prior fixtures — keep, delete freely. The
  `urban-rooftop-solar…` deck is the synthesis-mode specimen; it is also the
  ownerless deck used in verification.
- `config/users.json` now contains a seeded admin (`operator@forge.local`,
  password `operator-pass-1`) plus test accounts from verification — the file
  is gitignored. The operator account is the one that sees ownerless decks;
  keep or rotate the password as you like.
- No roadmap item existed for the shell redesign; two new entries were added
  under section 7 ("Per-user deck isolation" and "Shell redesign"), each with
  a **Learned** block, and ARCHITECTURE's web-shell + auth-gate sections were
  updated. **Look-ahead note:** the critique's remaining items (context menus
  F15, `/` focuses deck search, smooth-scroll landing anchors, styled tooltip
  rollout beyond the deck grid, F14 mode-semantics tooltip on the LOCAL/CLOUD
  pill, F13 lightbox scrim polish) are still unbuilt and would consume the
  new `Tooltip` and the overlay/scrim tokens.

## End-of-session state

- Servers running: API `http://localhost:5174`, web `http://localhost:5173`,
  SearXNG `:8888`, Ollama `:11434`. The API was restarted once mid-session
  (after the leak fix landed) — it is running the current `main`.
- All commits pushed to `origin/main` (last: `30d7092` "Trim the landing hero
  padding…"). Seven commits this session, one logical change each.
- The `@fontsource-variable/inter` + `@fontsource/ibm-plex-mono` deps were
  added to `package.json`/`package-lock.json` (self-hosted, no CDN).
- Roadmap + ARCHITECTURE updated to match; HANDOFF is this file.
