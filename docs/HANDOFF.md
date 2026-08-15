# Handoff addendum — 2026-08-16 00:10 (user's late-night HPC test)

The user generated the mixed-mode programming deck (recent-trends-in-mixed-mode-programming-for-3) — deck.yaml complete (20 slides, 11 presenters, no placeholders), status flipped to ready manually, rendered + previewed. TWO systemic issues surfaced; both queued below.

## A. JSON-parse tolerance for model output (the "did not return JSON" error)
User hit: `Model did not return JSON. (done_reason=stop, 1943 tokens)` during a slide-edit turn. The model produced VALID-looking ops JSON (the update_slide patch for slide 9 with OmpSs/StarPU content is visible in the error's first-300-chars) but the cloud transport's json_object parse still failed — likely markdown fences, trailing/leading chars, or a non-strict provider guarantee.
- Fix: harden the JSON extraction before the throw (strip ``` fences, find the first balanced JSON object/array, tolerate trailing prose), and/or raise MAX_REPAIR (turn.js:19, currently 2) for the cloud transport where a retry is cheap. The error message should also show the repair attempts so it's diagnosable.
- The content was fine — the parse is the failure, not the model. This is the same class as the earlier truncation bug (ollama.js:601).

## B. Resumable generation (the "refreshing restarted from slide 1" problem)
User refreshed mid-run → the SSE connection died, the run's finalize never fired (status stuck "planned" despite deck.yaml being complete), and re-approving started a NEW run from scratch.
- Fix: checkpoint the run per slide (deck.yaml is already written incrementally — the pipeline writes it as slides land). On connection drop / reload:
  1. The UI should detect an in-progress run for the deck and offer "resume" (continue writing remaining slides) or "the deck is already N/M written — open it" instead of a fresh generation.
  2. A finalize watchdog: if deck.yaml exists and is complete but status != ready and no active run, offer "finalize this deck" (flip to ready, run trim + grounding + render) rather than hanging on Working….
  3. The SSE client should reconnect (with the server deduping/continuing the same run id) instead of the refresh abandoning it.

## C. Minor: the 3 text-floor flags in the user's deck
Slides 6 (framework), 10 (stacked-list), 14 (diagram) flag "would need <floor>pt". Run a density sweep / trim on the deck (or the finalize watchdog in B does it) before the user presents.

## E. THREE slide-quality rules from the user's HPC deck review (00:15) — the "we don't want this" set
The user reviewed slides of the generated HPC deck (recent-trends-in-mixed-mode-programming-for-3) and flagged three recurring failure classes, all CONFIRMED in deck.yaml:

### E1. Empty charts must never ship — planner must not pick chart without real numbers
Slide 16 "Papers, Not Numbers, Carry the Evidence": the writer was honest (research had no speedup figures) and emitted `chart: { kind: bar, series: [{ values: [] }] }` with the standfirst literally saying "the chart is intentionally empty". Honest but un-presentable — a presenter cannot talk to an empty axis.
- Fix: planner/chart-eligibility rule — the data-affinity steering must ALSO say "no numeric data → do NOT choose chart/scatter/radar/stacked-bar; choose a qualitative type (framework/cards/compare/flow) that presents the papers themselves." Empty charts become impossible to emit. The schema could also require `series[].values.length > 0` for chart types (validation error otherwise).
- Re-sweep this deck after the fix: slide 16 becomes a qualitative "evidence from papers" slide (e.g. a cards slide listing Rabenseifner et al. / Augonnet et al. findings).

### E2. No mid-sentence ellipsis truncation — over-cap fields must be REWRITTEN, not cut
Slide 11 "Decompose, Express, Schedule, Overlap" step 2 body: "Task inputs and outputs form a directed acyclic graph (DAG) the…" and slide 6 concept body: "MPI ranks own NUMA domains, OpenMP…" — the writer overfilled the field caps (flow step body ≤120, framework concept body ≤120) and the validator/trim cut them with "…", leaving half-sentences.
- Fix: a post-write FIELD-LENGTH pass that detects any field over its schema cap and sends a targeted REWRITE request ("rewrite this field as one complete sentence ≤ N chars — no ellipsis"), with a couple of repair attempts; only if rewriting fails does the trim run. An ellipsis mid-sentence is worse than a shorter complete sentence — the writer must never ship "the…".
- Also verify the catalog's cap statement reaches the writer effectively (the caps are in the prompt but the writer still overfills — check whether the prompt lists caps per field or only per type).

### E3. Framework/diagram layouts must not hide text under overlapping shapes
Slide 6 "One Node, Four Parallel Levels": the framework layout draws overlapping shapes (the black oval overlapping the boxes) and text sits hidden behind the overlap — "structurally wrong" per the user.
- Fix: rework the framework (and diagram) layout overlap handling — text zones must never sit under another shape; either no overlap, or a deliberate backdrop/inset so all text is readable. Include slides 6/10/11/14/16 of this deck in the verification (re-render + mimo read).

### E4. (User note) On "Dense" some slides still read too thin
Even at dense density, a few slides carry little content. The TYPE_BUDGETS enrichment (round 3) helped; check the remaining thin types against their budgets and raise the floor where the layout invites more.

## D. SearXNG hardening (DONE tonight, commit b2f7362 + 7535d45)
DuckDuckGo + Startpage bot-detect a local instance → CAPTCHA exceptions aborted whole search steps, surfacing as "SearXNG unreachable". Both disabled in docker/searxng/settings.yml; google/bing/brave/wikipedia/arxiv/crossref/semantic-scholar remain. NOTE the file's working-tree ownership churns to systemd-network on `--force-recreate` — the repo file is authoritative; a plain `docker restart forge_searxng` re-reads the mount without re-owning.

Model discipline: flash codes ONLY, mimo vision ONLY, no qwen. All specs durable in ~/.hermes/scripts/prompts/.
