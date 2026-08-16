# Handoff — 2026-08-16, generation-robustness batch complete

The queued handoff (items A, B, C, E1–E4 from the 00:10 addendum) is DONE,
committed, pushed, and behaviourally verified. Git history carries the batch:
`4a74de2` (JSON salvage + cloud repair room), `2fd528b` (resumable generation +
finalize + E1/E2 core), `cfe4086` (layout overlap + sentence-boundary trim +
op-drift tolerance).

## What shipped

- **A — JSON-parse tolerance.** `salvageJSON` (ollama.js) strips every fence,
  tries every plausible brace position, repairs trailing commas, and names its
  attempts in the error. `MAX_REPAIR` is per-transport (cloud 4, local 2).
- **B/C — resumable generation + finalize watchdog.** Generation split into
  `writeDeckContent` (checkpoints deck.yaml per slide, persists the approved
  plan first, `.run.json` marker, meta.status "writing") and `finalizeDeck`
  (grounding + field-length + trim + coherence + render, flips to ready). The
  server keeps runs alive after the socket drops, dedupes reconnects to the
  same run, and exposes `/generate`, `/generate/resume`, `/finalize`,
  `/generate/stop`; the deck GET reports `run:{active,written,total,resumable,
  needsFinalize}`. ChatView auto-reconnects to a live run and offers
  resume/finalize; DeckDetail shows the same banner. CLI: `generate --resume`
  + `finalize`.
- **E1 — empty charts unrepresentable.** Negative data-affinity steering,
  planner coercion of `chart` → `cards` below 2 numeric facts, schema
  `minItems:1` on `values` and `categories`. Cloud planner tests: no-numbers
  brief → zero charts; data-rich → four.
- **E2 — no mid-sentence ellipsis.** The FIELD-LENGTH pass rewrites overfull or
  already-ellipsised fields as complete sentences before the trim; the trim's
  `shortenString` cuts at sentence boundaries only (a mid-sentence "…" is now
  unproducible). Verified on the HPC deck: every "…" became a complete
  sentence.
- **E3 — framework/diagram never hide text.** Framework ring checks
  card/ellipse + card/card clearance and falls back to a grid; diagram sizes
  nodes from layer spacing, auto-routes thin chains horizontally, draws edges
  behind nodes, drops bodies when rows are too thin. Slide 6 pixel-verified at
  0.3–0.6in gap (the vision model's repeated "overlap" calls were false
  positives at tight-but-legal spacing); slide 14 no longer overlaps.
- **E4 — thin-type floors.** ~30 TYPE_BUDGETS entries added; the HPC deck's
  flow slide now carries six steps.

## Known limitations (pre-existing, surfaced honestly)

- **The LOCAL author model (`qwen3-coder:30b-a3b-q4_K_M`) is unreliable at
  multi-slide rewrites** (the coherence pass's rewrite, and some sweep
  rewrites): it emits ops missing the `op` field. runTurn now drops the
  never-valid items and reports all-malformed responses through the repair
  loop with a clear diagnostic, but a wholly-malformed coherence rewrite still
  fails — surfaced as a `problems[]` entry, never a silent no-op. The deck
  ships; the drift case (a sweep rewrite that wandered off-topic) is what the
  coherence pass exists to catch and occasionally cannot. On the cloud
  transport the same passes succeed.
- **The HPC deck still carries honest floor flags** on slide 10 (stacked-list,
  dense content in five narrow columns) — "would need <floor>pt". This is the
  fitter's contract (flag, don't shrink), and the content is genuine: the deck
  renders, nothing is hidden or cut mid-sentence. A `sparse`/`balanced` sweep
  on slide 10's material, or shortening its bodies, clears them. Slide 14's
  diagram labels also flag at ~9-10pt on the long mono labels ("Compute-Comm
  Overlap").
- The deck's `decks/recent-trends-in-mixed-mode-programming-for-3/` meta.yaml
  had a temporary `owner: tester@test.local` for API testing — REMOVED, it is
  ownerless (operator-owned) again. It is `ready`, rendered, and slide 16 is a
  cards slide (the empty chart is gone).

## The one rule still enforced

The model never writes layout code. The framework/diagram changes are geometry
in `src/layouts.js`; the content contract in `schema/deck.schema.json` gained
only a `minItems` (a machine rule, not a coordinate). `themes/*.yaml` untouched.

## Servers

- `forge_searxng` running in docker (the D note from last night stands: restart
  via `docker restart forge_searxng`, never `--force-recreate`).
- API on :5174 (dev) — I ran a throwaway on :5199 for CDP-ish verification and
  left it; kill it before the next `npm run dev`. Ollama running.

## Next session's carry-forward

The queued items are exhausted. Remaining open threads: the coherence-pass
flakiness on the local model (tracked above), and the roadmap's stretch items
(F13 image search, canvas builder). If you want the HPC deck presentation-clean
now, run `forge generate recent-trends-in-mixed-mode-programming-for-3 --resume`-style
finalize (already done) or a `sparse` sweep on slide 10's section, then re-render.

Model discipline: flash codes ONLY, mimo vision ONLY, no qwen. All specs durable
in ~/.hermes/scripts/prompts/.

## F. Settings vs Profile split + theme thumbnail sizing (user, 2026-08-16, NO CHANGES YET — user testing)

### F1. Profile and Settings open the SAME modal — must be separate
User: "both the settings and the profile open the same shit — it shouldn't. The profile is about personal only, and the settings about other stuff and making those presets."
- Verified: App.jsx:363 (header avatar) and App.jsx:391 (sidebar ProfileChip) BOTH call `setSettingsOpen(true)` → the same SettingsModal. The sidebar also has a separate "Settings" row (Sidebar.jsx:217) doing the same. THREE entry points, ONE identical modal.
- Fix: split into two surfaces —
  - **Profile** (avatar chip, header avatar): personal only — avatar, name, email, Log out (with confirm). Nothing else.
  - **Settings** (sidebar "Settings" row; the header's settings icon): everything else — Saved formats (presets CRUD), Identity (institution + guide, inline), Cloud (status/key/routing).
  - Decide which the header avatar opens (profile) vs the sidebar row (settings); keep the LOCAL/CLOUD toggle where it is.

### F2. Theme thumbnail sizes "all over the place" — new-chat gallery + Home/tour page
User: "the theme thumbnail sizes are still all over the place in the new chat as well as that tour home page — it's all over the place, what is it even doing."
- Verified root cause: ThemeMiniCard.jsx renders a fixed `aspect-[16/8]` band + `aspect-[16/5]` strip, but PLATE themes overlay `theme.thumb` (a rasterised PNG from `npm run gallery`) with `object-cover` (line 60-68). The thumbnails were generated at inconsistent pixel sizes/aspect ratios, so object-cover crops/zooms them differently per theme; non-plate themes show the flat token synthesis — cards look photo-like (plates) next to flat token art, and the size/zoom differs across the gallery, the Home/tour page, and the new-chat picker.
- Fix: regenerate ALL theme thumbs at ONE fixed size (e.g. 640×360) from ONE neutral specimen (see deck-quality-round4.md item 13), and/or stop overlaying thumbs on the mini card entirely (pure token synthesis everywhere = uniform); if thumbs stay, generate them at the exact band aspect so object-cover is a no-op.
- Apply consistently to: new-chat ThemeCard gallery (ChatView.jsx), Home/tour page (Home.jsx:232), Themes page (Themes.jsx), briefing gallery.
