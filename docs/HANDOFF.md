# HANDOFF — 2026-08-15 (user testing round)

The product is functionally complete (324 commits, 261/261 tests, servers up).
The user tested it end-to-end and filed the issues below. Root causes are
CONFIRMED in code for the render bug and the empty report pages; the rest are
feature requests with clear directions. Next session: fix the confirmed bugs
first (items 1-2), then the UX/feature batch (items 3-9), in order.

## Confirmed bugs (root causes found)

### 1. Report view: "still rendering" spinner after render + download button lost on reopen
- ReportView.jsx `renderDoc()`: the "Rendering…" status and busy flag come from
  `setStatus`/`setBusy` — but the report WRITE progress ("Writing section N of M")
  flows through a separate subscription (`reportWrites`, line 60). The button's
  disabled state (`busy || !data`) doesn't cover the write; and `status` stays
  "Rendering…" if the write subscription's terminal patch never clears it.
- Also: `result` (which shows the Download link) is component state — lost on
  reopen. The download link must be derived from server state (the .docx exists
  on disk) so it survives navigation: check for the rendered file on load.
- Fix: unify busy/status across renderDoc AND the write subscription (one
  `generating` state); on reopen, probe whether report.docx exists and show
  Download without re-render.

### 2. Report: pages 2-3 always empty
- src/report.js `buildBody` (line 304-312): `cover()` + `pageBreak, pageBreak`
  (TWO hard breaks) + TOC + `pageBreak` + section 1 with `<w:pageBreakBefore/>`.
  When the cover ends near a page boundary, the double break produces a blank
  page; the TOC's trailing break + pageBreakBefore can produce another. Hence
  pages 2-3 blank on every report.
- Fix: exactly ONE page break after the cover, ONE after the TOC, and drop
  `pageBreakBefore` from section 1 (it already follows a break). Verify by
  rendering a report and checking no blank interior pages.

## Feature/UX batch (in priority order)

### 3. Chat knows WHICH slides you mean (select-then-instruct)
- User: the edit-then-see flow is ambiguous ("add more content to the slides 9
  10 13 19" produced updates on 10/11/14/20 — off-by-one confusion). They want
  Claude-style slide selection: after a deck is ready, a side panel (~40% width,
  chat shifts left) shows all rendered slides scrollable; the user selects one
  or many, then types in the chat ("add more content to THIS slide") and the
  turn context names the selected slides explicitly (indices + content
  excerpts), removing ambiguity.
- Also wire the lightbox's active slide index into the chat context so "make
  THIS punchier" works (was queued before).
- The selection panel should also let the user trigger per-slide actions
  (swap type, punch-up) from the selected set.

### 4. Are briefing answers sent to the AI? (verify + make explicit)
- User asks whether the Q&A from the guided briefing reaches the model. Check
  pipeline: the briefing collects title/team/guide/academic/theme/density/
  branding/slidesPerMember — verify each is actually folded into the plan
  prompt (identity merge exists; confirm briefing answers beyond identity are
  passed). Make it explicit in the plan prompt: "The user answered: …".

### 5. Explicit intro→conclusion flow instruction
- User asks whether the planner is instructed to keep a proper presentation
  flow (title → intro → body sections → conclusion/closing) or whether the
  user must ask for it. The plan prompt has generic structure guidance; make
  the flow instruction EXPLICIT: always include title, an intro section, body
  sections in a sensible order, and a conclusion/closing — regardless of the
  brief. The structural-budget fix already reserves title/dividers/closing;
  this adds the flow-order guarantee.

### 6. Logout confirmation
- Logout currently logs out instantly. Add a confirm step (small modal: "Log
  out of Presentation Forge? Your work is saved.").

### 7. Login/signup screen redesign + de-clutter
- Make it a proper split screen: something visual on the left (logo, tagline,
  the ember particle field, maybe the theme carousel), a clean professional
  sign-up/login card on the right. Label it "Sign up".
- The landing page has too many auth entry points (Log in, Sign up, Start a
  chat, Browse themes all open auth) — keep one strong CTA; make the rest
  links, not buttons.

### 8. Theme preview sizing inconsistency + font visibility
- Theme preview cards render at differing sizes on the home page vs the
  briefing's theme gallery vs the themes page. Unify the card dimensions and
  the preview raster size across all three surfaces.
- When scrolling themes during deck creation, the typeface used by each theme
  isn't visible in the preview. Add the font name to the card (the themes page
  shows palette+type; the briefing gallery should too).

### 9. Some slide types render too little content (bullets especially)
- Bullets slides come out sparse. The writer's per-type content budgets exist;
  raise the floor for bullets/list types (4-6 complete statements) and check
  the trim pass isn't over-cutting. Compare a generated bullets slide's density
  against the type's content budget.

## Notes
- Local models untouched; cloud used for generation tests. Model discipline:
  flash codes ONLY, mimo vision ONLY, NO qwen (user banned it).
- All specs/prompts durable in ~/.hermes/scripts/prompts/.
- Servers left running: UI :5173, API :5174, Ollama, SearXNG.

## Addendum — user's testing round 2 (00:22)

### 10. Placeholders ship into real decks looking like real content (BUG)
User's slide 19 literally reads: "Introduce the four CQ factors as learnable
skills for diverse classrooms…" + "Details in the full briefing." — that second
line is the PLACEHOLDER text (src/ai/generate.js:239) written when a slide's
generation fails (cut-short JSON). It looks like a deliberate writing choice,
so the user ships it unknowingly. 5+ committed decks still contain it.
Fix (pick all):
- Placeholders must be IMPOSSIBLE to miss: mark them in the UI (slide card
  badge "needs regeneration"), flag them in the deck's problems[] (they already
  go to skipped[]), and show a visible warning in the deck view listing every
  placeholder slide with a "Regenerate" button per slide.
