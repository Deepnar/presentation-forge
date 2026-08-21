# Handoff — 2026-08-21, auto/cloud + shell polish + tour fixes (local commits)

The plan-mode audit is now reality. Four local commits are on `main` but not pushed (per your “only local commits”): `ad7de96` (TCET scrubbed), `79c6bfd` (tour header/hero/particles), `f761ed2` (deck visual picker + legal routing), `cb0804b` etc. Earlier pushed batch: `5401a8f` (db/vault/limits), `1f402dc` (Google + auto), `de0dc66` (api quotas), `766b55e` (AUTO/CLOUD UI), `48b0d3c` (light shell), `cde17ae`/`b438f8f` (TCET 520), `f0891e4` etc.

## What shipped this session

- **DB + vault + limits.** `src/db.js` (node:sqlite WAL, migrates users/sessions), `src/vault.js` (AES-256-GCM with FORGE_KEY_PEPPER, per-user BYOK + global tcet-auto), `src/limits.js` (hourly/weekly req/slides/tokens, max 30/deck, `auto_events` sliding windows). Enforced in `app/server/index.js` on plan/generate/chat/report.
- **Auth.** `src/auth.js` now DB-backed + Google any-email via `tokeninfo` (aud check skipped when GOOGLE_CLIENT_ID unset for dev). `setStoreDir` keeps `auth.test.js` on JSON. `GET /api/auth/google/config` exposes clientId.
- **Providers.** `config/models.yaml` adds `tcet-auto` (qwen3.6 @ ai.tcetcercd.in). `src/cloud.js` adds `autoProvider` (TCET when key, else local Ollama fallback so `git clone` keeps AUTO as local), `autoStatus`, generic `Auto` label (no TCET in UI), `testAuto` friendly 500/520 → “shared server restarting”.
- **Shell.** Light indigo shell (`#F8F9FC` + `#6D5BFF`, `styles.css` + `[data-theme="dark"]`), `HeaderBar` AUTO/CLOUD now single toggle switch + `subscribeModelMode` so Settings change reflects instantly, `TourHeader` for unauth with dark toggle + auth.
- **Tour.** `Home` hero now `rounded-[2rem] border + gradient + shadow` (no abrupt corners), `AuthBar` deduped (TourHeader owns auth), `ThemeCarousel` snap + search, `LocalVsCloud` → Auto vs Cloud generic, footer → Privacy/Terms/Contact (`#/` routes, `Legal.jsx`, unauth handled).
- **Branding.** `src/ai/identity.js` + `src/render.js` now merge `identity.example.yaml` so minimal `HACKED` no longer erases `brand/` — crest/banner render again.
- **UX.** `ThemeMiniCard` fixed `h-[220px]`, `Settings` split into `ProfileModal` (keys/routing/logout, toggle switch, dynamic API box) + `SettingsModal` (formats/identity/brand, Esc), chat `newChat` storage-direct dedupe, sidebar collapsed profile aligned, `Chat`→`PPT`, header subtitle `project — slides + report + script`, model picker shows `Auto · qwen3.6`.
- **Thumbs.** `Home` skeletons and `DeckDetail` theme picker now visual grid (was names-only select).

## Live verification

- `GET /v1/models` 200 with `sk-a2b09…`, `POST /chat/completions` 500/520 (origin down) — surfaced as friendly, not bare 500.
- `POST /api/decks {"maxSlides":40}` → `429 This deck needs 40 slides but auto allows 30`.
- `PUT /api/keys` → ciphertext in `user_keys`, `GET /api/keys/status` → `hasKey:true`.
- `GET /api/auto/status` generic, `POST /api/auto/test` friendly, `GET /api/auto/usage` windows.
- `npm test 347 pass`, `render gpu-demo 12 slides` + `preview` OK, `vite build` OK (new `index-8YbFlWXh.js`).

## Known limitations (still)

- TCET chat 500/520 — campus vllm origin down; models endpoint is health, not chat. Cloud BYOK works.
- Fancy landing: hero/pipeline still separate cards, not yet the split scroll-driven showcase. Top header is `bg-panel/90` on `bg-base` — subtle, but user still calls top “white”. Particle field richer but still subtle.
- PPT themes: 38 exist, selector fixed, but no contact-sheet cull of weak themes yet.

## Next session — SUPER fancy tour redo (do not start now)

