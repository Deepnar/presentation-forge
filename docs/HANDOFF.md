# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`, which will save you hours. Then
the sections below. This file is overwritten at the end of every session; git
history preserves older handoffs.

## Session summary

State at handoff: **committed and pushed to `origin/main`.** The four
plate-dependent themes are built, each verified visually through the full
pipeline, and the roadmap item is ticked. The theme gallery now has five
themes: warm-humanist (native) + glassmorphism, aurora-mesh, claymorphism,
neumorphism (all plated).

**The four themes.** Each is `themes/<slug>.yaml` with the full tokens/voice
split, explicit `surfaces.title` and `surfaces.section`, and
`tokens.plate.enabled: true` + `plate.html` (+ per-surface variants) that
interpolates the theme's own tokens — no hardcoded hex in any template:

- **glassmorphism** — light slate mesh, three real blurred blobs, a frosted
  content-zone panel (`backdrop-filter: blur`); native cards translucent white
  (`shape.card_fill` transparency 42) as a second glass layer; dark hero with
  violet/teal glows.
- **aurora-mesh** — multi-stop radial mesh from accent/alt/ink/surface, soft
  white halo behind the content; dark indigo hero with pink/violet glows.
- **claymorphism** — warm cream, a rounded translucent clay board (inset top
  highlight + bottom shade + soft outer shadow) behind the content, clay cards
  at radius 0.55in; dark umber hero.
- **neumorphism** — neutral gray, one embossed content-zone field whose dual
  shadows (light top-left from `surface`, dark bottom-right from `ink`) are a
  real CSS box-shadow; native cards near-invisible (transparency 88) so the
  field's shadows are the surface.

**Renderer affordances added (one shared groundwork commit).** `card()` honours
`shape.card_fill` with a `transparency`, so plated themes can frost or vanish
their native panels. Plate templates receive `{{box.*}}` — the content region in
CSS px — so a template can panel exactly the native content area.

**Two real bugs found and fixed during verification.**
1. `content()` returns `bottom`+`y`, not `h`, so `{{box.h}}` interpolated to
   `NaN` and every content-zone panel (frost/board/field/halo) rendered
   invisible while the mesh still looked right. `boxPx` now derives `h =
   bottom - y`. (The first glass/clay/aurora vision passes passed *despite*
   their central panel being missing.)
2. A relative `cacheDir` produced a malformed `file://.plate-cache/…` URL (the
   directory became the URL host) and Chrome screenshotted a blank dark page.
   `renderPlate` now resolves the cache dir absolutely. This only bit
   diagnostics that passed a relative dir; the pipeline's default is absolute.

Also fixed while verifying: flow-ltr step titles and bodies were never
fit-scaled and wrapped/clipped at six steps (the same unfitted-text trap as the
cards/compare titles). Titles now shrink by measured width with a pessimistic
safety factor (fitScale's height logic lets a word break mid-word), bodies are
fit-scaled to their box. This is a layout fix, not a theme fix, and benefits
every theme.

**Verified per theme** by rendering `decks/raytracing-ai` through
Chrome → pptx → LibreOffice → PNG and vision-checking with `mimo-v2.5`: frosted
panels + blur (glass), the multi-stop mesh (aurora), the clay board with inset
highlight (clay), and the embossed field with visible dual shadows (neumorphism)
all render with native text readable on every slide. The neumorphic dual
shadows initially read flat — ink_muted was too close to the page gray and the
offsets too small for a ~1146px field; using `ink` for the dark shadow and
40px/72px offsets fixed it, confirmed by pixel-sampling the plate PNG.

`npm test` 21/21 (8 chat + 6 slides + 7 plate).

**Honest limitation:** the four themes are verified on `warm-humanist`'s grid
and `decks/raytracing-ai`'s slide mix only. Dark mode (`mode: dark`) reuses the
same token-interpolated templates, so plates adapt by construction, but dark
renders were not visually inspected. The 6-step LTR flow slide fits only
because titles/bodies are now aggressively shrunk (small but contained) — a
deck with more than six steps or very long step bodies will still exceed the
flow layout's capacity; that is a layout-engine concern, not a theme one.

## Context to read before starting

- `AGENTS.md` — the three-layer rule is the thing that must not be violated.
- `docs/TRAPS.md` — fit traps, vision-model trust, and "chrome colour derives
  from the painted background".
- `themes/{glassmorphism,aurora-mesh,claymorphism,neumorphism}.yaml` — the
  plate-theme contract references.
- `src/plate.js` — `boxPx`, the `enabled` switch, the absolute cache-dir
  resolve.
- `src/layouts.js` — `card()` `card_fill`, the flow width-based title shrink.
- `docs/ROADMAP.md` §3 "Plate-dependent themes (4)" (ticked, with Learned) and
  "HTML plate renderer" (ticked).

## NEXT TASK — freeform slides, then the 15 native themes

The plate seam is proven and four themes ride it. Next in priority order:

1. **Freeform slides** — add the `html` schema field + model prompt + UI. The
   renderer already handles a slide-level `html` override (wins over the theme)
   and the primitive is done; freeform is schema + generation + UI only.
2. **15 native themes** — mostly YAML; render each before ticking it. The plate
   themes are the reference for the plated contract; native themes follow the
   warm-humanist contract.
3. **Report renderer + shared research.**

**Look-ahead already recorded:** `slide.html` wins over `tokens.plate`, so
freeform needs no primitive or renderer rework. Plate cache is keyed with a
`plate-v1` version tag (bump to invalidate all cached plates).

## Remaining known items

Full list with rationale in `docs/ROADMAP.md`. In rough priority order:

- **Freeform slides** — per-slide and whole-deck, on the plate primitive.
- **15 native themes** — render each before ticking it.
- **Report renderer** — donor-`.docx`, fixed section order, no themes.
- **Shared research** — one brief feeding both deck and report.
- **Flow layout capacity** — six-step LTR cards are over-capacity for verbose
  bodies; the fit-shrink contains them but a real fix is a layout question.

## Gotchas

Full list in `docs/TRAPS.md`. The ones most likely to bite immediately:

- **A written `.pptx` proves nothing.** Rasterise and look. For plates, the
  PNGs ARE the proof — vision-check them, and pixel-sample the plate when a
  subtle effect (dual shadows) may be invisible at preview resolution.
- **`content()` has no `h`.** Derive `h = bottom - y` before templating; a
  `NaN` in `{{box.h}}` silently kills the whole panel.
- **A relative cacheDir breaks the file:// URL.** Always resolve plate cache
  dirs absolutely.
- **fitScale's height budget allows multi-line wraps.** For "one line" use a
  width-based scale, not a height probe.
- **Render + preview into a shared `out/preview/` overwrites the last theme.**
  Verify one theme at a time, or you will be judging the wrong theme's slides.
- **Vision QA:** prefer `opencode-go/mimo-v2.5` or `gemma4:26b-a4b-it-q4_K_M`.
- **Chrome colour/legibility must derive from what is painted.** On plate slides
  the chrome falls back to `surfaces[surface].bg`.
- **No browser tool in this CLI.** UI claims must be structural unless a real
  screenshot was inspected; backend rendering is verifiable via PNGs.
- **API binds `FORGE_API_PORT` (5174), never `PORT`.**
- **Only five themes exist now.** The gallery still has gaps (native themes
  pending); a theme switcher showing empty entries is expected, not broken.
- **SearXNG must be running** for research (`npm run searxng`).
