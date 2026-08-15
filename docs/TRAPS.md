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

**A schema-valid slide can still be visually broken.** The placeholder fallback
for a failed model write ships a headline that *passes* `validateDeck` — and a
hard 60-char `slice` of the purpose rendered as a headline clipped mid-word at
the right edge. Validation proves the fields exist, never that the text fits.
The vision critic caught it; no unit test could have. Rasterise and look.

**pptxgenjs wants bare hex.** `#C05D4E` silently misbehaves; pass `C05D4E`. Use
`hex()` from `src/theme.js` rather than stripping inline — it also drops the
alpha channel from `#RRGGBBAA` tokens, which OOXML cannot express as a fill.

**Single-series charts must not vary colour per bar.** `varyColors` defaults on
and encodes a distinction that does not exist, while pulling low-contrast
palette entries (`rule`, `ink_muted`) onto the plot where they vanish. Only pie
and doughnut should vary.

**Never derive a text position from `heightOf`/`lineCount` arithmetic.** The
fitter's `measure` estimates width as a fraction of the em (it multiplies the
per-em advance by the em size — it used to forget the em factor, which made it
~5.7× pessimistic against real inches and was the root cause of "the font is
usually small"; that is fixed). Even accurate now, its estimates are
heuristics, and a layout that computes its own y-offset from `heightOf` output
(e.g. "body ends here, so the caption goes there") drifts off the slide: the
big-number caption landed exactly on the chrome footer. The rule: anchor a
stacked block to the content box bottom and fitScale the text into the fixed
budget between anchor and label — let `fitScale` own the arithmetic, never
trust its raw numbers as inches.

**LibreOffice headless silently no-ops.** Two separate traps:
- `-env:UserInstallation` needs an **absolute** `file://` URL. A relative path
  fails with a bare non-zero exit and no message.
- Without a private profile it does nothing at all when a desktop LibreOffice is
  already running in the session — no error, no output file.
`--outdir` resolves against soffice's cwd, not the caller's, so pass absolutes
throughout.

**"One line at any size" IS the small-font bug.** A stacked zone (card title,
stat label) that shrinks text to fit a fixed one-line guess renders long titles
at ~8pt — the exact complaint "the font is usually small". With a readable
floor the shrink is refused and the wrapped text collides with the body below.
The honest fix is to size the zone to the content's real rendered line count
and push the following element down, not to keep shrinking.

**A font floor is a shrink stop, never a grow.** `min(nominal, floor)` means a
compact theme's 11.5pt mono body stays 11.5pt — the floor only prevents the
fitter from going *below* it and flags when content cannot fit there. Growing
text past the theme's design breaks the shrink-only contract and every layout
budget that assumes it.

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

**Do not trust a supplied logo's alpha channel — rebuild it from RGB.** One
real crest shipped with every pixel at ~14/255 (6%) alpha: the viewer composite
it against white so it looked normal, and it was a ghost on every slide. The
old keying kept the source alpha for saturated pixels, so the defect survived
normalisation. The keyer now treats alpha ≤ 0 as a real cutout and rebuilds
everything else from colour (saturated → opaque, neutral → lightness). This
turns "viewer looks fine, slide looks broken" into the same bug it was: a
broken alpha in the source.

**Chrome colour must derive from the painted background, not the palette.**
`ink_muted` is only correct on the standard page. Title slides and section
dividers deliberately break out of it, so the footer and crest pick their
variant from the background the layout actually painted.

**pptxgenjs silently drops unknown chart options.** `barStacked` was never a
real option — the correct key is `barGrouping: "stacked"` — but the chart
wrote `grouping val="clustered"` and nothing complained, so every "stacked"
chart rendered as grouped bars. Options a library does not recognise fail
silent. The only way to know a chart's grouping is to unzip the pptx and read
the `<c:grouping>` element, which is now a permanent regression test.

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

**OpenAI-compatible `json_object` is a weaker guarantee than Ollama's grammar.**
Two separate traps, both hit on the cloud path:
- The provider rejects the request with a 400 unless the prompt contains the
  word "json" — many of this system's prompts (the report planner, for one)
  never mention it. The transport prepends a "Respond in JSON only" system
  message when `format` is set.
- `json_object` guarantees only that output parses, never that it matches the
  schema. The report section writer happily returned `{"introduction":[…]}` where
  the grammar demanded `{"paragraphs":[…]}` — silent, schema-shaped-but-wrong
  output. The transport now spells the schema out verbatim in that system
  message so a strong model can hold the small per-call schemas in context.
  Keep cloud-side schemas small; a large one degrades the same way a large
  grammar does on Ollama.

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

