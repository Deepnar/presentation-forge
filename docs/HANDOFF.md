# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`, which will save you hours. Then
the sections below. This file is overwritten at the end of every session; git
history preserves older handoffs.

## Session summary

**Frontend polish pass: the four queued UI bugs fixed, a reactive particle
background and a depth pass added, and an OpenCode Go cloud backend with a
Settings/Cloud key surface shipped. All committed and pushed to `origin/main`.**
Renderer, themes, schema and deck content are untouched — the headless pipeline
still works (`npm test` 65/65, `vite build` clean).

### What changed

**Part A — the four queued bugs (`/tmp/opencode/UI_BUGS.md`):**

1. **Submit arrow anchored inside the prompt box.** The real cause was the
   model picker sizing itself to its longest option — a 63-char pulled model
   name (`hf.co/bartowski/Mistral-Small-…GGUF:Q5_K_M`) — which pushed the whole
   right-hand cluster past the box's right edge so the circular arrow hung half
   outside it. Capped the picker width (`max-w-[14rem]` in the prompt, same for
   the report picker) and gave the box a `surface-well` treatment so it reads as
   one defined surface. The arrow now sits fully inside the toolbar row.
2. **Single chat surface.** Verified in HEAD: `App.jsx` already renders exactly
   one surface via a ternary (panel when open, edge strip when closed). The
   "two chatting things" was a stale review; no code change was needed, and the
   open/closed states were both screenshot-verified.
3. **Word overlap / truncation.** The one real overlap: a sidebar fallback
   tile's theme label (`WARM-HUMANIST`) spilled past its 36px edge into the
   row's meta text. Fallback tiles now clip at the tile (`overflow: hidden` +
   width-constrained inner), the home carousel meta line truncates, deck titles
   and chat bubbles wrap (`break-words` / `overflow-wrap:anywhere`).
4. **Identity covered by the "create deck" UI.** The Identity view's save bar
   was `position: fixed; inset-x-0`, a full-width bar that sat on top of the
   sidebar's bottom "New deck" button and Themes/Identity rows. Now `sticky
   bottom-0` inside the scroll column, so it belongs to the form and never
   overlaps chrome.

**Part B — rich, not dull, without new colours.**

- **`ParticleField.jsx`** — an ambient dot field behind the whole shell. Capped
  dot count by area, slow sine drift, gentle repulsion + parallax around the
  pointer. Behaviourally verified (instrumented, not just screenshots): the
  loop runs ~60fps, up to 7 dots respond to the cursor, reduced-motion draws
  exactly one static frame, and the loop pauses on tab-hidden, window-blur and
  rail-hover. Two traps worth remembering: `inset-0` does NOT stretch a canvas
  (replaced element — it stays 300×150; you need an explicit `h-full w-full`),
  and `/models`-style public endpoints can't validate keys.
- **Depth pass** — panel/surface gradients + 1px inset highlights that catch
  light, card lift on hover with a press-settle, a soft accent focus halo on
  inputs, primary-button inner highlight, a light-catching header edge, and
  designed empty states (icon in a ring). All white-on-black light and the
  existing tokens; no new palette entries.

**Part C — OpenCode Go cloud backend.**

- `config/models.yaml` gains an opt-in `opencode-go` provider (openai-
  compatible, `https://opencode.ai/zen/go/v1`, key `env:OPENCODE_GO_API_KEY`)
  with `models: [deepseek-v4-flash, qwen3.8-max, mimo-v2.5]`.
- **`src/cloud.js`** — the secret store. Keys resolve env-first then from
  gitignored `config/local.yaml` (the file the Settings panel writes). No code
  path returns a key value.
- **Routing** — a `model` override naming a provider's listed model routes that
  request to the provider (this is how picking `deepseek-v4-flash` sends work
  to OpenCode Go). `/api/models` now forwards a `cloud` group, shown as an
  optgroup in the prompt, chat and report pickers only when a key is present.
