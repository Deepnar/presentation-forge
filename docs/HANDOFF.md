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