- Auto-retry placeholder slides once more (the retry loop exists for failed
  ops; ensure a placeholder triggers one more regeneration attempt rather than
  shipping immediately).
- Consider a "no placeholders may ship" gate in the render: refuse to render
  (or loudly warn) when deck.yaml contains placeholder text.
- Sweep existing decks: regenerate the placeholder slides in
  green-hydrogen-economics-2026-*, green-hydrogen-in-2026-*,
  topic-exploring-first-impressions-and-networ.

### 11. Confirm the divider design intent (user asked — it's already correct)
User asked whether section dividers are "real topics people explain" or
transition slides. ANSWER: they are TRANSITION slides — "a divider announcing
the next part of the talk" (catalog.js:111); every content-bearing section
opens with one; they carry NO presenter; the content slides follow. This
matches the user's mental model. No code change — but consider making the
outline review say this explicitly ("divider — announces the next section" is
already the plain-language description; verify it reads clearly).

### 12. Per-type guidance for the AI: does every type have a description + when-to-use?
User asks whether each slide type has a description of what it is and when to
use, so the AI knows what to select. PARTIALLY: catalog.js has TYPE_DESCRIPTIONS
(plain-language, used in outline review + inline editor) and family groupings
+ data-affinity steering (numeric research → chart types). VERIFY the WRITER'S
prompt actually carries the "when to use" guidance per type — the catalog is
derived into the prompt; check that each type's prompt text includes a
one-line "use this type when…" (the type selection may otherwise be driven by
the type name alone). If missing, add a `use_when` line per type in the
catalog so the model's selection is grounded in intent, not just names.
Audit a generated deck's type choices against the brief to confirm sensible
selection.

## Addendum — user's testing round 3 (00:40)

### 13. Theme preview cards show real deck content (gpu-demo) instead of placeholders
User: "in the themes, the written content is about the GPU slides — I prefer
placeholder stuff like Title/Subtitle." The theme cards (Themes view + the
briefing's theme gallery) render a real specimen deck (gpu-demo content leaks
in). Replace the specimen content with neutral placeholders: "Title" +
"subtitle line" + the theme's own badge/number — the point is to show the
DESIGN, not a real deck. Also: the card heading was CUT OFF in the user's
screenshot (clip_20260815_002233_1) — check card text truncation/overflow at
small card sizes and fix the clip. Same for the type-swap specimen gallery if
it uses real deck content.

### 14. Chat context: confirm the full thread reaches the AI (answer = yes)
User asked "if I keep talking/writing, is ALL that sent to the AI? like talking
to a real AI?" ANSWER: yes — turn.js builds the full thread (system prompt +
history + CURRENT DECK state + research + instruction, lines 161-174). It is a
real conversation. The gap remains: the AI does NOT know which slide the user
is looking at (lightbox selection not in context) — the slide-selection panel
(item 3) closes this. "make slide 7 punchier" works today; "make THIS punchier"
needs item 3.

### 15. "/" slash commands in the chat
Add slash commands: e.g. /theme <name>, /density <sparse|balanced|dense>,
/report, /papers, /slides <n>, /help. Parsed from the input before the turn
runs; unknown commands get a helpful inline reply. Cheap and high-value.