- **Server** — `GET /api/cloud`, `PUT/DELETE /api/cloud/key`, and
  `POST /api/cloud/test`. The test is an *authenticated probe*: a one-token
  chat call against the provider's first listed model. `/models` is public on
  OpenCode Go and proved nothing — a dummy key now fails with the provider's
  401, the real key reports the authenticated model.
- **Settings/Cloud panel** — the bottom section of the Identity view: what the
  key is for, provider/baseURL/models, save / remove / test, honest status.

### Verification (all behavioural, on the live dev servers)

- `npm test` 65/65; `vite build` clean; the running API + Vite at :5174/:5173.
- **Bug fixes** screenshot-verified with the mimo-v2.5 subagent: arrow inside
  the box, one chat surface in both states, no sidebar tile spill, save bar
  clear of the sidebar nav.
- **Particle field** instrumented via CDP (frame counter, pointer stamp,
  pushed-dot count, reduced-motion static frame, blur/focus and rail-hover
  pauses) — all hold.
- **Richness** — mimo confirmed the layered surfaces, and no text overlaps on
  home / themes / deck detail / identity.
- **Cloud** — the real key was saved through the actual UI path (PUT → wrote
  `config/local.yaml`), `/api/cloud` reports it without ever returning it, and
  `POST /api/cloud/test` connected live: *"connected — deepseek-v4-flash
  authenticated"*. A dummy key flow was exercised end-to-end in the UI (typed,
  saved, "key attached", 401 on test) and the real key was then restored. A
  live model call through the pipeline with `model: deepseek-v4-flash` returned
  "cloud ok" (done_reason stop). Per the discipline, no other cloud model was
  ever invoked — mimo-v2.5 was used for vision checks only, and the cloud
  models were listed but never called.

### Known open work (unchanged from last session)

- **Deck writer image grounding** — the model emits image filenames for
  `image`/`image-text`/`compare` slides without writing the files. Still open.
- **Report UI** — generate/render/download surface exists; no section-reader
  for the `.docx` content yet.
- **Flow layout capacity** — six-step ttb cards still collide with the footer.
- **Dark-mode / style-variant visual checks** for the renderer.

### Gotchas

Full list in `docs/TRAPS.md`. Ones that bit this session:

- **A `<canvas>` is a replaced element: `inset-0` leaves it at its intrinsic
  300×150.** Stretch it explicitly (`h-full w-full`) or the particle field only
  ever painted in the top-left corner — invisible everywhere else, and the
  "fix" looked like it did nothing.
- **`GET /models` on OpenCode Go is unauthenticated** — it returns the model
  list for any key (or none). Any "connection test" built on it is a false
  positive. The honest test is an authenticated one-token chat probe.
- **React's `onMouseEnter` is mouseover-delegated.** Dispatching a synthetic
  `mouseenter` to test rail-hover pause does nothing; move the real pointer via
  CDP `Input.dispatchMouseEvent` instead.
- **`node --watch` silently keeps stale module state.** The `/api/models`
  route dropped the new `cloud` field for two restarts because the running
  process still served the old handler — when an endpoint "works but the field
  is missing", restart the API before debugging the data.
- **`b.native click` vs CDP pointer events:** `el.click()` in an eval navigated
  the app; a real mouse click at the same coordinates did not (offset). When in
  doubt, drive React with `el.click()` and read state via eval polls.

## Context to read before starting

- `docs/ARCHITECTURE.md` §"The web shell" and §"The cloud surface — opt-in
  hosted models" describe the shell's new subsystems.
- `docs/ROADMAP.md` — still fully ticked; nothing new was opened this session
  (all four bugs and both features were fix/shine work on shipped items).
- `config/models.yaml` — the `opencode-go` provider block and its `models:` list.
- `src/cloud.js` — the secret store and the authenticated probe.
- `app/web/src/components/ParticleField.jsx` — the ambient background.

## End-of-session state

- `config/local.yaml` (gitignored) currently holds the real OpenCode Go key,
  saved via the Settings panel — the app works with the subscription out of the
  box on this machine. Remove it (Settings → Cloud → Remove) to hand the repo
  back to a machine without the subscription.