You want the entire landing redone — super fancy, not an iteration:

- **Left sticky, right scrolly:** big type on left (“Presentation Forge / From topic to deck — fast + sub + CTA”), right side pins and slides through features as you scroll — each scroll step reveals a new slide-type specimen (bullets, chart, compare, timeline, diagram, etc.) and a pipeline step, like Gamma’s scrollytelling. Left copy stays, right visuals change with `IntersectionObserver` + `snap`.
- **Pipeline in hero:** the 7-step pipeline (`brief → research → outline → you approve → content → render → critique`) should animate step-by-step inside the hero/right pane, not as a separate card below. Hero and pipeline currently overlap visually — new layout makes them one scrolly story.
- **Top right Deepesh:** header’s user chip must open `ProfileModal` (api keys, logout) — currently HeaderBar does, TourHeader when logged-in should also. Footer links (Privacy/Terms/Contact) must go to dedicated pages (`#/privacy` etc.) with distinct look/feel, not redirect to `#/home` or the app’s themes page. Themes on tour bottom should link to a *marketing* themes showcase — visually distinct from the app’s `Themes` grid (full-bleed, larger, editorial).
- **Theme UX everywhere:** tour, briefing (`ChatView ThemeCard`), and deck detail (`DeckDetail` theme picker) must all be visual grids, not names. Already fixed briefing + deck, but tour’s `ThemeCarousel` still needs the super-fancy treatment.
- **Logo:** flame in new indigo palette (`#6D5BFF→#8B5CF6` tile, white flame) — user says flame was better than the simple F, keep flame but in new colors (just did). Ensure `h-8` with `ring` pops on both light and dark.
- **Particles:** want “MUCH better with more animations normally along with the reactive one” — denser, trails, constellation lines, stronger hover push/scale.

**Questions before the next session starts — please answer:**

1. **Copy on left:** What exact big headline + sub + 2-3 proof points should the left sticky show at the top? Is “From topic to deck — fast + The app does the bulk…” final, or do you want a new super-fancy headline (e.g., “Decks that get an A, in minutes”)?
2. **Right side content order:** As we scroll, what’s the sequence on the right? Is it: (a) 6-8 real rendered deck covers, then (b) 10-12 slide-type specimens, then (c) pipeline steps, then (d) themes? Or a different story arc?
3. **Visual language for the fancy tour:** Do you want it **light** (white, airy, like Gamma) or **dark** (midnight indigo, like Linear) or **split** (light hero, dark features)? And should the marketing themes showcase be dark editorial (like Stripe) or light gallery?
4. **Header on tour when logged in:** Should the tour header always show `Deepesh` chip that opens Profile, and should `Tour` be active when on `#/home`? Currently authenticated tour uses `HeaderBar` with `Tour` pill.
5. **Footer links:** Should Privacy/Terms/Contact be simple markdown pages (like `Legal.jsx` now) or a different visual treatment from the app? And should themes marketing page be at `#/tour-themes` distinct from `#/themes`?
6. **Scope for next session:** You said “if too much for this session make ANOTHER opencode session”. Do you want the next session to *only* do the tour redo (and leave the other tour header/footer fixes to this session’s follow-up), or should the next session also finish the remaining tour header/footer + theme UX + pipeline overlap polish?

## Servers

- `67747` API `:5174` + `85530` Vite `:5173` left running (both with new light shell + TCET-scrubbed). `forge_searxng` docker still up. Kill throwaways before next `npm run dev`.
- To see current (pre-fancy) tour: `http://localhost:5173/#/home` then hard refresh. New fancy tour will be a fresh `Home.jsx` rewrite.

## Model discipline

- Code: `opencode-go/deepseek-v4-flash` (if you run a new session, point it at this). Vision: `opencode-go/mimo-v2.5` for any screenshot audits. Your TCET key `sk-a2b09…` is in `global_keys` (encrypted) and in `FORGE_TCET_API_KEY` for dev — valid for `GET /models`, `POST /chat` is origin-down.

## Commit discipline (per your “only local commits”)

- Last 5 are local only (not pushed): `ebd8b6f`, `f761ed2`, `cb0804b`, `79c6bfd`, `744774e`, `ad7de96`, `25c38b5` etc. Next session should start with `git log --oneline -8` and `git status` and continue local commits, push only when you say.

