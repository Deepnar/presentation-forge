# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`. Then the sections below. This
file is overwritten at the end of every session; git history preserves older
handoffs.

## Session summary

**A user-review round on the chat/deck UX — five reported issues, all fixed
and verified end-to-end.** Cloud model (`opencode-go/deepseek-v4-flash`,
route=cloud) for the real generation tests; local Ollama untouched. The
session also surfaced and fixed a generation-reliability bug the review
touched but did not report.

1. **Cross-tab chat desync** — the chat list lives in localStorage per account
   and no tab listened for other tabs' writes, so a middle-clicked copy drifted.
   The shell now listens for the `storage` event on its chat key and reloads the
   list (active chat survives unless the other tab deleted it; the deck list
   refreshes when a produced chat appears). Verified with two real tabs:
   rename, create and delete in one are live in the other.
2. **"New chat" stacked empty rows** — repeated clicks minted a fresh thread
   each time. `newChat` now returns to the account's existing empty chat of
   that kind (nothing sent, nothing produced) until a topic is actually sent.
   The Ctrl+N handler reads the list through a ref so its once-bound closure
   cannot miss the reuse. Verified: two New-chat clicks → one row; after a
   topic, New chat → a fresh row.
3. **Deck density always showed "balanced"** — `createDeck` never wrote the
   briefing's density into meta.yaml, so `DeckDetail` fell back to balanced.
   Density now flows from the briefing (and a `--density` CLI flag) into meta at
   planning time; the sweep still overwrites it. Verified: a dense deck's detail
   control shows Dense.
4. **Structural slides squeezed out by the max-slides cap** — the outline
   schema capped TOTAL slides at max-slides, so 11 members × 1-per-person × 11
   max produced a plan with no title, dividers or closing. The budget now
   counts CONTENT slides only: the schema reserves headroom
   (`maxSlides + sectionCap + 2`), `planDeck` post-processes every plan to open
   with a title, divide every content-bearing section and end with a closing
   slide (none of which count toward the cap), and `trimContentToBudget` trims
   content to the team-sized budget (`min(maxSlides, N × slidesPerMember)`) so
   one-per-member hands every member exactly one slide. Verified end-to-end:
   title + 8 dividers + closing + exactly 11 content, M1–M11 each presenting
   exactly one slide, no one doubled.
5. **"Make slide N punchier" is real** — a chat turn after the deck is ready
   (`sendEditTurn` → `/api/decks/:slug/chat`). Verified in the current flow:
   after a full briefing → plan → approve → generate, the live chat accepted
   the turn, `deck.yaml` changed and 21 thumbnails refreshed in the thread.

**Bonus bug found by verification:** the writer loop silently dropped plan
slides. An empty or mis-targeted op list filtered to `[]`, `applyOps` no-op'd,
validation passed and the slide vanished with no retry, no placeholder, no
record — shrinking the promised count and stranding that member. A thrown
model call (truncated JSON) skipped it the same way through the catch. The loop
now defines success as "a NEW valid slide appeared", retries once, then writes
a validating placeholder (`placeholderFor`): a degraded slide beats a missing
one, and a divider spec never degrades into a content slide. The placeholder's
headline is word-bounded (≤48 chars, ellipsis) — a hard 60-char slice shipped
clipped mid-word on the rendered slide, caught by the vision critic.

## What shipped

### Frontend (app/web/src)
- `lib/chats.js`: `chatsKey()` exported, `findEmptyChat(chats, kind)` added.
- `App.jsx`: a `storage`-event listener on the chat key reloads the list in
  every other tab (and bumps the deck list when a produced chat appears);
  `newChat` reuses the empty chat of the same kind; the Ctrl+N handler passes
  `chatsRef.current` so its once-bound closure stays current.
- `views/ChatView.jsx`: `planDeck` passes the briefing's `density` into
  `api.createDeck`.

### Server / pipeline
- `src/ai/pipeline.js`: `createDeck` accepts and persists `density` into
  meta.yaml; passes `slidesPerMember` through to `planDeck`; CLI gains
  `--density`.
