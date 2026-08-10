# Traps

Cross-cutting failure modes that cost real time, and will again. Per-feature
findings live in `docs/ROADMAP.md` under each item's **Learned** block; this file
is for things that bite from any direction.

---

## Rendering and output

**PowerPoint's autofit does not exist until a human opens the file.**
OOXML stores an autofit *intent*; the shrink is computed by the client at open
time. A deck can look perfect in LibreOffice and overflow on the projector.
Sizing must be baked in at generation time — that is why `src/fit.js` exists and
why it only ever shrinks. Never "fix" overflow by trusting an autofit flag.

**A written `.pptx` proves nothing.** `pres.writeFile()` succeeds for decks with
text running off the canvas, invisible-on-invisible colour pairs, and empty
charts. The only real check is `src/preview.js` plus actually looking at the
image. Treat "the render succeeded" as meaning the file parsed, nothing more.

**pptxgenjs wants bare hex.** `#C05D4E` silently misbehaves; pass `C05D4E`. Use
`hex()` from `src/theme.js` rather than stripping inline — it also drops the
alpha channel from `#RRGGBBAA` tokens, which OOXML cannot express as a fill.

**Single-series charts must not vary colour per bar.** `varyColors` defaults on
and encodes a distinction that does not exist, while pulling low-contrast
palette entries (`rule`, `ink_muted`) onto the plot where they vanish. Only pie
and doughnut should vary.

**LibreOffice headless silently no-ops.** Two separate traps:
- `-env:UserInstallation` needs an **absolute** `file://` URL. A relative path
  fails with a bare non-zero exit and no message.
- Without a private profile it does nothing at all when a desktop LibreOffice is
  already running in the session — no error, no output file.
`--outdir` resolves against soffice's cwd, not the caller's, so pass absolutes
throughout.

---

## Brand assets

**Assume supplied logos have no alpha.** The crest arrived as an opaque image
with heavy white padding — invisible as a problem on light themes, a white box
on every dark one. `tools/prep-brand.mjs` keys by *saturation* rather than a
lightness threshold, so antialiased edges survive; a hard threshold produces a
jagged cutout.

**Keying is not enough for dark backgrounds.** The crest's wordmark is dark
navy; transparent or not, it disappears on dark. The fix is a single-colour
reversed ("knockout") variant, selected by background luminance. Any new mark
needs the same treatment.

**Chrome colour must derive from the painted background, not the palette.**
`ink_muted` is only correct on the standard page. Title slides and section
dividers deliberately break out of it, so the footer and crest pick their
variant from the background the layout actually painted.

---

## Fonts

**Google Fonts CSS2 content-negotiates on User-Agent, and the intuition is
backwards.** Sending *no* UA returns clean `.ttf` urls. Spoofing an old browser
— the obvious move to avoid woff2 — returns extension-less `/l/font?kit=…` urls
that fontconfig silently refuses to index.

**A large `fc-list` count means nothing.** The machine reported 729 families and
contained none of the typefaces any design system needs. Verify with
`fc-match "<name>"` returning the name back rather than a fallback.

---

## Dev environment

**Never read `process.env.PORT` in the API.** Dev harnesses inject it for the
*frontend*. The API claims it, Vite quietly moves elsewhere, and the browser
hits Express and shows `Cannot GET /` — which looks like a routing bug and is
not. Use `FORGE_API_PORT`.

**Vite resolves `root` against the cwd, not the config file.** Running
`vite --config app/web/vite.config.js` from the repo root serves nothing at `/`
until `root` is set explicitly in the config.

**Express does not hot-reload.** After editing `app/server/`, a stale process
serves the old routes and new endpoints 404 for no visible reason. `npm run api`
uses `node --watch`; if the API is started another way, restart it manually
before concluding an endpoint is broken.

---

## Frontend

**Relative state updates in keyboard handlers must use the functional updater.**
Reading the current index from an effect's closure loses keystrokes: several
`keydown` events fire before React re-renders, each computes from the same stale
value, and a held arrow key silently skips items. It behaves correctly under
slow single presses, which is exactly how it survives review. Stepping from
slide 5 with three left presses landed on 4 instead of 2.

**`loading="lazy"` is not free.** On a grid of small thumbnails it adds an
intersection-observer dependency to save nothing, and in throttled or
non-visible renderers the observer may never fire — so images never load at all
and the page appears broken. Only lazy-load what is genuinely expensive.

**Full-resolution slide plates are not thumbnails.** ~1.5 MP each; a deck of
them will stall a browser tab. Always serve the 480px thumbs in grids and the
full plate only in the lightbox.

---

## Constrained decoding (Ollama `format`, and structured output generally)

Passing a JSON Schema as `format` compiles it to a grammar and masks any token
that would violate it. Output is guaranteed to *parse*. Everything below follows
from what that guarantee does not cover — and this applies equally to OpenAI's
structured outputs and Anthropic's tool schemas, it is not an Ollama quirk.

**It guarantees shape, not sense.** A deck titled ".NET Core 6.0 release notes"
satisfies the schema perfectly. Constraint cannot supply knowledge.

