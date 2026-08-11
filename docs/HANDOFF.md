# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`, which will save you hours. Then
the sections below. This file is overwritten at the end of every session; git
history preserves older handoffs.

## Session summary

State at handoff: **committed and pushed to `origin/main`.** The HTML plate
renderer is built, verified visually through the whole pipeline, and ticked on
the roadmap.

**The primitive (`src/plate.js`).** `renderPlate(html, { w, h, scale })` wraps
the HTML in a CSP-sandboxed document and screenshots it with system
`google-chrome-stable` (`--headless=new`, `--window-size`, `--force-device-
scale-factor`, `--virtual-time-budget`) — zero npm browser dependency, one
restart retry on a crashed tab. Output: a PNG cached in `.plate-cache/` (now
gitignored) under sha256 of `(version + w×h@scale + html)`, so a changed
document gets a fresh plate and unchanged ones are free. The CSP
(`default-src 'none'`, inline styles + local data:/file: images/fonts) makes
scripts and every network scheme unrepresentable — verified by a test script
that failed to paint the page red.

**Theme plates.** `loadTheme` now exposes the merged `tokens` (with the
mode-adjusted palette), so a theme declares
`tokens.plate.enabled: true` + `plate.html` (optional
`plate.surfaces.title/section/content`) referencing its own tokens as
`{{tokens.palette.bg}}`. `warm-humanist.yaml` already had the `plate.enabled:
false` groundwork from an earlier session; its comment was updated to the real
contract. `enabled: false` is the default and every existing deck renders
bit-identical.

**The seam for freeform.** A slide-level `html` field is checked first and
overrides the theme — this is the freeform seam, already wired in render.js.
The freeform feature (schema field, model prompt, whole-deck mode) is the next
task; the primitive needs no rework.

**render.js integration.** The plate is set as the true slide background
(`slide.background = { data }`) AFTER the layout paints — pptxgenjs's
background setter replaces wholesale, so last-write-wins puts the plate under
every shape. Chrome legibility on plate slides falls back to
`surfaces[surface].bg` because the flat palette no longer describes the
painted background. `render()` gained an optional `signal` threaded to the
plate render so aborted requests stop launching Chrome.

**Tests.** `npm test` 20/20 (8 chat + 6 slides + 6 plate), including a
guarded headless-Chrome render test (skipped if the binary is absent).

**Verified visually (the whole point — plates are backend, so PNGs are the
proof).** A fixture deck (removed after) ran through Chrome → pptx →
LibreOffice → PNG and was vision-checked (`mimo-v2.5`): slide 1 multi-stop
mesh gradient, slide 2 glassmorphism card with real `backdrop-filter: blur`
over two layered translucent blobs (native bullets readable), slide 3 neon
glow on near-black (native cards readable), slide 4 aurora gradient — all
`platePresent: true`, text readable, no defects except one fixture artifact
(the stat value "1920×1080" is too wide for the native stats value box — a
pre-existing layout fitter limit, not a plate bug). The theme-interpolation
path was verified separately with a scratch `_scratch-plate` theme: the
interpolated radial+linear gradient rendered with the theme's accent/bg/ink
colours and readable title. Both fixtures deleted.

**Structurally:** `vite build` untouched this session (no UI change). The API
render endpoint is unchanged and calls the same `render()`, so plates work
through the server transport without new code.

## Context to read before starting

- `AGENTS.md` — the three-layer rule is the thing that must not be violated.
- `docs/TRAPS.md` — "chrome colour derives from the painted background" is the
  trap the plate chrome-bg fallback exists for.
- `src/plate.js` — the primitive (cache key, CSP wrapper, `plateHtmlFor`,
  `renderSlidePlate`).
- `src/theme.js` — the `tokens` exposure + `plate` switch.
- `src/render.js` — the plate-after-layout integration and chrome `bg` fallback.
- `docs/ROADMAP.md` §3 "HTML plate renderer" (ticked, with Learned) and the
  now-unblocked "Plate-dependent themes (4)" + "Freeform slides" entries.
- `themes/warm-humanist.yaml` — the `tokens.plate.enabled: false` contract
  reference.

## NEXT TASK — the four plate themes, then freeform

The plate primitive is proven; the next slice is its primary consumer:

1. **Plate-dependent themes (4):** `glassmorphism` · `claymorphism` ·
   `neumorphism` · `aurora-mesh`. Each declares `tokens.plate.enabled: true` +
   `plate.html` (+ per-surface variants) interpolating its own tokens. Render
   each before ticking it — the whole point is that blur/transparency/mesh
   gradients survive the pipeline, which is exactly what the primitive now
   verifies. Re-check chrome legibility (`surfaces.*.bg`) and the section/title
   surface variants.
2. **Freeform slides** — add the `html` schema field + model prompt; the
   renderer seam already handles `slide.html`. Per-slide and whole-deck modes.
3. **15 native themes** — mostly YAML; render each before ticking it.

**Look-ahead already recorded:** the plate seam is `slide.html` override wins,
then theme `tokens.plate`. Freeform is schema + prompt + UI only. The plate
cache (`PLATE_CACHE` in src/plate.js, `FORGE_CHROME` env override) is keyed by
a `plate-v1` version tag — bump it to invalidate every cached plate at once.

## Remaining known items

Full list with rationale in `docs/ROADMAP.md`. In rough priority order:

- **Plate-dependent themes (4)** — unblocked; build on the verified seam.
- **Freeform slides** — per-slide and whole-deck, on the plate primitive.
- **15 native themes** — render each before ticking it.
- **Report renderer** — donor-`.docx`, fixed section order, no themes.
- **Shared research** — one brief feeding both deck and report.

## Gotchas

Full list in `docs/TRAPS.md`. The ones most likely to bite immediately:

- **A written `.pptx` proves nothing.** Rasterise and look (the preview PNGs are
  LibreOffice's own render, so they match what LibreOffice shows). For plates,
  the PNGs ARE the proof — vision-check them.
- **Vision QA:** prefer `opencode-go/mimo-v2.5` or `gemma4:26b-a4b-it-q4_K_M`;
  never trust `qwen3-vl:8b-thinking` for defect-finding (false-clean).
- **Chrome colour/legibility must derive from what is painted, not the palette.**
  On a plate slide the flat palette no longer describes the background — chrome
  falls back to `surfaces[surface].bg`.
- **`slide.background` replaces wholesale in pptxgenjs.** Set the plate AFTER
  the layout or the layout's flat colour wipes it.
- **`pkill -f` with a pattern that appears in the command's own line kills the
  shell.** Kill dev servers by port (`fuser -k 5173/tcp`) or PID instead.
- **No browser tool in this CLI.** UI claims must be structural unless a real
  screenshot was inspected; backend rendering (this task) is verifiable via PNGs.
- **API binds `FORGE_API_PORT` (5174), never `PORT`.** Express needs
  `node --watch`.
- **Never add an unbounded array or a bare `{type:"object"}` to a model-facing
  schema.** Always check `done_reason`. The author role has no vision.
- **Only one theme exists.** Anything assuming a populated gallery looks broken.
- **SearXNG must be running** for research (`npm run searxng`).