- `app/server/index.js`: `/api/decks` forwards `density`.
- `src/ai/generate.js`: `outlineSchema` reserves structural headroom; `planDeck`
  sizes the plan to the team (contentCap) and post-processes structure +
  budget (new exports `ensureStructuralSlides`, `trimContentToBudget`,
  `placeholderFor`, `shortHeadline`); `generateDeck`'s write loop treats
  "no new valid slide" as failure and falls through to a placeholder.

### Tests (261 passing)
- `test/chats.test.js` (new): empty-chat reuse + key scoping.
- `test/plan-structure.test.js` (new): structural-slides enforcement, budget
  trim, the 11-members/1-per-member/11-max sizing, and placeholder validity
  (content and divider specs).

## Verification notes

- `npm test` 261/261; `vite build` clean.
- CDP (headless Chrome, scripts under `/tmp/opencode/`):
  - `cdp-sync-reuse.mjs` — two tabs in one profile: New chat twice stays 1
    row; a topic rename, a new-chat creation and a deletion each appear live in
    the other tab.
  - `cdp-fullflow.mjs` — the whole user path with a cloud generation: briefing
    (11-member team, 1-per-member, 11 max, dense) → plan → approve → generate →
    deck; asserts title + 8 dividers + closing + exactly 11 content, M1–M11
    once each, meta density `dense`, density control showing Dense, and a
    punchier turn that changes deck.yaml + refreshes thumbnails.
  - `headless-gen.mjs` — the same generation driven via the API, capturing the
    `skipped` reasons (truncated-JSON writes → placeholder).
- `mimo-v2.5` vision check on the generated deck's rasterised slides: found the
  placeholder headline clipped mid-word (fixed and re-verified clean), and
  confirmed title / chart / closing slides render cleanly.
- Test decks left behind (untracked, gitignored artefacts): the
  `green-hydrogen-in-2026-cost-and-electrolysis-*` family. Keep or delete
  freely.

## Seams and leftovers

- The write-loop placeholder guarantees the CONTENT count, but the model can
  still *under*produce content in the plan (planDeck trims only overshoot;
  there is no padding to `N × slidesPerMember`). With a well-behaved cloud
  model this did not happen in any run; a local model that plans 8 content
  slides for 11 members would leave three members silent. If that bites, pad
  the plan with purpose-drafted slides rather than trusting the prompt.
- A failed `closing`/`agenda` placeholder relies on the divider spec keeping
  its type (title/section/closing validate; epigraph needs the quote the
  placeholder adds). Divider loss is tolerated by design — it never affects the
  content count.
- `schema/report.schema.json` still carries the unrelated reformat diff from
  prior sessions — left untouched as before.
- The untracked `decks/*` dirs are prior fixtures + this session's test decks;
  keep, delete freely.
- `config/users.json` (gitignored) now holds the seeded operator plus the
  verification accounts (`cdp-*@sync.local`, `cdp-*@full.local`, etc.), all
  password `correct-horse-battery`.

## End-of-session state

- Servers running: API `http://localhost:5174` (restarted this session, plain
  `node app/server/index.js` via `setsid`, NOT watch mode), web
  `http://localhost:5173`, SearXNG `:8888`, Ollama `:11434`. If you change
  server code, restart the API yourself — it is not auto-reloading.
- All commits pushed to `origin/main`. This session (six commits, one logical
  change each): `4f1c112` cross-tab sync + empty-chat reuse; `b3da7c0` density
  into meta; `0f8218b` plan structure + per-member sizing; `32869ea`
  no-silent-drop write loop; `45a6a84` word-bounded placeholder headline;
  `437370e` roadmap/architecture/TRAPS.
- ROADMAP (new checked entry under section 7), ARCHITECTURE (web-shell chat
  store + pipeline planning/write-loop), and TRAPS (silent-drop-behind-validation,
  schema-valid-but-clipped placeholder) updated to match.