**Never put `maxLength: 2000` (or more) on a string item — Ollama's grammar
dies there silently.** `maxLength: 1999` works; `2000` is the exact breaking
point, and the failure looks nothing like a grammar error: Ollama simply stops
enforcing the grammar and the model free-writes its preferred shape (a coder
model reliably emits `{"section": …}` instead of the constrained keys), which
then fails JSON parsing or your own validation. No error is surfaced anywhere.
The deck schema's own fields cap at 320, which is why the deck writer never hit
it; the first report generator capped full-depth paragraphs at 2000 and every
section "failed" until the cap dropped to 1500. Guard with a test that walks
every generated schema asserting no `maxLength >= 2000`.

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
`num_predict`) is exactly wrong when the real cause is a runaway grammar. The
transport now automates that fix with a guardrail: a `length` truncation
retries the same request with the cap doubled, but only up to
`defaults.num_predict_bump_ceiling` — so a legitimate large output gets room
while a runaway grammar still fails cleanly once the ceiling is reached. A
bump is bounded by construction; a hand-raised `num_predict` is not.

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

**A silent drop hides behind validation.** When a per-slide call emits no
usable op (an empty list, or one the filter discards), `applyOps` is a no-op
and the *unchanged* deck still validates — so "the deck is still valid" reads
as success while a slide has quietly vanished and the promised count shrinks.
A model call that throws (truncated JSON) skips the same way through a catch.
Success for an append loop must be defined as "a NEW valid slide appeared",
with empty/exception attempts retried and then degraded to a placeholder; never
test "the deck validates" and assume it means "this slide landed".

**A placeholder that validates is the worst kind of bug.** "Details in the
full briefing." passed the schema, looked like a deliberate writing choice,
and shipped in committed decks — no validator could catch it because it was
valid. A degraded slide must be recognisable by its CONTENT (marker text a
real writer never emits, matched across historical phrasing) and gated at the
one place a deck ships: the render. A "needs regeneration" badge plus a
per-slide regenerate affordance make it visible to the human too, and
matching by marker text (not a flag field) is what lets old decks be swept.

**Coherence and grounding answer different questions.** Grounding checks "is
the fact in the research"; coherence checks "does this slide earn its place in
THIS deck". A perfectly grounded slide can still drift — a flight-attendant
demographics chart inside a first-impressions deck. The second check is a
reading-comprehension call, so it needs a model review with a small findings
schema, and the fix must name the exact reframe or the rewrite drifts again.

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

**SMTP commands without CRLF are invisible to the server.** `socket.write("EHLO …")`
with no line ending sits in the server's buffer and the dialogue hangs on a
timeout with no error naming the cause. Every SMTP command needs `\r\n`; the
DATA payload is the one line that already carries its own terminators.

**A multiline SMTP reply must be accumulated whole before the state machine
advances.** EHLO advertises its capabilities on `250-…` continuation lines;
checking only the final `250 ` line misses STARTTLS and silently falls back to
plain AUTH, which a port-587 submission server then rejects. Parse the complete
reply, then decide.

**pptxgenjs has no gradient fills, whatever the docs imply.** `fill: { type:
"gradient", stops: […] }` writes a shape with no fill element at all — the
option is silently dropped and the shape renders blank. A background layer must
be built from native shapes + transparency, or a pre-rendered plate. Verify any
pptxgenjs feature by unzipping the output, not the README.

**A contact sheet that renders the wrong slide proves nothing about
backgrounds.** The specimen deck's first slide is the dark title screen; a
themesheet using it makes every pale theme look dark and indistinguishable. For
a "do the themes differ" audit, use the first standard content slide, where the
background layer actually paints.

**`pkill -f <pattern>` matches the invoking shell.** When the pattern appears
in the shell command line itself, the shell kills itself and the command hangs.
Kill by exact PID, or use a pattern the shell line does not contain.

**Theme shadow `opacity` is 0–1 in pptxgenjs.** `opacity: 100` (reading as
percent) writes an off-chart alpha (~10000%) that PowerPoint clamps
unpredictably and the hard-shadow look is lost. Values above 1 are a silent
bug; the valid range is 0–1.

**`loading="lazy"` makes a broken-image check lie.** Off-screen lazy images
never load in a small headless viewport, so a screenshot pass reports them
"broken" when they are fine. Scroll the page through its full height before
counting `naturalWidth === 0`, or check the served HTTP status directly.

**A vision model's "distinguishable" verdict is only as good as the sheet it is
shown.** A 38-theme contact sheet at one-per-row puts ~300px per theme; two
near-twin themes (corporate-alegria vs swiss) passed a glance and only a
per-pixel diff surfaced them. Use the cheap numeric scorer to *surface* near
pairs, then point the vision model at exactly those two at readable size.

**Async state initialised `true` hides a broken fetch.** The register-tab
suppression silently did nothing because the effect's `.catch()` set the state
but the success path never did — the resolution value was discarded. Guard both
branches of the promise.

**A containerised app whose config dir is an empty volume 404s on boot.** The
compose file pointed `FORGE_CONFIG_DIR` at `/data/config`, which starts empty,
so `identity.example.yaml` was missing. An entrypoint that seeds committed
templates only when absent turns a fresh deploy from broken to bootable and
stays idempotent across redeploys.

**Validate against the rendered artefact, not the data structure.** Valid YAML,
a passing schema, and a written file are three checks that all pass while the
output is unusable.
