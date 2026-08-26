# Handoff — 2026-08-26, hosting readiness + the glow family (37 local commits, unpushed)

Two pieces of work, both finished. Everything is committed to `main` and
nothing is pushed. `npm test` is 370 passing.

Read `docs/ROADMAP.md` §10 first — it is the standing quality list and it is
current as of this session.

## Part one: safe to put in front of strangers

The project was audited for public hosting. `docs/DEPLOY.md` is the result: it
needs a long-running container with roughly 2 GB of memory, a writable disk and
the ability to run LibreOffice and Chromium, which rules out every serverless
platform regardless of how the front end is written.

The account system had been built to gate one operator's cloud key and was
still single-tenant in several places. Now per account: identity, brand marks,
BYOK keys and the Auto/Cloud route. Admin is a role, granted at boot from
`FORGE_ADMIN_EMAIL` or by an existing admin — never derived from an address,
because registration does not verify email. Media routes authenticate by
session cookie rather than being exempt.

Two faults were invisible rather than loud, and both had been in place a while:

- **BYOK keys were stored encrypted and never read.** The model client resolved
  `env:NAME` against the install-wide config, so every "bring your own key"
  generation silently billed the operator.
- **The container shipped without the theme typefaces.** A `.pptx` hides this
  completely — OOXML stores font names, so the downloaded file is correct on a
  machine that has them. Only the server's own renders were wrong, which is
  everything the user actually looks at in the app.

The account reaches the model client through `src/account.js`
(`AsyncLocalStorage`), not through parameters — `chat()` sits five calls below
the HTTP layer and the CLI must keep working with no account at all.

## Part two: the glow family

Eight themes rebuilt: `glassmorphism`, `soft-glass-light`, `aurora-mesh`,
`gradient-mesh-dark`, `sunset`, `claymorphism`, `neumorphism`, `isometric-dark`.
Plus the chart palette, the crest, and panel geometry across every plate theme.

Two bugs here broke real decks:

- **`isometric-dark`'s title slide rasterised pure white** under near-white ink
  — 1.2:1. Its plate drew grid lines onto transparency and the vignette only
  darkened the edges, so the middle was never painted. Content slides happened
  to have a panel covering the hole; the title did not.
- **`high-contrast-mono` charts drew three identical black series and one white
  one that vanished.** Series colours came from `ink_muted` and `rule`, which
  are secondary text and a hairline.

`src/chartpalette.js` is new and owns categorical chart colour; a contract test
holds every theme in both modes. `{{panel.*}}` in `src/plate.js` owns where a
plate's panel sits relative to the content box, so themes stop repeating
`calc()` arithmetic.

## How to work on themes

`npm run themeaudit -- --themes <a,b> --types title,section,bullets` renders
contact sheets into `.themeaudit/`. Use it. Every defect above was found by
rendering and looking; none was caught by a test.

Measure contrast on the rendered pixels rather than judging it. `sunset` looked
good and put its title at 2.2:1. Sample beside the text, not through it — glyphs
are the brightest thing in the crop and will flatter the reading.

After changing a theme: render all 75 types (`render({ write: false })` and
check `problems`), then `npm run gallery --themes <name>` — the gallery
thumbnails are committed and go stale otherwise.

## Constraints that shaped the work

**Generation is untested.** It must run against the shared gateway only, with
the key in `.env` (loaded automatically now). The local Ollama install and its
GPU are committed to other work and must not be touched. Everything in §10
marked *needs a model* is blocked on that, by the owner's decision, to be done
in one pass rather than piecemeal.

**`config/models.yaml` names six models, none installed** on this machine. Role
resolution falls through silently — §9 already identified that as the cause of
a thin outline once.

## What is next

`docs/ROADMAP.md` §10, in priority order:

1. **Theme variation** — the largest remaining theme item. The eight plate
   themes now differ in what their background *is*; the thirty native ones are
   still one layout in thirty colourways, so a theme can only differ by palette
   and typeface. Needs per-theme layout flags, not more styling.
2. **The front end and landing page** — standing dissatisfaction, no model
   needed.
3. **Reports** — structure, and the two-LibreOffice-pass render, which can be
   profiled today.
4. **`flow`'s vertical spine** — fits its step bodies within about 0.02 in of
   the readable floor. `chalkboard` is already over the line. Re-budget before
   the type sweep, or the sweep reports it 38 times.

## Known and deliberate

- The callout bar inverts to light on dark themes. Checked across
  `isometric-dark` and `chalkboard` — consistent, intentional, loud on
  `gradient-mesh-dark`. Not changed without a decision.
- `config/identity.yaml` on the dev machine reads `institution.name: HACKED`.
  Identity is per account now; set a real one in Settings.
- The dev account store holds well over a hundred throwaway test accounts. That
  database must not travel to production.
