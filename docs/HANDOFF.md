# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`, which will save you hours. Then
the sections below. This file is overwritten at the end of every session; git
history preserves older handoffs.

## Session summary

State at handoff: **committed and pushed to `origin/main`.** All fifteen
native-renderable themes are built, each rendered and vision-checked, and the
roadmap item is ticked. The gallery is at the 20-theme target.

**The fifteen themes** (`themes/*.yaml`, all `tokens.plate.enabled: false` —
pure pptxgenjs shapes, so text stays editable in PowerPoint):

- **swiss-international** — Inter, black/white, one international-red accent,
  zero radius and no shadow; sharp grid typography.
- **editorial-magazine** — Playfair Display serif headlines on warm paper,
  deep-red accent, wide-tracked eyebrows.
- **minimal-muji** — greige paper, muted muji-red, Manrope, extra margins.
- **neubrutalism** — cream, thick black borders, hard offset shadows (blur 0,
  opacity 100), Archivo Black / Space Grotesk.
- **bauhaus** — primary red/yellow on cream, Poppins, angular.
- **memphis-postmodern** — teal and magenta on cream, rounded Outfit.
- **art-deco** — Bodoni Moda on ivory, gold accent, black/gold title.
- **dark-neon** — near-black, cyan/magenta neon, glow via a soft accent-colour
  outer shadow (native — no plate needed).
- **linear-dark** — near-black product UI, hairline borders, violet accent.
- **material-you** — tonal surfaces (surface darker than page), soft violet,
  very large radii.
- **flat-2** — bold indigo on white, no shadows.
- **retro-terminal** — green-on-black full IBM Plex Mono, amber/red highlights,
  green terminal-window borders.
- **newsprint** — Source Serif 4 on paper, newsprint red, hairline card rules.
- **notion-clean** — white, Notion ink gray, one blue accent, thin borders.
- **corporate-alegria** — bright blue/orange on white, chunky IBM Plex Sans.

**Supporting changes.**
- `src/fit.js`: added the new gallery's wide sans families (Manrope, Poppins,
  Outfit, Space Grotesk, DM Sans, IBM Plex Sans) at ~8% wider advance — without
  it, a one-line card title in those families wrapped into its kicker. Locked
  by `test/fit.test.js`.
- `test/themes.test.js`: a permanent theme-contract guard — loads every theme,
  asserts palette/surfaces(title+section explicit)/type/grid/shape keys,
  `plate.enabled` is a boolean, and machine-checks that `voice` contains no hex
  or font/geometry vocabulary (the three-layer rule as a test).
- `tools/compare.mjs` used as the one-pass structural check: all 20 themes ×
  3 styles rendered with zero error cells.

**What the vision checks found and what was fixed** (each theme rendered on
`decks/raytracing-ai`, rasterised, checked with mimo-v2.5; dark-neon also
spot-checked on the mechanical-keyboards deck):
- muji: a card title ("Memory Hierarchy") wrapped into its kicker — the
  fitter's Manrope estimate; fixed in `src/fit.js`.
- memphis: the teal section divider's footer/crest had low contrast (teal
  luminance 0.52, just above the chrome's 0.45 dark-text threshold) — accent
  darkened to #008A8A.
- retro-terminal: the section standfirst was green-on-green — brighter muted;
  verbose flow bodies at six steps still truncate (the known LTR capacity
  limit, amplified by mono).
- All other themes passed clean on title/section/compare/cards/stats.

`npm test` 32/32 (8 chat + 6 slides + 7 plate + 4 fit + 4 freeform + 3 themes
contract + …).

**Honest limitations.** Dark-mode renders and the `airy`/`compact` style
variants were not vision-checked individually (the compare sheet confirms they
render without errors). The flow-ltr 6-step body clip persists on several
themes (retro-terminal worst) — a layout-capacity concern for a future pass,
not a theme defect. The crest's faintness on mid-tone surfaces is the
placeholder brand asset's own low opacity, not a theme bug.

## Context to read before starting

- `AGENTS.md` — the three-layer rule is the thing that must not be violated.
- `docs/TRAPS.md` — fit traps, vision-model trust, "chrome colour derives from
  the painted background".
- `themes/*.yaml` — the 20-theme gallery; warm-humanist is the native
  contract reference, the plate themes the plated contract.
- `src/fit.js` — the family/advance table the native themes depend on.
- `test/themes.test.js` — the theme-contract guard.
- `docs/ROADMAP.md` §3 "Native-renderable themes (15)" (ticked, with Learned).

## NEXT TASK — reports, then shared research

The deck pipeline and the full theme gallery are done. Next in priority order:

1. **Report renderer** — donor-`.docx`, fixed section order, no themes. A
   different review surface from the deck grid. The donor `.docx` lives in
   gitignored `reference/`; the renderer must fail clearly when absent.
2. **Shared research** — one brief feeding both deck and report.
3. **Flow layout capacity** — six-step LTR cards are over-capacity for verbose
   bodies; the fit-shrink contains them, a real fix is a layout question.

**Look-ahead already recorded:** the plate seam (`slide.html` override +
`tokens.plate`), the freeform type, and the chrome-luminance sampling are all
in place. Report rendering is deliberately NOT themed — it matches a template.

## Remaining known items

Full list with rationale in `docs/ROADMAP.md`. In rough priority order:

- **Report renderer** — donor-`.docx`, fixed section order, no themes.
- **Shared research** — one brief feeding both deck and report.
- **Flow layout capacity** — six-step LTR cards over-capacity for verbose
  bodies.
- **Dark-mode / style-variant visual checks** — render+look at each theme in
  `dark` mode and under `airy`/`compact` styles.

## Gotchas

Full list in `docs/TRAPS.md`. The ones most likely to bite immediately:

- **The fitter's family table is a theme dependency.** A new font family not
  in `FAMILY_CLASS`/`WIDE_SANS` estimates at Inter width and its one-line
  titles wrap. Add the family when you add the theme.
- **Chrome contrast is a luminance knife edge.** `luminance(bg) < 0.45` decides
  the crest/footer variant; a mid-tone accent near the boundary (teal, gold)
  produces gray-on-colour footer text. Darken the accent or brighten the muted.
- **A written `.pptx` proves nothing.** Rasterise and look; vision-check each
  theme on title/section/compare/cards/stats at minimum.
- **Render + preview overwrites the shared `out/preview/`.** Verify one theme
  at a time.
- **`toBuffer()` returns a Buffer.** Destructuring `{ data }` off it yields
  undefined and a swallowed try/catch.
- **Vision QA:** prefer `opencode-go/mimo-v2.5` or `gemma4:26b-a4b-it-q4_K_M`.
- **No browser tool in this CLI.** UI claims must be structural unless a real
  screenshot was inspected.
- **API binds `FORGE_API_PORT` (5174), never `PORT`.**
- **SearXNG must be running** for research (`npm run searxng`).