### 16. Per-step SSE telemetry for long actions
Generation has SSE steps; chat turns and sweeps may not stream granular
progress. Add per-step status for EVERY long action (planning → researching →
writing slide N of M → rendering) so the user always sees movement, never a
stuck-feeling spinner.

### 17. Chat input: bigger, rounder, auto-grows (then stops)
User: "make the chat box a bit bigger and rounder; if we type a lot into it it
extends a bit and grows but stops at a point, like a normal chat." Implement an
auto-growing textarea (grows with content, caps at ~4-6 lines, scrolls beyond),
larger radius, slightly larger padding — the Claude-style input.

### 18. Profile/settings popover bottom-left (replaces bare logout)
User: "the logout should be in the bottom left, and not just logout — it should
pop out a thing for settings and personal info, so the AI ALWAYS has some
context of the person making, so it adheres to it. In the collapsed sidebar it
should look like a profile thingy. The settings popup should be a popover in
the middle of the screen."
- Bottom-left (in the sidebar footer): a profile chip (avatar + name) that
  opens a settings modal CENTERED on screen: personal info (name, email,
  institution, guide, team — the identity the AI uses), account actions
  (logout with confirmation — item 6), cloud key status.
- In the collapsed icon rail: the profile chip becomes an avatar-only button
  (same centered modal).
- The identity data shown/edited here is what flows into the AI's context
  (identity.yaml + per-user) so generations adhere to the person.

### 19. (DONE during this round) Collapsed-sidebar Themes/Identity links were dud
IconButton had the same preventDefault-without-navigation bug as NavRow.
FIXED + committed (c0fe0b8): both the rail icons and the row labels now
navigate. Verify in the collapsed sidebar too.

### 20. (From round 2, still queued) Chat slide-selection panel (item 3) is the
priority — the user keeps hitting the "the AI needs to know which slide"
problem. Everything else here is ordered after it.

## Addendum — user's testing round 4 (00:55)

### 21. Hosted deployment: how do users choose cloud models? (answer + improvement)
User asked: "for hosting, how will users choose which model from the API, and
which are supported — will they be listed automatically?"
ANSWER: cloud models come from the `providers:` section in config/models.yaml
— each provider explicitly lists `models:` (e.g. opencode-go lists
deepseek-v4-flash / qwen3.8-max / mimo-v2.5) and the picker shows them once a
key is present. It is a STATIC, admin-curated list — NOT auto-discovered from
the API. That's correct for a hosted box (the admin curates), but improve:
- When a provider's `models:` is empty, optionally fetch the model list from
  the API (GET {baseURL}/models) to auto-populate.
- UI copy in the model picker / Cloud settings: "These are the models the
  host has enabled" so users understand why the list is what it is.
- Document in the deploy guide how the host curates the list.

### 22. Post-generation sweep: verify nothing leaked into ALL slides
User asked: "when the whole thing is made, does the model do one sweep over
all the written content — did something leak into all those things?"
- The density sweep re-writes all slide content at a density target; the
  per-slide punch/edit turns touch single slides. VERIFY the sweep's rewrite
  doesn't carry stale content (e.g. a previous slide's text, a removed
  section's wording) across slides — the sweep prompt must treat each slide
  independently against the research, not copy neighbors.
- Also verify the grounding pass runs AFTER a sweep (it should — sweep →
  re-ground was wired earlier; confirm in the current code).

### 23. Personal descriptions in the app must be GENERALISED
User: "a LOT of places in the app the descriptions — like in the API places —
are catered to me; it shouldn't be, it should be generalised info."
- CLARIFIED (round 4, 00:55): the user means PROVIDER-SPECIFIC copy, not just
  names — e.g. the Cloud/Identity section says "Attach your OpenCode Go
  subscription… deepseek-v4-flash, qwen3.8-max, mimo-v2.5" which only makes
  sense for the user's own setup. When hosted, users have OTHER providers.
- Verified: NO personal data (TCET/Deepesh/Thakur/Chembur) in code — the
  identity.example.yaml is neutral; the user's own data lives only in the
  gitignored config/identity.yaml (correct).
