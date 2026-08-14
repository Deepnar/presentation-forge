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
