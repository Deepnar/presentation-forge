# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`. Then the sections below. This
file is overwritten at the end of every session; git history preserves older
handoffs.

## Session summary

**Per-transport capability split — cloud is no longer hobbled by local
limits.** Every place a LOCAL-model limit (output caps, prompt conservatism,
context window, research depth) constrained the pipeline, the cloud transport
now gets the full capability, split by transport rather than one-size-fits-all.
Verified end-to-end with a real cloud run: a 79-source / 56-domain / 10-paper
research pass (940 KB notes), a 15-slide deck generated with zero
`done_reason=length` truncations, and `mimo-v2.5` confirming sharp, specific
text with no visual defects. `npm test` 244/244, `vite build` clean, all seven
commits pushed.

## What shipped

### The transport override mechanism
- A role in `config/models.yaml` may declare `transports.cloud` (and optionally
  `transports.local`). `applyTransport()` in `src/ai/ollama.js` merges the
  block for whichever backend the role resolves to, replacing nested blocks
  wholesale. Applied centrally in `chat()` after resolution, so every caller
  sees their own transport's numbers.
- **Cloud author:** `num_predict` 12000→24000, `excerpt_chars` 80000→240000.
  A long cloud outline is no longer cut mid-JSON.

### Length auto-bump + honest errors
- A non-streamed completion with `done_reason=length` retries the same request
  with the cap doubled, up to `defaults.num_predict_bump_ceiling` (64000).
  Streamed calls are exempt (tokens cannot be unsaid). The truncation error
  states the effective cap AND transport. The UI's "Retry planning" card now
  succeeds where it used to fail identically — no UI change was needed.
- TRAPS updated: the auto-bump is the automated raise-`num_predict` with a
  ceiling guardrail, so a runaway grammar still fails cleanly.

### Cloud research is strictly deeper
- The research role's `research:` block is a per-transport depth budget: cloud
  runs more angle queries (10 vs 8), higher source/read caps (12/8 vs 8/4), more
  examiner-gap follow-ups, more papers (10 vs 6) with arXiv/Crossref upstream
  windows scaled. `excerptResearch` takes an explicit cap, resolved against the
  AUTHOR's transport (`researchExcerptCap`) because the author reads the notes.
- **Routing only routes the author role**, so cloud research = giving the
  research role a `provider:` in models.yaml. The committed default stays
  local-first; the verification run temporarily set `provider: opencode-go`
  on research, confirmed 79 sources / 10 papers, then reverted.

### Full-strength synthesis on cloud
- `authorTransport()` lets prompt-builders pick a full-strength variant when the
  author runs cloud: planner (richer purposes), slide writer, density sweep,
  type swap and chat turns all get a synthesis note — claim-first prose with
  evidence, real hooks in standfirsts, figures quoted from the notes, no
  template filler. Local keeps the conservative prompt. Grounding still runs
  either way.

### Writer sees the field caps
- The full-strength prompt made the cloud writer overflow per-field schema caps
  (layers[].body ≤80, elements[].body ≤100), dropping slides to placeholders.
  The catalog now states every string's maxLength inside arrays and nested
  objects ("layers[] body ≤80 chars"). The same plan went from 12/17 to 15/17
  slides written. The two residual skips (agenda desc 120, framework elements
  body 100) are still model discipline — the placeholders keep the deck whole.

### Grounding fix (required for synthesis to be trustworthy)
- `normalize()` stripped decimal points and commas, so "18.84 GW" could never
  match "18.84 gigawatts" in the notes — every decimal a cloud writer quoted
  flagged as fabricated. Keep the dot; the bare-number check also tries the
  comma-collapsed form ("1,232 MW" → "1,232 megawatts"). One honest residual:
  a derived figure (₹3.61 − ₹2.25 = ₹1.36) flags, because grounding cannot do
  arithmetic.

## Verification notes

- `npm test` 244/244; `vite build` clean.
- Real cloud run: `forge new "Urban rooftop solar in India…" --research
  --papers --max-slides 18 --model deepseek-v4-flash` → 79 sources, 56 domains,
  10 papers, 940 KB notes. `forge generate <slug> --model deepseek-v4-flash` →
  15 slides, 2 skipped (schema caps), zero truncation errors. Rasterised and
  vision-checked with `mimo-v2.5`: all 8 sampled slides sharp/specific, no
  defects.
- Deck lives at `decks/urban-rooftop-solar-in-india-economics-polic/` (a real
  deck, keep — it is the synthesis-mode specimen).
- Transport config-contract tests in `test/transport.test.js` (applyTransport
  merge semantics, models.yaml cloud-stricter-than-local, auto-bump both
  transports).

## Seams and leftovers

- `schema/report.schema.json` carries an unrelated reformat diff in the working
  tree from before this session — leave or discard, it is not part of this work.
- The untracked `decks/*` dirs are prior fixtures (type batches, exploring,
  data-centre) — keep, delete freely.
- Enabling cloud research is a one-line models.yaml role override
  (`provider: opencode-go` on `research`); the depth profile follows the role's
  transport. Documented in ARCHITECTURE "Per-transport capability split".
- The `frame`/`window` in which cloud research ran used the temporary override;
  the committed default keeps research local-first.

## End-of-session state

- Servers running: API `http://localhost:5174`, web `http://localhost:5173`
  (restarted this session), SearXNG `:8888`, Ollama `:11434`.
- `config/local.yaml`: cloud key attached, `routing.default: cloud`.
- All seven commits pushed to `origin/main` (last: `8017edc` the writer-cap
  commit; docs commit pending in this same session).
- Roadmap item added: **"Per-transport capability split — cloud is not hobbled
  by local limits"** (with Learned). ARCHITECTURE "Model backends" and TRAPS
  updated to match. HANDOFF is this file.