**A large grammar degrades output.** Every masked token pushes the model to its
second or third choice; enough of those and it leaves the distribution entirely.
A schema unioning all 28 slide fields produced, in escalating order: token loops
(`_er_er_er…`), infinitely nested `{"patch_details":{"patch_details":…}}`, and
then confabulated content. Those were not three bugs. They were one cause.
**The fix is a smaller schema, not better sampling parameters** — `repeat_penalty`
and `top_k` were tried first and changed nothing.

**Never declare a bare `{type: "object"}`.** With no `properties`, the grammar
permits arbitrary keys nested arbitrarily deep, and a small model will fall in
and stay there. Enumerate the key space even when values stay polymorphic.

**Never declare an unbounded array.** Without `maxItems` the grammar never
*requires* a closing bracket, so generation runs to the token ceiling. A
six-slide outline consumed 8192 tokens this way. Bound every collection and put
`maxLength` on every string.

**Inline every `$ref`, at any depth.** Ollama has no document to resolve
against; one surviving `#/definitions/…` — including inside `items` — fails the
whole request.

**Constrain the op set to what the state allows.** Against an empty deck the
model reliably emitted `update_slide`, then failed to recover through two repair
rounds. Removing those ops from the enum made the mistake unrepresentable, which
beats explaining it in the prompt.

**Always capture `done_reason`.** `length` means truncated; anything else means
the model genuinely produced that. Without it, a response cut off mid-JSON is
indistinguishable from malformed output, and the obvious fix (raise
`num_predict`) is exactly wrong when the real cause is a runaway grammar.

**Model choice matters more than prompt engineering here.** On an identical
outline prompt: `qwen3-coder:30b-a3b` 11.8s and coherent; `qwen3.6:27b` 210s and
coherent (dense, not MoE); `gemma4:26b-a4b-it` structurally valid but prose
degenerated into `im_er_al`/`enlarge-enlarge` fragments. JSON is in-distribution
for a coder model, so the grammar rarely has to mask its next choice. Try
swapping the model before tuning anything else.

**Decompose rather than constrain harder.** Two stages — a three-key outline,
then one slide per call constrained to that single type — replaced a single
large call and fixed the degeneration, the truncation and the completeness
problem at once. Small grammars are the whole trick.

## Session / tooling

**A vision model saying "clean" proves nothing until you verify it can see.**
`qwen3-vl:8b-thinking` reported every rendered slide "clean" on a deck the user
reported as overlapping — a false-clean verdict, not a check. It also returned
empty content on some calls. On the same images, `gemma4:26b-a4b-it-q4_K_M`
(25.8B) gave detailed verbatim read-backs of headlines, and a subscription
model (`opencode-go/mimo-v2.5`) caught a wrap-and-overlap the pixel analysis
also missed initially. When a vision model's verdict contradicts a human's,
distrust the model first, and prefer the biggest model available for QA.

**Pixel analysis of text bands is a useful check but has false positives.** A
column-strip heuristic (dark rows → bands → gap ≤ 2px flagged) correctly found
the wrapped card title, but also flagged the eyebrow-above-headline (which is
the intended design) and card-boundary adjacency. Never trust it as the sole
verdict; use it to *target* a vision model at a suspect region.

**Layout text that is not fit-scaled will wrap into the element below.** In
`src/layouts.js`, `cards` and `compare` titles had no `fitScale` — a title long
enough to wrap rendered its second line over the body. `stats` stacked
value/label at fixed offsets with no fit, so a wrapping value hit its label.
Every text element in a stacked layout must either be fit to its box or reserve
space for the real rendered line count. Fit is shrink-only: it may look small,
it must never overlap.

**A `fitScale(…, 99, …)` height never returns < 1.** Used to mean "detect
whether this wraps" it cannot work — with a huge height the height constraint
never binds, so scale stays 1 and the wrap is invisible. To detect wrapping,
count lines at the fitted size (`lineCount` + `measure` with a width safety),
don't probe with an unbounded height.

**The opencode-vision plugin's delegation is disabled when the configured main
model can see images.** It registers `vision-*` subagents only when the config
`model` is not vision-capable; setting `model: ollama/qwen3-vl:8b-thinking`
made it register nothing while the session actually ran a text-only model.
Also, registering a model in provider config needs `modalities.input: ["image",
"text"]` (not just `attachment: true`) for the runtime to accept image file
parts — `attachment` alone surfaces it in the picker but the read tool still
rejects the image.

**The browser screenshot tool can fail mid-session and stay failed.** It timed
out on every call for the back half of one session, including on pages it had
captured minutes earlier, with no console errors and a healthy server. Fall back
to `read_page`, `javascript_tool` and direct `curl` against the API — they stay
reliable. Do not conclude the app is broken from a screenshot timeout, and do
not claim a UI was visually verified when it was only checked structurally.

**Validate against the rendered artefact, not the data structure.** Valid YAML,
a passing schema, and a written file are three checks that all pass while the
output is unusable.
