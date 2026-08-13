# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`. Then the sections below. This
file is overwritten at the end of every session; git history preserves older
handoffs.

## Session summary

**The big sweep — the full wish list, shipped in priority order.** All 13
items from the user's "write it all down" request are implemented, verified
and pushed. The deck-detail chat rail is gone, replaced by explicit controls
(theme + a new Density Re-sweep); the briefing gained presets, a branding
question and report-mode questions; research got a full view plus a genuinely
upgraded engine (multi-angle queries, diversity and examiner-gap follow-ups,
arXiv/Crossref papers, Jina Reader opt-in); reports preview as real Word
pages; every slide card has a type-swap gallery of all 75 types rendered in
the current theme; images upload and attach without the model, and invented
image URLs are sanitised into `[image]` notes; the app is deployable on a
home Linux server (Dockerfile + compose, monthly sweep + mail, light
hardening); six new distinct themes landed and two sibling pairs were
unduplicated; the report title is now bold and centred. `npm test` 190/190,
`vite build` clean, CDP checks pass for every feature, generation and paper
search verified with the cloud model, theme renders verified with
`mimo-v2.5`. All commits pushed to `origin/main`.

## What shipped

See `docs/ROADMAP.md` → "The big sweep" item for the full list with a
11-point **Learned** block. In brief:

- **Chat rail removed** (`ChatPanel.jsx` deleted); deck-level changes are the
  theme selector and the new Density control (`sweepDeck` in
  `src/ai/generate.js`, `sweepDensity` in `src/ai/pipeline.js`, per-family
  content budgets in `src/ai/catalog.js`).
- **Presets** (`src/presets.js`, `config/presets/<user>.json`, CRUD endpoints,
  briefing-first question, skip-the-fixed-questions walk in `lib/briefing.js`).
- **No-branding** — `chrome.branding` in meta.yaml; chrome.js strips marks.
- **Report briefing** — `REPORT_QUESTIONS` in `lib/briefing.js`, depth
  question, density flows into the report writer.
- **Full Research view** (`views/ResearchView.jsx`, `researchSummary` in
  `src/ai/research.js`, compact ResearchCard in DeckDetail).
- **Report preview** — `reportPreview` in `src/preview.js`, report view shows
  the rasterised pages, ReportPanel shows a thumbnail strip + open-view door.
- **Type-swap gallery** — `src/specimens.js`, `/api/types/:theme/specimens`,
  `convertSlide`/`compatibleRemap` in `generate.js`, `TypeSwapModal` in
  DeckDetail, cache in `decks/.specimen-cache/` (gitignored).
- **Research engine** — multi-angle `expandQueries`, `diversityFollowups`,
  `gapQueries`, papers via `src/papers.js`, Jina fallback gated by
  `RESEARCH_JINA=1`.
- **Images** — `/api/decks/:slug/assets` upload (validated ext + size),
  per-slide image button, invented-URL sanitising in convert/sweep, `[image]`
  note → "add image" badge.
- **Deployment** — `docker/Dockerfile`, `docker/docker-compose.app.yml`,
  `.env.example`, `src/mail.js` (SMTP, no dep), `src/sweep.js` (monthly sweep
  + scheduler + `npm run sweep` + `POST /api/sweep`), secure headers, CORS
  allow-list, auth rate limit, static UI serving + SPA fallback.
- **Themes** — brutalist-paper, isometric-dark, editorial-serif-light,
  chalkboard, mono-terminal-light, minimal-warm; bauhaus divider now yellow,
  editorial-serif-light title ink-blue.
- **Report title** bold + centred.

## Verification notes

- `npm test` 190/190; `npx vite build --config app/web/vite.config.js` clean.
- **CDP (headless Chrome):** report briefing walks preset→title→…→research
  and lands on "Generate the report" (no deck-only controls); report preview
  shows "The rendered document" pages; type-swap gallery shows 75 rendered
  previews and a compatible swap converts with no model; image upload converts
  a slide to image-text with the asset and it renders; deck detail has no chat
  rail, has Density/Re-sweep/type-swap/image/research; research full view
  opens with coverage + notes. Harness: `/tmp/opencode/cdp.mjs` (+ lib + per
  feature scripts, not in the repo).
- **Generation (cloud `deepseek-v4-flash`):** a full deck swept to dense —
  bullets gained real specifics from research, headline and layout preserved,
  no overflow (mimo-checked); a bullets→pyramid type swap preserved the
  presenter; a report rendered to 6 preview pages. Paper search: 6 papers from
  arXiv+Crossref in ~3s, a 10.6K-word full text pulled; a full research pass
  with papers produced 25 sources incl. 8 papers and a 50K-word notes file.
- **Themes:** 26 themes pass the token-contract test, render with zero
  problems; the six new ones verified visually distinct, and bauhaus vs swiss
  and editorial-serif-light vs minimal-warm verified as differentiated.
- **Deployment:** Docker image builds, boots serving API + UI, and previews
  rasterise inside the container; sweep deletes old-but-keeps-marked decks;
  20 logins then 429 (rate limit); security headers present.

## Seams and leftovers

- **`[image]` notes are the seam for F13 image search** — the roadmap has the
  design; the writer emits them, the sanitizer preserves them, the UI turns
  them into an "add image" prompt. A CC-image lookup (Unsplash/SearXNG image
  category) would close the loop, opt-in like the papers toggle.
- **The density sweep keeps originals on ~1/3 of slides** with the cloud model
  (it stops mid-JSON occasionally; done_reason=stop with truncated JSON). The
  per-slide keep-original degrade is the designed fallback, and the problem is
  surfaced in the UI, but a retry-once like the writer's would recover most.
- **`decks/first-impressions-and-networking-how-people/`** and the
  `exploring-first-impressions-*` folders remain untracked test decks (the
  user's own browser-test folders, left untouched as instructed). Decide
  whether to keep/commit the new one.
- **Cloud outline is still slow (~80-100s)** — unchanged from last handoff.
- **`sweep` email only sends when SMTP is configured**; without
  `FORGE_SMTP_*` the sweep still runs and logs, just silently.

## End-of-session state

- Servers running: API `http://localhost:5174`, UI `http://localhost:5173`
  (Vite). Restart with `npm run api` / `npm run web` if down; check
  `/api/health` before trusting an endpoint. The API process was started
  detached (`setsid node app/server/index.js … &`), so a shell restart doesn't
  take it down.
- `config/local.yaml`: cloud key attached, `routing.default: cloud` (restored
  after the generation tests — flip back to `local` if you want the local
  default; the handoff before this one left it `local`).
- All commits pushed to `origin/main` (last push: the big-sweep docs + roadmap
  tranche). Server code is the thin transport as before — the CLI shares
  `src/ai/`, and CLI-created decks stay ownerless/shared.
