# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`, which will save you hours. Then
the sections below. This file is overwritten at the end of every session; git
history preserves older handoffs.

## Session summary

**The shell follow-up tranche shipped: a config popover replaced the prompt
box's inline presets, local single-install accounts gate the Cloud-key section,
the LOCAL/CLOUD toggle now actually filters every model picker, the sidebar's
Reports tab opens a full-document report viewer, and the chat rail's stacking
context is hardened so it can never escape to the top-left. All committed and
pushed to `origin/main`.** `npm test` 94/94, `vite build` clean, every item
verified live over CDP (popover, auth round-trip, toggle filtering, report
viewer, rail bounding boxes) and visually with `mimo-v2.5`. Dev servers are
running at :5174 / :5173.

### What changed

**Config popover.** The audience and slide-count preset pills left the prompt
box; they now live in a popover behind the sliders button, alongside report
mode's source (deck/brief), deck picker and Full/Brief depth. The sliders
button no longer opens the New-deck wizard — the top-right "+ New deck" is the
entry. The prompt surface is now just the brief, the Deck/Report toggle, the
model pill and the submit arrow. Popover closes on outside click and Escape.

**Local auth.** `src/auth.js`: register (name/email/password, min 8), login,
logout, server-side bearer-token sessions. Passwords are `crypto.scrypt` +
per-user salt; the users file holds only salt+hash and the password is never
logged, stored, or returned. The header's account entry is Login/Register or
name + Logout; the Cloud-key section shows a login prompt until a session
exists and its write endpoints 401 without one. Honest scope: single local
install, accounts exist for the key gate and future hosting. Store in
gitignored `config/users.json` + `config/sessions.json`.

**Mode-filtered pickers.** The header toggle previously changed a routing
preference server-side but every picker still showed both model groups. Now a
client store (`lib/modelMode.js`, pub/sub, default LOCAL, rehydrated from the
persisted routing preference) drives `lib/useModels.js`, which all three
pickers (prompt, chat, report) consume. LOCAL → local models only, CLOUD →
cloud models only. CLOUD is unreachable without a key; the disabled button
points at Settings/Cloud.

**Report viewer.** The sidebar's Reports tab opens a full-document view:
cover block (title, subtitle, subject, guide, team from the merged identity),
then every section in the fixed graded order with paragraphs and tables as
prose — never raw YAML. Render .docx / download and the companion-deck door
stay. Reports-tab rows open the document even for decks that also have slides.
The report endpoint now returns the merged identity so the cover matches the
.docx renderer. Empty states on the tab and in the view (404-driven).

**Rail containment.** The content row is `isolate` and the header sits on its
own z-20 layer, so no child panel can paint over the product bar. The
"top-left escape" from the user's screenshot was a transient hot-reload state
— the committed tree measured zero overlap at every viewport (the rail already
said "Chat with the deck") — but the hardening makes the escape class
unrepresentable.

### Verification (all behavioural)

- `npm test` 94/94 (5 new auth tests: validation, scrypt round-trip, email
  uniqueness, session start/resolve/end, bearer parsing); `vite build` clean.
- Rail: CDP bounding boxes on home + deck views at 1440×900 / 800×600 /
  600×800 — header full-width, sidebar full-width, rail right-side below the
  header, zero overlap; mimo verified both views.
- Popover: opens on sliders in both modes, correct contents, closes on outside
  click + Escape, never navigates to the wizard; "+ New deck" still opens it;
  presets reach the submit payload (audience folded into brief, maxSlides
  applied — verified by intercepting the SSE POST).
- Auth: full round-trip through the running API (register → dup reject → wrong
  pw reject → login → me → cloud-key 401 unauthed / 200 authed → logout → me
  401); UI round-trip with real CDP mouse clicks; no plaintext in
  `config/users.json`; both stores gitignored.
- Toggle: LOCAL shows 28 local models, CLOUD shows the cloud trio, in both the
  prompt and chat pickers, round-tripping back to LOCAL.
- Report viewer: Reports tab lists only report decks; clicking opens the
  document with the 8-section fixed order, prose sample, no YAML, and
  Render .docx → download link appears. Empty state shown when no reports.
- Visuals: mimo-v2.5 checked home+popover, header toggle, auth modal, report
  document, deck rail — all clean; the rail shot's apparent thumbnail clipping
  was measured as 49px clearance, a white-mat misread, not an overlap.

### Known open work

- **Fitter units.** `measure()` never multiplies by the em size, so its width
  and line estimates are ~5-8x pessimistic against real inches. Every layout
  works because `fitScale` shrinks defensively. Fixing it would re-type every
  deck — deliberately deferred; see the TRAPS entry. Future layouts must anchor
  to fixed boxes, never compute offsets from raw `heightOf`/`lineCount`.
- **Tier 2-4 types.** The plan's other 44 types follow the same recipe: schema
  conditional block, native layout, SlideEditor descriptor. The family map in
  `src/ai/catalog.js` already covers them.
- **Deck writer image grounding** — the model emits image filenames without
  writing the files (pre-existing open work).
- **Chart expansion** — `scatter`, `radar`, `stacked-bar` in the chart kind
  enum.
- **Cross-cutting `speaker_note` field** (plan Family O).
- **Flow layout capacity** — six-step TTB cards still collide with the footer.
- **Canvas slide-builder (stretch)** — see the roadmap entry.

### Gotchas

Full list in `docs/TRAPS.md`. New this session:

- **The auth test needed a store seam.** `src/auth.js` reads `config/users.json`
  at call time, so `setStoreDir(scratch)` redirects it in tests — keep that
  seam if the store ever moves.
- **Express does not hot-reload cleanly on every edit.** The `node --watch`
  API died once mid-session (log showed "Failed running…"); restart it with
  `npm run api` and confirm `/api/health` before trusting an endpoint. The Vite
  side is unaffected.
- **HTML buttons default to `type=submit`.** My CDP harness matched the wrong
  button (the sidebar toggle) looking for `type="submit"`; in real forms the
  submit button is the one inside `<form>`. Test-selector lesson, not an app
  bug.
- **JS `.click()` is not a user click.** It never fires `mousedown`, so
  outside-click popovers don't close and native form validation may not run.
  Dispatch real `Input.dispatchMouseEvent` for click-path verification.

## Context to read before starting

- `docs/ARCHITECTURE.md` — new "The auth gate — local single-install accounts"
  section; web-shell bullets updated for the popover, report viewer,
  mode-filtered pickers and rail containment.
- `docs/ROADMAP.md` — new ticked item "Shell follow-up — config popover, local
  auth, mode-filtered pickers, report viewer" with its Learned block.
- `src/auth.js` + `test/auth.test.js` — the account/session module and its tests.
- `app/web/src/lib/modelMode.js` + `lib/useModels.js` — the picker-mode store
  and hook; every picker consumes `useModels()` now.
- `app/web/src/views/ReportView.jsx` — the full-document report viewer; the
  report endpoint returns `{ report, identity }`.

## End-of-session state

- Dev servers running: API `http://localhost:5174` (node --watch), UI
  `http://localhost:5173` (Vite). Both were restarted at least once this
  session — if one is down, `npm run api` / `npm run web`.
- `config/local.yaml` holds the OpenCode Go key and `routing.default: local`.
  `config/users.json` / `config/sessions.json` exist and are gitignored —
  empty after this session's verification users were removed.
- Generation tests this session used the cloud model
  (`model: deepseek-v4-flash`) per the user's constraint; local Ollama was not
  used for generation (GPU busy).
