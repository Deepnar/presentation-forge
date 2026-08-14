# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`. Then the sections below. This
file is overwritten at the end of every session; git history preserves older
handoffs.

## Session summary

**The final-polish plan (`/tmp/opencode/FINAL_POLISH_PLAN.md`) is fully
executed, pushed, and the app is go-live ready.** Security first (A1–A10 with
real curl/CDP verification), the two Docker bugs that broke the container,
then the themes work (the user's biggest complaint): a background layer, three
layout flagships and twelve new themes (26 → 38), each verified by rasterise +
`mimo-v2.5`. Then the UX quick wins, deployment hardening (including a STARTTLS
SMTP rewrite), and docs. `npm test` 231/231, `vite build` clean, Docker build
verified in a real container run.

## What shipped

### Security (all verified with real attacks before and after)
- **A1** `POST /api/sweep` (could delete every unkept deck unauthenticated) now
  requires a session — proven 401 unauthenticated, works authenticated.
- **A2** identity-PUT, brand-POST/DELETE, cloud-routing-PUT all gated (were
  `ok:true` unauthenticated).
- **A3** slug-format guard (`^[a-z0-9][a-z0-9_-]{0,99}$`) before every `<img>`
  exemption, closing the traversal class.
- **A4** SVG dropped from uploads; magic-byte checks (a smuggled HTML named
  `.png` is refused); served assets carry a `sandbox` CSP. Brand uploads
  tightened to the raster allowlist + magic bytes too.
- **A5** strict CSP on the served UI (not API JSON); **A6**
  `FORGE_OPEN_REGISTRATION=0` + boot-seeded admin; **A7/A9/A10** trust-proxy,
  session idle TTL (default 30d, refreshed on use), CORS emits nothing when
  unconfigured. **A8** specimen endpoints gated + a render mutex (one render
  at a time, queue cap 2).
- **A11** recorded — both `image-size` advisories affect `<=2.0.2`; no patched
  version exists, and A4 already closes the reachable surface. Note + monitor,
  do not force-downgrade pptxgenjs.

### Docker (D0 + D1, all verified in a real build/run)
- `FORGE_CHROME` env fixed (plate themes rendered blank in-container); dead
  `PLATE_CACHE_DIR` → `FORGE_PLATE_CACHE`; `.dockerignore` added; `reference/`
  copy guarded with a forced `.gitkeep`. `--no-sandbox` is now an image env
  flag (`FORGE_CHROME_NO_SANDBOX=1`).
- The image runs as an unprivileged user (uid 1001) and a first-boot entrypoint
  seeds the committed config templates into the empty `/data/config` volume —
  without it a fresh deploy 404s on `identity.example.yaml`. Verified: build,
  non-root plate render, API boot, idempotent second boot.

### Themes (26 → 38, the big visible win)
- **Background layer** (`tokens.background.decor`, native shapes +
  transparency — pptxgenjs has NO gradient fills, they're silently dropped):
  rolled out across the neutral-minimal cluster, corporate-alegria/swiss
  differentiation, and the new themes.
- **Three layout flagships**: editorial-magazine two-column bullets + drop cap
  (`tokens.editorial`), bauhaus section geometric block (`tokens.bauhaus.block`),
  neubrutalism hard-shadow opacity bug fixed (100 → 1).
- **Twelve new themes**: corporate-clean-blue, nature-organic, blueprint,
  high-contrast-mono, risograph, letterpress, paper-pastel, soft-glass-light
  (plate), sunset (plate), gradient-mesh-dark (plate), retro-crt (plate),
  sci-fi-hud.
- **`tools/themesheet.mjs`** renders the specimen deck's *first content slide*
  into a labeled PNG with a `--score` mode (closest theme pairs by pixel diff).
  It caught corporate-alegria × swiss-international at 0.429 — genuinely
  identical — now differentiated. `tools/gallery.mjs` (`npm run gallery`)
  renders per-theme title-slide thumbs; plate themes now show their real
  background in the Themes gallery and the briefing cards (falling back to the
  token synthesis when the thumb is missing).

### UX (B quick wins) + Deployment (D)
- Registration-locked login screen (hides register tab, shows owner note),
  Re-sweep confirm dialog, LOCAL/CLOUD tooltips, theme auto-scroll in briefing,
  keyboard-shortcuts docs, first-run "where do the models live" hint.
- **STARTTLS in `src/mail.js`** — port 587 submission now works; also fixed a
  latent bug where every command was written WITHOUT CRLF (the server never
  saw a complete line). Two integration tests spin up a real STARTTLS server.
- README: Ollama-on-host note, sweep-UTC note, backup/restore tar recipe,
  reverse-proxy + trust-proxy guidance.

## GitHub findings (from the user's sweep) — all SKIPPED, reasons

1. **docxtemplater** — skipped. Correct licence (MPL-2.0) and Node-native, but
   the report renderer already preserves institutional header/watermark from
   the donor template; replacing a verified path is a multi-day risk, not a ≤1
   day upgrade. Concept recorded: "template → data → document" for any future
   report rework.
2. **wisupai/e2m** — skipped. Python sidecar for a paste-a-PDF→notes flow that
   doesn't exist yet; the research pipeline ingests URLs/arXiv/Crossref already.
   Record as future option if a file-ingestion flow is wanted.
3. **dashi-ppt-skill** — concept only (AGPL, no code). The outline/diagram/
   table-views UX is already the chat-first direction. No action.
4. **pptxgenjs-jsx** — concept only. The three-layer rule wins; a JSX layer
   would let content reach layout. No action.
5. **PPTX2HTML / office-open-xml-viewer** — skipped. In-browser OOXML preview
   would need to match LibreOffice's output pixel-for-pixel or the preview
   would lie (TRAPS: validate against the rendered artefact). LibreOffice
   latency is acceptable; revisit only if preview latency becomes the pain.
6. **ppt-agent-skill** — concept only (charts/benchmarks). The chart steering
   already shipped. No action.

## Verification notes

- `npm test` 231/231; `npx vite build --config app/web/vite.config.js` clean;
  Docker build + non-root container run verified (plate render, API boot,
  config seed).
- All theme batches verified by contact sheet + `mimo-v2.5`; the final sheet
  confirmed dark-mesh, sunset, two-column bullets and the bauhaus block.
- CDP harness used this session: `/tmp/opencode/cdp-shot.mjs` (raw WebSocket,
  no deps) — screenshots pages on :5174 with a token injected. Useful for any
  future UI check. A pixel probe confirmed the registration-lock UI.

## Seams and leftovers

- **`decks/type-batch1/`** untracked (regression fixtures from earlier theme
  batches); **data-centre/exploring decks** untracked (chart-steering
  fixtures) — keep, delete freely.
- The background layer supports ellipse/rect/roundRect/triangle. A theme that
  wants a genuine mesh/gradient must use the plate path — there is no native
  gradient.
- Specimen renders are gated (login) and mutexed; the specimen PNG serve route
  stays open for `<img>`.
- `app/gallery/` is gitignored — run `npm run gallery` after adding a theme so
  the Themes page shows its real thumbnail.

## End-of-session state

- Servers running: API `http://localhost:5174` (dev config, registration open).
- `config/local.yaml`: cloud key attached, `routing.default: cloud`.
- All commits pushed to `origin/main` (last: the docs record commit
  `d8265cf`).
- Roadmap/TRAPS/ARCHITECTURE updated to the built reality; the plan file at
  `/tmp/opencode/FINAL_POLISH_PLAN.md` remains as the audit record.