- FULL INVENTORY of provider-specific user-facing copy to generalise:
  1. app/web/src/views/Identity.jsx:328-329 — "Attach your OpenCode Go
     subscription so the app can also use hosted models — deepseek-v4-flash,
     qwen3.8-max, mimo-v2.5 — next to the local ones." THE WORST: hardcodes
     the provider name AND its model list. Fix: render the provider's
     `label` + `models` from the cloud status response (dynamic), with
     generic wording ("Attach your provider's API key so the app can also
     use hosted models — <listed models> — next to the local ones."). The
     OPENCODE GO badge + zen/go URL below are already dynamic (from config)
     — keep those.
  2. README.md:119 — "the opencode-go key works" → "any OpenAI-compatible
     key works (OpenAI, OpenRouter, OpenCode Go, …)".
  3. Any other UI copy mentioning opencode / the specific models / zen/go —
     grep for `opencode|zen/go|deepseek-v4-flash|qwen3.8-max|mimo-v2.5` in
     app/web/src and app/server — replace with dynamic/config-driven text.
- Code comments (src/cloud.js:7, src/ai/ollama.js:227, ARCHITECTURE.md,
  TRAPS.md, ROADMAP.md, test/transport.test.js) are internal — may keep
  opencode-go references (they document the actual dev setup). Only
  USER-FACING copy must be generalised.
- Also generalise README.md:8 "Built for TCET-style graded submissions" →
  "institutional graded submissions".

## Addendum — user's testing round 5 (01:00)

### 24. Coherence check: every slide must serve the deck's topic AND be presentable (NEW, high priority)
User (slide 17 of the soft-skills deck): the slide "The Young Flight Attendant
Is a Stereotype the Data No Longer Supports" (age-demographic bar chart,
male-share stat) has NO obvious connection to the deck's topic — first
impressions and networking. "That slide might throw someone off… both report
and the ppt must have coherence."
- Root cause confirmed: the data IS legitimately in research/notes.md (the
  stereotyping section, cited Saenz & Evans 2009) — the writer picked a
  real, grounded stat but framed it as the slide's headline with no link
  back to the deck's argument. It's a FRAMING/COHERENCE failure, not a
  data failure: the slide is topically adjacent (stereotypes → bias/blind
  spots section) but argumentatively disconnected — a presenter can't
  deliver it without improvising the "so what".
- Fix: add a COHERENCE pass (to the post-generation sweep, per the user's
  ask) that checks EVERY slide against the deck's topic and section:
  1. TOPICAL FIT: each slide's headline + body must clearly serve the
     deck's central topic (embed the topic in the sweep prompt; flag
     slides whose content drifts — e.g. a flight-attendant chart in a
     first-impressions deck).
  2. PRESENTER READINESS / FRAMING: each slide must LAND its point — the
     headline should be the claim, the body the support, and there must be
     an implied "so what" a presenter can voice. Flag slides that are
     data-without-argument (stats with no link to the section's point).
  3. Both DECK and REPORT must pass the same check (the report generator
     should be coherent with the deck's sections).
- The writer prompt should also carry a framing rule: "Every slide's
  headline must be a claim that serves THIS deck's topic; if a researched
  fact doesn't serve the argument, don't use it — even if it's grounded."
- Verification: the soft-skills deck's slide 17 should be rewritten to tie
  the stereotype data to first impressions (e.g. "Stereotypes shape your
  first impression before you speak" + the flight-attendant example as
  support), or replaced if it can't be connected.

## Addendum — user's testing round 6 (13:00)

### 25. "Upload-only" mode: turn search OFF, user's file is the source of truth (NEW)
User: "the ability to turn search completely OFF and only depend on the info
the person gives — in either an md file or Word or anything — as an upload,
and that is the source of truth for the ppt or report."
- A briefing/briefing question (or a toggle in the chat): Research source =
  "Web search (default)" | "My uploaded file (no search)".
- When upload-only: the research pass is SKIPPED entirely (no SearXNG, no
  arXiv/Crossref, no Jina). The uploaded file (md / txt / docx / pdf —
  convert via the existing e2m-style path or LibreOffice) becomes
  research/notes.md + sources.json (marked "user-provided"), and it is the
  ONLY content source.
- The grounding pass already enforces "every figure must trace to the
  notes" — with upload-only, the notes ARE the file, so grounding becomes
  a strict fidelity check against the user's document (nothing invented,
  nothing from outside the file).
- The upload should be visible/editable in the existing Research panel
  (the notes.md edit path already exists), so the user can trim their file
  before generating.
- Report mode: same toggle — the report is built only from the uploaded
  file.
- Verify: upload a md/docx → generate deck + report → assert zero web
  calls in the log, every claim traces to the file, grounding flags
  anything not in the file.
