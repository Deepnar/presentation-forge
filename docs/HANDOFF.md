# HANDOFF — upload-only research mode + full self-audit

The final user-testing item (25) — upload-only research mode — is implemented,
committed and pushed, and the whole system (the 24-item batch + the new mode)
was audited like a QA pass with real UI walks via CDP. 300/300 tests pass; the
web build is clean; servers were left running (UI :5173, API :5174, Ollama,
SearXNG). This document records the current state so the next session can
verify, extend or spot-check without re-reading the old task lists.

## Item 25 — Upload-only research mode (the user's file is the source of truth)

The briefing's research question is now a three-way choice: **Web search
(default)** | **My uploaded file (no search)** | **No research**. When the
file wins, the research pass is SKIPPED entirely (no SearXNG, no arXiv/Crossref,
no Jina) and the uploaded document (md/txt/docx/pdf — LibreOffice converts the
office formats) becomes `research/notes.md` verbatim, marked
`kind: "user-provided"` in sources.json. Grounding then means strict fidelity
against exactly what the user gave, and the flagged-claim line names "your
uploaded file" so the contract is visible in the slide notes. The upload is
staged by token (gitignored `config/uploads/`, swept after 48h) so a large file
never round-trips through the browser or localStorage; the plan resolves the
token once the deck's slug exists. Works for both deck and report (the report
briefing doesn't offer "No research" — a report needs a source). The upload is
visible/editable in the Research panel before generating, since notes.md was
already user-editable. CLI parity: `forge new/report-new <brief> --upload <file>`.

Commit sequence: backend core (`src/ai/upload.js`, pipeline resolution, strict
grounding label, staging endpoint, CLI, tests) → frontend (three-way card +
upload gate, briefing fields, Research view "your file" treatment).

## The self-audit (user's explicit "check it all for bugs" request)

Walked the real flows via CDP (login → new chat → briefing with the new upload
toggle → outline → approve/generate → deck detail → slide selection panel →
punch/clear → report render → title-named download → reopen (Download persists
via server probe) → logout confirm) and attacked the edge cases. **Three real
bugs found and fixed** (each committed + pushed separately):

1. **`generateFromPlan` returned `r is not defined`** — an undeclared `r` in
   the problems spread, present since the grounding commit. deck.yaml was
   written + rendered BEFORE the return, so every generation *produced* a deck
   while the SSE result frame always failed and the chat reported an error.
   The stray line was redundant with `res.problems` and is dropped. Verified:
   the UI approve → generate → deck editor now completes.
2. **Oversized raw uploads returned a false 200.** `express.raw`'s limit error
   was swallowed by the misused continuation callback, so a >25 MB file came
   back as "the file is empty". All three raw-upload handlers (deck image,
   briefing upload, brand mark) now check the parser error and return a JSON
   413 naming the cap.
3. **Framework connectors crossed the concept title.** The radial hairlines
   started at the ellipse centre, so the vertical lines ran straight through
   "The ₹4.2/unit arithmetic" on a live deck. They now begin where the ray to
   each element exits the ellipse (vision-confirmed fixed).

Edge cases checked and green: report re-render twice (clean, no stuck busy
state), report reopen shows Download without a spinner, placeholder gate
refuses a deck carrying "Details in the full briefing." (naming the slide),
coherence pass ran on both generated decks (flagged + reframed slides),
selection panel select 1/many/clear, slash unknown-command reply, upload mode
empty/binary/huge/unsupported/unauthenticated all reject cleanly, docx with an
embedded image converts with text preserved, grounding flagged every derived
number the file never stated (2.6 = 6.8−4.2, 12.3 Mt = 4 t × 30.8 lakh) while
every real file figure passed.

**Zero-web-call proof:** planning with `--upload` succeeded with `SEARXNG_URL`
pointed at a dead port, and the resulting notes.md was byte-identical to the
uploaded file with no URLs anywhere in sources.json. Deck (13 slides, zero
grounding flags) and report (7 sections, .docx rendered) both generated from a
docx upload through the real API.

## Where the docs point

- `docs/ROADMAP.md` — a completion entry for item 25 with a Learned block
  (the seam fell out of existing notes-as-truth machinery; the work was the
  intake) plus the three audit fixes.
- `docs/ARCHITECTURE.md` — a new "Upload-only research" section and the
  `config/uploads/` data-location row.
- `docs/TRAPS.md` — three new cross-cutting entries: the terminal-spread
  ReferenceError, the swallowed body-parser 413, and radial connectors from a
  node's centre.

## Verified behaviourally this session

- Upload-only md + docx → plan → deck → report, zero research web calls,
  strict grounding (above).
- Upload card in the UI: Finish disabled until a file attaches; word count +
  name shown; plan → outline via cloud planner (CDP).
- Approve → generate → deck editor + selection panel (19 slides, select/✓/
  clear) — this flow was previously broken by bug 1.
- Deck detail slide grid (19 previews), deck.pptx download title-named,
  report reopen shows Download immediately (server probe, no spinner).
- Logout: profile chip → centred modal → confirm → token cleared, back on
  `#/home`.
- Oversized-upload 413 and the other upload rejections (API).
- Framework connector fix vision-confirmed (ellipse edge, no line through text).

## Open items / notes for the next session

- A deck created with **No research** cannot produce a report (no notes.md to
  write from); the Report panel's "Generate report" then fails with the honest
  error "no decks/<slug>/research/notes.md…". The button stays enabled — the
  error message is the current UX. Consider disabling/hiding it when the deck
  has no research, or let the Research panel create notes from scratch.
- `schema/report.schema.json` had a pre-existing cosmetic JSON reflow in the
  working tree; it was semantically identical to HEAD and has been reverted —
  the tree is clean.
- The `config/uploads/` staging sweep runs on stage and at server boot (48h
  TTL). Abandoned briefings are swept; a staged file resolved by no plan dies
  within two days by design.
- Local models untouched; cloud `deepseek-v4-flash` used for generation tests.
  Model discipline held: flash codes ONLY, mimo-v2.5 vision ONLY, no qwen.
- The CDP driver at `/tmp/opencode/cdp.mjs` was extended with `setFile` (DOM
  domain) and `typeText` (Input.insertText — synthetic `input` events do not
  update React 19 controlled inputs reliably). Reuse it for future UI checks.
  Note: clicking the AuthModal's "Log in" *tab pill* does not submit — the
  form submit is `button[type=submit]`.
