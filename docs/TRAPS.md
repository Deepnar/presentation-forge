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

**A measurement in the wrong unit is invisible to every check built on it.**
`measure()` read the type token's `tracking` as a percentage of the em while
`textStyle` passed the same number to pptxgenjs as `charSpacing`, which OOXML
specifies in POINTS. The two disagreed by a factor of `100 / size`, so the
error was worst exactly where tracking is heaviest: a 10pt `eyebrow` at
`tracking: 1.6` was measured with a tenth of the letter-spacing it renders
with. Compounding it, `ADVANCE` is a *lowercase* average and `eyebrow` sets
`transform: upper`, so every letter of a tracked all-caps label was
under-counted twice. (Fixed 2026-09-03: `track = tracking / 72`, plus an
`UPPER_FACTOR` applied when the token transforms to caps.)

The visible result was a label the fitter believed fitted one line and that
LibreOffice then wrapped: `matrix`'s rotated y-axis read `HIGH / IMPACT` and
`LOW / IMPACT` on `swiss-international` with `themematrix` completely clean.
That is the part worth keeping — **the sweep asked the same wrong `measure` the
layout did**, so every check built on the fitter agreed with it. Under-measuring
does not report as a failure; it reports as success and hands the wrap to the
renderer. Only rasterising and looking finds it, and the before/after render of
one slide is what proves the fix rather than a passing suite.

Correcting it widened every tracked measurement, and the effects were the ones
predicted: `capfit` surfaced two caps it had been hiding
(`branching-flow.steps[].title`, 19 declared against 15 seatable) and
`capstress` rose from 12 joint-at-caps reports to 17. Those extra reports are
truthful rather than new breakage — each was rendered and read correctly, the
fitter simply now knows the real width and clamps at the floor instead of
overflowing past it.

**A written `.pptx` proves nothing.** `pres.writeFile()` succeeds for decks with
text running off the canvas, invisible-on-invisible colour pairs, and empty
charts. The only real check is `src/preview.js` plus actually looking at the
image. Treat "the render succeeded" as meaning the file parsed, nothing more.

**A schema-valid slide can still be visually broken.** The placeholder fallback
for a failed model write ships a headline that *passes* `validateDeck` — and a
hard 60-char `slice` of the purpose rendered as a headline clipped mid-word at
the right edge. Validation proves the fields exist, never that the text fits.
The vision critic caught it; no unit test could have. Rasterise and look.

**A background assigned after `addChart` is silently dropped.** pptxgenjs
numbers a background image's relationship without counting chart
relationships, so `slide.background = { data }` after `addChart` is written as
a *second* `rId1`. The reader resolves the background blip to the chart part,
paints nothing, and the slide rasterises white — which on a dark theme means
near-white text on white. Every chart slide in every plate theme was doing
this. Assign the background BEFORE the layout draws; `paint()` in
`src/layouts.js` is what keeps a full-bleed layout from overwriting it.

**pptxgenjs numbers every paragraph "1."** `bullet: { type: "number" }` writes
`<a:buAutoNum startAt="1"/>` on *each* paragraph rather than once for the list,
so the count restarts at every item and a four-point list renders 1. 1. 1. 1.
Pass the running position — `bullet: { type: "number", startAt: i + 1 }` — and
carry it across column splits. `bulletOptions()` in `src/composition.js` is the
one place that should know this.

**pptxgenjs wants bare hex.** `#C05D4E` silently misbehaves; pass `C05D4E`. Use
`hex()` from `src/theme.js` rather than stripping inline — it also drops the
alpha channel from `#RRGGBBAA` tokens, which OOXML cannot express as a fill.

**Single-series charts must not vary colour per bar.** `varyColors` defaults on
and encodes a distinction that does not exist, while pulling low-contrast
palette entries (`rule`, `ink_muted`) onto the plot where they vanish. Only pie
and doughnut should vary.

**Any check that reads the rasterised page needs the real fonts.** LibreOffice
substitutes a wider face when a theme's typeface is missing, so the fitter's
metrics stop describing what was drawn: `npm run textcheck` reported
"Acknowledgements" broken mid-word on `sci-fi-hud` in CI and nowhere else,
because the CI test job installs LibreOffice and Poppler but not the 27 theme
families. That is a fact about the machine, not the layout. `substitutedFaces()`
asks fontconfig and the check skips rather than reporting a defect the product
does not have — and the CI image job is what asserts the fonts really install.

**A shape is not its bounding box.** A rhombus's largest inscribed rectangle is
HALF its bounding box; a circle's is its diameter over root two. The
`branching-flow` diamond and both hub circles (`cycle`, `concept-map`) gave
their labels a box as wide as the shape, so the text ran out through the
slanted edge or the curve — and none of them grew for a label that did not fit.
Size the shape from its label, and place the label in the inscribed box.

**A budget nobody computed is a constant that decides whether text survives.**
Every entry on the fit debt list turned out to be one: a 0.26in body budget
three thousandths of an inch short of a line, a card title budgeted one line
whatever it held, a figure reserving a flat 2.1in out of a box a speaker note
had just shortened. Measure one line at the size it will really render at —
the fitter never shrinks past its floor and never grows a theme already below
it — then divide the box among its parts and spend the slack deliberately.

**A layout that drops content to satisfy the fitter has not been fixed.** It has
been made quieter. Tightening the `flow` spine's constants stopped its bodies
shrinking below the floor and started them dropping instead: a reported failure
became fifteen words of silent loss, which only the text check caught.

**The floor only guards text that was actually fitted.** `src/fit.js` reports a
floor hit from inside `fitScale`/`fitOneLine`. Text drawn at a hardcoded scale
never calls them, so it is not merely unfitted — it is *unreported*: the
`framework` ring drew its element bodies at `scale: 0.9` and a real 130-char
body ran out of its card and under the central ellipse, with a clean fit sweep.
A fixed scale in a fixed-height box is the signature; grep for `scale: 0.` in a
layout before trusting its sweep.

**A deck is budgeted against one theme and rendered in thirty-four.** The
field-length pass rendered the deck in the theme it happened to name. On a real
deck that flagged nothing, while six of seventeen slides lost text in some
other theme — a narrower measure is a different budget, and the content only
has to fail one of them to be broken for whoever picks it. Anything that asks
"does this text fit" about a *deck* has to ask it across every theme;
`themeMatrix({ deck })` is that question and costs milliseconds.

**A word wider than its column breaks in the middle of itself, silently.**
The fitter budgets *height*: it shrinks until the wrapped text fits the box, so
a single word too wide to fit the measure passes the fit and then hyphenates
itself at the raster ("Acknowledgemen / ts"). Nothing reports it, because every
fragment fits. Any layout that narrows a column has to fit the longest word to
the measure as well — and with `fitOneLine`'s default safety margin, because
`measure` estimates at 0.55em where real text averages nearer 0.60 and a word
fitted to the nominal width still breaks.

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

**Fit at the size the layout draws, not at the token size.** A layout that sets
a role at a fraction of its token — a chip at 0.85 of caption, a divider
headline at 0.8 of display — must fit against `token x fraction`, because the
readable floor is a POINT size and measuring against a nominal the layout never
uses puts the floor in the wrong place. `Math.min(0.85, fitScale(text, w, h,
theme.type.caption))` reports a floor hit for text that seats perfectly at the
size it really gets: the fitter is answering "does this fit at 13pt?" when the
answer needed is "does this fit at 11?". `fitAt`/`fitAllAt`/`fitLineAt` in
`src/layouts.js` take the fraction and do this.

**A fit budget and the box the text is drawn into must be the same number.**
Three layouts fitted to one height and drew into another — `feature-grid` to
`ch - 1.25` into `ch - 1.48`, `framework` to `cardH - 0.45` into `cardH - 0.58`,
`funnel` to 0.4in and 0.32in into 0.36 and 0.30. The sweep is clean and the text
runs out of its card, because the fitter was asked about a box that does not
exist. When a draw reserves a lead-in above the text, the fit has to subtract
the same lead-in.

**No fitter is ever asked where a shape ENDS UP.** The fit functions answer
"does this text fit this box"; nothing answers "is this box on the slide".
`branching-flow` grew its decision diamond to hold its label, laid the branch
rows out from wherever the diamond finished, and drew the second row under the
speaker-note bar and off the bottom edge — with every label fitting its own
shape and a completely clean sweep. A layout that stacks shapes has to budget
the whole column against `box.bottom` itself.

**When a shape must grow, grow the free dimension first.** The diamond grew
width and height in lockstep, spending the scarce dimension (the column the
branch stack needs) to buy the free one (the margins beside it). "Credit check
passes?" needed one more step of width and no height at all. Same for a
placement preference like `top = Math.max(y, 2.55)`: a constant that centres the
diagram under an ordinary heading must yield when the stack cannot afford it.

**Serve the element the type is NAMED for before the others take the surplus.**
A `branching-flow` is its decision, and the step cards were growing to their
0.7in preference first, leaving the diamond at its floor with a label needing
two lines. Compute what the centrepiece needs, subtract it, and let the rest
divide the remainder — and then actually START it at that height: growing back
up to it in fixed steps stalls one step short whenever the ceiling lands
between two of them.

**An allocation nobody honours is not an allocation.** Splitting a card between
a body and a list of points, then drawing each point at its natural line height
and stacking at that pitch, put four points through two inches of a half-inch
allocation with no fitter saying so. The row height has to be the allocation
divided by the count, and the fit has to be taken against that row.

**Do not fit text the layout will not draw.** `diagram` renders dense graphs
label-only, and still fitted a body into the 0.17in the dense case leaves —
which no text fits, so the type reported a floor hit at EVERY label length from
one character to its cap. Reporting text that never reaches the page is
indistinguishable from a savage cap until you check the length dependence.

**pptxgenjs leaves a 0.1in inset on each side of a text box.** A chip or a pill
sized to its measured text has a fifth of an inch less room than it looks like
it has, so the text wraps and the second line is clipped. Set `margin:` on the
shape when the box IS the text.

**`rotate` turns anticlockwise against screen coordinates.** y grows downward in
the layout, so a heading from `atan2(dy, dx)` has to be subtracted from due east
(`90 - ang`), not added to it. `ang + 90` mirrors the vertical component, which
looks correct for the half of the cases where dx and dy have opposite signs.

**A chord midpoint is not on the ring, and a chord is not a tangent.** The
`cycle` arrows sat inside the loop by cos(pi/n) — nearly a third of the radius
at four steps — and pointed across it. Take the angular midpoint on the ring and
the tangent there; for an ellipse the tangent at t is `(-rx sin t, ry cos t)`,
which is not the chord direction once the radii differ.

**pptxgenjs writes a negative width or height without a word.** A box whose
extent comes out of a subtraction — `mark.w - ornament - gap`, `ch - (ty - y) -
pad` — goes negative the moment the thing it subtracts from is smaller than the
constants. OOXML has no such extent, so what LibreOffice draws is not the shape:
`side-by-side` computed a negative caption height and its title and body were
printed on top of each other, and half of `branching-flow`'s connectors were
drawn from the wrong end on all 34 themes. `src/geometry.js` watches every draw
for this, so it is now reported rather than discovered. Span two points instead
of assuming their order, and clamp anything derived by subtraction.

**A fit budget that is not the box the text is drawn into is a bug in both
directions.** More generous hides an overflow, less generous invents a failure,
and they look nothing alike from a sweep. `before-after` fitted its body against
a flat 1.8in and drew it into 0.94in; the standfirst was fitted against 0.85in,
drawn into 0.75in and advanced 0.72in, so a three-line one landed on the body's
first line. Derive the number once and use it for the fit, the box and the
advance.

**`fitScaleAll` fits EACH member into the height it is given, not the stack.**
Passing a column's whole height means every item may claim all of it and the
total is never measured — `pros-cons` ran a third of an inch under the
speaker-note bar with a clean sweep. Divide by the number of items, and subtract
what the fitter cannot see: `paraSpaceAfter` between paragraphs, and the indent
a bullet marker takes.

**A shared schema field is invisible to anything that reads the type rule
alone.** `headline` and `standfirst` are declared once on the base slide object,
so a walk of `allOf[].then.properties` misses them on all 75 types: the length
pass never budgeted the headline, the trim could never shorten it, and the cap
prober never grew it. Read the base properties as well as the type's own.

**A layout that draws only the fields the fixture happens to carry passes every
check.** Text that is never drawn is never fitted, so no fit sweep can report
it, and it never reaches the raster for a text check to miss. `npm run
drawcheck` marks each field and reads back what was emitted; its second list —
fields the specimen does not populate — is the one nothing else can see.

**A schema cap is not a fit budget, and a type change moves the box.**
`image-text` lets `body` run to 180 characters and draws it in HALF the width a
full-bleed list gets. Converting a `bullets` slide whose four bullets were
comfortable produced overflow on 13 themes with every cap check green. Any pass
that changes a slide's *type* has to re-ask the fit question, because the box
changed even though the text did not.

**Compare fit verdicts by "does it fit", not by "did it get worse".** A type
change also changes which FIELD the fitter names. A slide that failed on
`bullets` and now fails on `body` has an identical problem count and is no less
broken, so a count comparison scores the regression as neutral. It also costs a
baseline sweep that the direct test does not need.

**A whole-deck validity gate refuses everything on real decks.** Real generated
decks arrive slightly invalid — `loadDeck` warns on an over-long field rather
than refusing, so a deck ships with schema errors and renders fine. Any pass
that gates its own edit on `validateDeck(deck).ok` therefore reads somebody
else's pre-existing errors as its own fault and refuses to act, on every real
deck and on no fixture. Compare the errors on the slide you touched.

**A fixture without a `speaker_note` fits things a real slide cannot.** The note
reserves 0.7in off the content box and every generated slide has one. A
fit-gate test written without it PASSED against a completely broken gate. Same
blind spot `themematrix --notes` exists for, met from the other direction: the
question to ask a fixture is what it does NOT carry.

**A schema cap will quietly decide content that has to be exact.**
`attribution.name` caps at 30; "National Renewable Energy Laboratory" is 35, so
the credits slide rendered "National Renewable Energy Lab…" — which is not an
attribution, on a slide whose only job is to attribute. The slide validated, the
tests passed, and the object read correctly; only the rasterised page showed it.
When a field carries something that must survive intact — a name, a licence, an
identifier — check it against the cap it will actually be written into, and move
it to a roomier field rather than letting the clip decide.

---

## Third-party APIs and outside data

**A wired call site is not a working feature, and it reads as one.**
`src/ai/images.js` existed for weeks, was imported by `src/ai/pipeline.js`, was
called in `finalizeDeck`, and returned an empty array on every run — its only
live source produced results whose licence it could not read, and its fallback
host had been retired. Two sessions of planning recorded the feature as
"unstarted", which is the *cheaper* state: an absent module gets built, whereas
a present one gets trusted. Before planning any integration, grep for the seam
it plugs into and run the existing thing once.

**Verify a documented API by calling it. Docs describe the past.**
Two upstream facts sank a design that had been written from documentation, and
neither is discoverable by reading code: `source.unsplash.com` (the Unsplash
Source API) is **retired and answers 503 to everything**, and **SearXNG
normalises the licence out of every image result row** — including its own
`openverse` engine, whose upstream states it. One `curl` each, at design time,
is the whole cost.

**Aggregators drop the fields you are aggregating for.** SearXNG image rows
carry `img_src` and `title` and nothing about rights. If a field is the *reason*
for the integration, confirm it survives the layer you are reading it through,
not just that the upstream has it.

**Search APIs AND their terms, so a descriptive phrase returns nothing.**
Openverse: `"electrolysis"` → 240 results, `"electrolysis cell"` → **0**,
`"a diagram of the electrolysis cell"` → **0**. A model writes phrases, so
passing one through verbatim is a silent no-op that looks like "no results
exist". Widen in defined steps and stop at the first rung that lands — and the
word that most often breaks the query is the one naming the KIND of picture
(`diagram`, `photo`, `schematic`), not the subject.

**Read the rate limit off the response, not off the docs.** Openverse
anonymously allows 20/min and 200/day and reports the remainder in
`x-ratelimit-available-anon_sustained`. A local counter cannot know what other
runs on the same box already spent; the header can.

**Wikimedia sheds load with a 503 under its own name.** `{"httpCode":503,
"httpReason":"upstream connect error or disconnect/reset before headers. reset
reason: overflow"}` on a request that succeeded a minute earlier. Retry with
backoff, and honour `retry-after` — a single attempt reads as "this API does not
work".

**Name the file after its bytes, never after its URL or its `content-type`.**
pptxgenjs derives the OOXML relationship type from the file *extension*, so PNG
bytes written to `.jpg` produce a deck that writes without complaint, passes
every check, and shows a broken picture when a human opens it. Sniff the magic
bytes. The same check catches an HTML error page served as `image/png`, which is
the ordinary failure shape for a hotlinked asset.

**A cache that stores bytes but not provenance loses the provenance.** The
supply's cache hit returned the file and `credit: null`, which would leave a
CC BY image in a deck with its attribution nowhere. Resume, re-render and the
critic pass all re-run the supply, so the cache hit is the NORMAL path, not an
edge case — whatever the first run learned has to be readable by the second.

**A record nothing reads is a record that does not exist.** The supply wrote
`CREDITS.md` and `credits.json` correctly for weeks and no surface mentioned
either, so every CC BY image was, in practice, uncredited. Writing the file felt
like discharging the obligation and did not. Ask where the obligation is
actually met — for a deck that is exported and emailed, only a slide inside the
`.pptx` meets it, because every other surface stays behind in the app.

**Decide which way configuration and credentials each resolve, and write it
down.** This codebase had both directions already — `config/hosted.json`
overriding `FORGE_HOSTED`, and API keys resolving env-first — with nothing
naming the distinction and an admin caption asserting the opposite of what the
code did. The rule that holds: *configuration* should be changeable at runtime,
so stored wins; *credentials* should be owned by the deployment, so env wins,
because rotation must not depend on remembering to clear a database row. Either
choice is defensible; an unstated one produces a deploy that silently does
nothing.

**A cache can be at its worst exactly when it is needed most.** The Auto health
probe was cached stale-while-revalidate with the right reasoning written above
it — "the probe takes twenty seconds precisely when the news is bad" — and the
reasoning had a hole where the cache was empty. On the first load after a
restart there is nothing stale to serve, so the request awaited the full 20.6s,
on the first page an operator opens when the gateway is down. When adding
stale-while-revalidate, write the cold path first: it is the one that runs when
the system is unhealthy.

**A dashboard number is a claim, and a wrong one survives because nothing
contradicts it.** The admin Storage card summed `out/deck.pptx` and reported a
box holding 79 MB as holding 23.8. Nothing failed, no test covered it, and the
deployment doc told the operator to check storage with `du` instead — routing
around the panel rather than fixing it. When a surface states a fact, verify it
against the thing it describes at least once; and measure before quoting a
multiple, because the first measurement of this one swept in a 608 MB specimen
cache and was wrong by 9x in the direction that sounded worse.

**Single-threaded is not the same as atomic, and the difference is one
`await`.** The Auto quota checked, awaited, then recorded — and held the cap
exactly under 30 simultaneous HTTP requests, because everything between the two
calls is synchronous, so the pair spans one microtask and finishes before the
next request's I/O event is dispatched. That safety is real and entirely
undocumented, and it evaporates if two callers reach the check in the same tick
(ten did, and all ten were admitted against a budget of two) or if anyone adds an
`await` between the calls. When a check and the write that acts on it must agree,
put them in one synchronous step rather than relying on the scheduler to keep
them adjacent.

**A state that is true of every healthy object cannot detect a broken one.**
The finalize watchdog fired on `complete` — every plan slide written — and read
it as "an interrupted run left this behind". Every deck that ever succeeded is
complete, so the flag was true for six of seven decks on the box, and the UI
auto-ran a full post-write pass (grounding, a model call, image supply, render,
preview) every time one of their pages was opened. The signal that actually
separates the two cases already existed one file away, in `meta.status`. Before
trusting a derived boolean as a fault detector, ask what it reads on a
completely healthy object.

**Prefer a denylist when the allowlist is the long half.** Classifying image
sources as citable looked like a job for a list of the institutions to trust.
Openverse carries 52 providers and 42 are museums, archives, government agencies
and scientific registers — so the allowlist is 42 entries that silently drop a
legitimate source the day one is added, and the denylist is ten consumer
platforms. Pick the half that is short AND stable, and name the direction it
fails in.

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

**A retained transform on a scroll container breaks every `position: fixed`
overlay inside it.** Any transform — even the identity matrix — turns an
element into a containing block for fixed descendants, so a modal that mounts
inside a scrolled `<main>` positions against scrolled `main` instead of the
viewport: the lightbox rendered above the visible area and the page scrolled
toward the top (measured main.scrollTop 1773 → 628 on open). The cause was
`animation-fill-mode: both` on a view-transition keyframe animating
`transform`: after the animation the element holds the identity transform
forever. Use `backwards` for one-shot entrance animations — it fills only
during the animation — and check `getComputedStyle(el).transform` after an
animation if fixed children misbehave; it returns `matrix(1,0,0,1,0,0)` for a
retained (broken) state and `none` for a clean one.

**Two endpoints returning an object of the same name must return the same
shape.** `/api/auto/status` and `/api/models` both hand the UI an `auto`, and
components read the same field names off whichever one they were given.
`modelChoices()` built its `auto` only when the key was set and then projected
away the `keySet` that proved it — so `!auto.keySet` was true on a box with a
working gateway key, and every hosted user was told "the shared Auto model has
no key on this install" on the empty chat screen, with a button offering to fix
nothing. The same projection dropped `kind`, so a local Ollama printed as
"Auto" instead of "Local · Ollama". Nothing failed: three of the four consumers
read the *other* endpoint and were correct, which is what kept it alive. When a
field is only meaningful because the object exists, send it anyway — the
consumer cannot see the invariant, only the field.

**An HTML entity inside a JS string literal is printed, not decoded.** JSX
decodes entities in *text children*, so `<span>Approve &amp; generate</span>`
renders an ampersand — but the same characters inside a quoted string in a `{}`
expression are just characters, and React escapes them on the way out. The
footer read "The only thing that starts research &amp; planning." on screen.
Grep for `&amp;` and check whether each hit is JSX text or a string literal;
they look identical in the diff and behave oppositely.

**Sizing a box to its content and placing the box are the same decision, and
only the first half tends to get made.** `framework`'s grid takes the SMALLER
of the room a row has and what the card needs — correctly, so a two-element
framework does not become two half-slide-tall cards — and then left all the
leftover at the bottom, rendering a band of content above a third of a slide of
nothing. `flow` did it twice over: titles top-aligned in a zone budgeted for the
deck's longest, bodies top-aligned under a rail in a zone budgeted the same way.
Nothing reports it — every box is on the slide, every field is drawn, every
string fits — so only rendering a real deck and looking at it finds it.

**When the displayed index is computed, advancing the stored one repeats
work.** The briefing shows the question at `effectiveBriefStep(...)`, which
skips whatever a chosen preset already answers, but the answer handler stored
`step + 1`. The two drift the moment anything is skipped, so the next render
re-resolved to a question just answered: with a preset the walk asked "who is
your guide?" twice and the research question six times. The pure skip function
was correct and unit-tested throughout — only its caller was wrong, so no test
of the function could see it. Advance from the index actually shown, and test
the *walk* rather than the step function.

---

## Constrained decoding (Ollama `format`, and structured output generally)

**The grammar constrains the type and the length. It never constrains whether
the characters read as English.** A schema asking for an array of strings is
satisfied completely by strings that are themselves JSON. One generated
report's Theoretical Background reached the `.docx` as three paragraphs: a
serialised `{"text": …, "source": …}` object, the bare schema key
`paragraph_number_indexed_text`, and `]}`. All three are valid strings of legal
length, so nothing upstream could reject them, and they were typeset into a
document meant for submission. Anything a model writes into a *document* needs
a prose check that ajv cannot express — see `salvageParagraph`.

**A field sitting exactly AT its cap was cut by the grammar, not finished by the
writer.** Decoding masks any token that would exceed a `maxLength`, so a model
still mid-sentence when it reaches the cap simply stops: no ellipsis, no error,
and the field is at its limit rather than over it. That is invisible to a check
looking for over-cap fields and to one looking for a trailing ellipsis — which
is why six of nine speaker notes on one deck shipped ending "…creates a 30",
"…and insufficient 1", "…i cells maintain 8". Test `length >= cap` together
with "does not end on terminal punctuation", and fall back to the last complete
sentence (`healCutField`).

**A pass that only runs when a human presses a button will not run.**
`generateFromPlan` and `resumeGeneration` both call `finalizeDeck` themselves,
so "fully written but never finalised" is only ever reached by interruption — a
closed tab, a dropped connection, a restarted server. It was offered as a
banner with a button, which reads like a normal step in the flow rather than
the accident it is, and the deck stays unusable until somebody notices. If the
happy path already runs something automatically, the recovery path must too.

**Wrapping a call in try/catch proves nothing about whether it could throw.**
The two model passes inside finalize looked like the reason a deck could strand
on a dead gateway. They are not: `fieldLengthPass` and `coherencePass` both
catch per-slide and degrade, so the gateway was never the cause. Instrumenting
the failure — a chat stub that counts calls and throws — showed three calls
attempted, all thrown, and finalize completing anyway. Reach for the
instrumented run before the fix.

**`cloudSpec` builds its own spec and silently drops per-role options.** It
does not go through `resolveRole`, so anything added to a role — `thinking`,
`reasoning_effort`, a provider capability flag — has to be carried there
explicitly or it vanishes on exactly the path a HOSTED deck takes, which is the
path least likely to be exercised locally. The reasoning-depth work was
structurally correct everywhere and reached the gateway nowhere until this was
found. When adding a per-role model option, grep `cloudSpec` before believing it
works.

**A guard written for the corpus but applied per request protects nothing.**
`search()` caps hosts at 2 per query to stop a model writing from a single
site — but the research corpus is built from eight queries plus follow-ups and
deduped by URL only, so one domain still supplied three of ten sources. When a
limit exists to shape an aggregate, enforce it where the aggregate is built.

**A field the schema offers is a field the model will fill.** The report's
table was offered on every section at full depth, so the writer put a five-row
data table in the Abstract. The grammar is not a menu of what is *permitted*,
it is a description of what the output looks like — if a section must not carry
something, do not put it in that section's schema.

**`additionalProperties: false` is unavailable on a schema composed through
`allOf`.** Each per-type rule would reject every other type's fields, so the
slide definition cannot use it — which means ANY extra field on a slide
validates. A chat turn wrote a `bullets` array onto a `before-after` slide; the
deck validated, the turn reported "applied 1 change", and the render was
byte-identical. Strip against the type's own field set (`fieldsForType`)
instead of hoping the schema will refuse.

**A hardcoded `min` scale silently overrides the role floor.** `stats` fitted
its value with `{ min: 0.6 }`, which on a 54pt stat clamps at 32pt while the
role floor is 24 — so eight points of legal headroom went unused and the value
wrapped instead of shrinking. Derive the minimum from `floorOf(style)`; a
literal there is a second, invisible floor.

**Repeated bracketed tokens in the source are loop fuel.** PubMed and PMC print
"[DOI] [PubMed] [Google Scholar]" beside every citation; that text reaches the
research notes, and a reference entry ran to 600 characters — the real citation
followed by "[Google Scholar] [PubMed]" twenty times and a dangling bracket.
Stripping the labels removes the artefact and the loop together, because the
loop is made of them.

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

**Instrument the code; do not reconstruct its arithmetic on paper.** Three wrong
guesses in a row at why `feature-grid` dropped below the floor — each one a
plausible reconstruction of the card's geometry, each one wrong — before a
single `console.error` printing the layout's own `cw`, `ch`, `bodyTop` and
`bodyH` settled it immediately. If a budget is failing and the reason is not
obvious in one read, print the numbers first. It is faster than being right on
the second attempt and far faster than being wrong on the third.

**A contact sheet judges structure, not legibility.** At four cells per row a
slide is ~700px, which is enough to see overlap, clipping, fused panels or a
value wrapped mid-number, and not enough to judge contrast: two slide types were
called illegible from a cell and read perfectly at full size. Use the sheets for
structure, `test/contrast.test.js` and `tools/pixels.mjs` for ink, and render
one slide full size before calling anything unreadable.

**A measurement is not evidence until its own failure modes are known.** The
schema-cap prober reported 70 bad fields on its first run and 35 after three
corrections: a cap on an array field caps its ITEMS, so replacing the array with
a string threw at every scale and bisection read that as "nothing fits";
identifiers and asset paths carry a `maxLength` but are not prose, and growing a
node's id breaks the edges naming it; and growing every field together answers a
question about the type rather than about a field. The first table was mostly
measuring the prober's bugs and looked exactly as authoritative as the last one.
Before reporting a sweep, check its extremes — a 1%, a 0% or a 100% is usually
the instrument, not the product.

That rule kept paying. A 0% is usually one specific thing: **the type fails at
every length, so growing a field measures a constant.** `branching-flow`
reported "fits 1" for all four of its fields because its stack ran off the slide
whatever the labels said, and `diagram` still does. `capFit` now tests one
character first and reports that case as a layout failure rather than attributing
it to every cap. A 100% is the mirror image — **the field was never actually
exercised.** Four caps read 100% only because nothing in the renderer measured
them, and the funnel's value read 100% because the prober's prose filler turned
its numbers into words, which switched the funnel to its untapered composition
and never rendered the narrowest bar.

**A filler has to preserve the kind of what it replaces, not only its length.**
A figure cannot wrap at a space and sets in lining digits, so it measures
differently from prose at the same character count — and, worse, a layout may
branch on whether a value parses as a number at all. Growing "42%" into "the
model writes" measured a funnel that does not taper.

**A path walker that returns undefined reads as "no constraint".** `resolvePath`
followed a `$ref` only at the leaf and looked for `[]` under the node rather than
under its `properties`, so `compare.left.title`, `branching-flow.steps[].title`
and `roadmap.phases[].items[].title` all resolved to nothing — and every caller
took that as "this field has no cap". The field-length pass told the model those
fields were uncapped; the prober skipped them; only ajv still knew, by which
point the deck is written. `compare.left.body` was promising 320 characters that
no theme in the gallery could seat. When a resolver can fail silently, assert on
the count of what it found, not on one lookup.

**A fixture that omits a field cannot audit it, and the omission is invisible.**
Twelve string fields were absent from every specimen slide, so twelve fields had
never been rendered in any theme by any check. Populating them found FOUR
layouts that silently dropped content the schema offers — `compare` points,
`image-text` caption, `diagram` edge labels, `branching-flow` step bodies — none
of which any sweep could have reported, because a field that is never drawn is
never fitted. Enumerate what the fixture does not cover; do not read what it
does.

**Before cutting a cap, ask whether the SHAPE is the constraint.** It paid off
every single time it was applied. `chronology` measured 87 of 160 because it
fitted against a box narrower and shorter than the one it draws into; fixed, it
seats all 160. `bibliography` gave its citation a flat 55% of the row whether or
not an annotation existed: 105 became 203. `hero-image` left half its overlay
unused: 105 became its full 120. Three fields came off the "cannot seat" list by
fixing a layout, and cutting first would have hidden all three.

**A fit budget that is MORE generous than the drawn box hides an overflow; one
that is LESS generous invents a failure.** Both happen, and they look nothing
alike from the sweep. `cards` fitted to one pad more than it drew into, so the
body overflowed the card silently; `chronology` fitted to less, so it reported
text that seats. Check the pair in both directions.

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

**An undeclared variable in a return-object spread fails AFTER the work is
done, so the job looks successful.** `generateFromPlan` spread
`...(r.problems ?? [])` where no `r` existed — but deck.yaml had already been
written, rendered and rasterised before the return, so every generation
*produced* a deck while the SSE result frame always died with "r is not
defined" and the chat reported an error. The bug shipped for a full batch
because the deck itself was fine. Any terminal expression that can throw is a
shipping gate; if it is a literal reference, name the variable once and read
it once.

**Raw-body uploads swallow their own limit error.** `express.raw(opts)(req,
res, async () => {...})` passes the callback as body-parser's `next`; a body
over the declared limit invokes it *with the error*, which an argument-less
handler ignores — so an oversized file came back as a misleading 200 ("the
file is empty") instead of a 413. The continuation must check its first
argument before doing anything else.

**A radial connector that starts at the centre of its node crosses the node's
text.** The framework layout drew hairlines from the ellipse's exact centre to
each ring element, so the vertical connectors ran straight through the concept
title and body on a live deck. A connector must begin where the ray to its
target exits the node shape — compute the boundary point from the node's
semi-axes, never from the centre.

**A layered graph drawn edges-last lets long edges slash across unrelated
nodes.** The dependency tree's lines were added AFTER the node boxes, so
Enrichment's edge to Alerts cut straight across the Storage card. Draw edges
before the nodes (a wire passing behind a box reads as routed, not broken) and
order each layer by its nodes' dependency barycentre — the classic layered-graph
crossing reduction — so edges route with fewer crossings in the first place.

**A rotated axis label wraps when its box is measured on the untransformed
string.** A type token with a text transform (the eyebrow token uppercases)
renders text wider than the untransformed source, so a box sized with
`measure(label, token)` is too narrow and the label wraps mid-word — the matrix
y-axis name "Impact" rendered as "Imp/act". Apply the token's transform to the
string before measuring, then size the box to that width.

---

## Hosting and multi-tenancy

**A container with only DejaVu and Liberation renders every theme wrong, and
nothing tells you.** The `.pptx` is unaffected — OOXML stores font *names*, so
the file looks correct on a machine that has the typefaces. What breaks is
everything rendered server-side: preview PNGs, plate backgrounds, the report's
page-number pass. The image must run `tools/install-fonts.mjs` at build time
and `fc-cache` after, and the build should fail on `fc-match` not resolving a
real family rather than shipping substituted type.

**A path that is relative to ROOT stops being relative to anything once a
directory is an env override.** Identity addresses brand marks as
`brand/generated/crest.png`; joining that onto ROOT in a container whose
`FORGE_BRAND_DIR` is `/data/brand` finds nothing, and the slides simply come out
with no institutional marks and one warning in a log nobody reads. Anything
addressing a configurable directory has to resolve through that directory.

**"The URL is unguessable" is not access control.** The deck slug is
`slugify(title)`, so guessing "the title" was enough to fetch any account's
`.pptx`. If a browser context cannot carry your usual credential — `<img>`,
`<a download>` — give it a different credential, not an exemption.

**An email address is not a credential when registration does not verify
email.** Treating one as inherently privileged means whoever signs up with it
first owns the box. Grant roles at boot from the environment, where nothing
reachable over HTTP can interfere.

**A test that reads runtime state fails on the developer's machine and passes
in CI.** `isHosted()` reads a file an admin toggle writes into the real config
directory, so two transport tests failed on a box that had been flipped to
hosted. A test that depends on a mode has to state which mode it means.

**Decrementing a counter in both the timeout and the completion path drives it
negative, and a negative counter never trips its ceiling.** The render mutex's
queue limit silently stopped applying after the first render that waited out
its timeout — the backpressure was gone precisely when it was needed.

**`pathToFileURL(process.argv[1])` throws when argv[1] is undefined.** A CLI
guard written that way makes the module unimportable from `node -e`, which is
how a container entrypoint calls it. Check argv first.

**A module-level `const` that reads `process.env` defeats any seam that sets
`process.env`.** `src/db.js` captured its database path at import, so
`setDbPathForTest` set an environment variable nothing would ever look at again
and a test asking for a scratch database opened the real one. Neither suite that
redirects the store noticed, because both take the JSON escape hatch in
`auth.js` and never opened SQLite at all. `src/paths.js` has the same shape by
design — which is why a test that redirects a path must set the variable
*before* importing anything that reads it, and why anything with a runtime seam
should resolve per call instead.

**`app.use("/api/x/:param")` shadows every literal route under `/api/x/`
registered after it.** Express matches a path-carrying `app.use` before any
later route, so `POST /api/decks/search` arrived at the per-slug ownership
middleware with `slug = "search"`, found no such deck, and was refused — for
everyone except admins, who pass the ownership check and therefore never see it.
An operator testing their own box cannot reproduce it, which is why it survived
months. Register literal segments above the parameterised middleware; teaching
the middleware which words are not slugs is worse, because a word added to that
list without a matching route exempts a whole subtree from ownership.

**Route order is not reachable from a unit test.** A shadowed route parses, its
handler passes every test written against it, and it is dead in production. The
only shape that catches it is a real request: `test/routing.test.js` binds port
0, reads the port back off the exported server, and asks over HTTP — as a
deliberately NON-admin account, because the account that would notice is the one
that cannot.

**Identical function preambles make a whole-file replace land twice.**
`createDeck` and `createReport` open with the same two lines, so a guard meant
for the report path was inserted into both and generating a *deck* on a box with
no report template failed with "this server has no report template installed".
Nothing caught it: the guard is above every seam a unit test can reach, and both
functions still parsed. Count the matches before replacing, and run the thing.

**An ignore file that lists the state to exclude fails on the unsafe side every
time a subsystem adds a file.** `.dockerignore` named `config/users.json` and
`config/sessions.json` — the account store from before the SQLite migration —
and said nothing about `config/forge.db`, which replaced them and also carries
password hashes, the encrypted BYOK vault and Auto usage, or `config/uploads/`,
which holds users' own research documents. `COPY config ./config` put both in
the image. Nothing reads `/app/config` at runtime, because `FORGE_CONFIG_DIR`
points at the volume, so there was no symptom at all — an image layer is
readable by anyone who pulls it whether or not the process opens it. Exclude
the directory and re-include the committed files by name: then a file invented
later is out by default, and the only way to get it wrong is to forget a
template, which fails loudly at boot.

**A disclosure made only on collision is still a disclosure.** Replacing
`uniqueSlug`'s `-2`, `-4` counter with a random token stops the caller counting
other accounts' decks, but a caller who asks for a title and receives a clean
slug has still learned that nobody holds it. Anything that reveals a fact by
*changing shape* has to change shape unconditionally — the token is applied
whether or not something collided, precisely so its presence carries no
information. The same reasoning rules out "only suffix when needed" for any
uniqueness scheme over a shared namespace.

**A helper that can both answer the request and return a value must not
`return fail(...)`.** `fail` is `res.status(code).json(...)`, which returns the
response object — truthy, not `undefined`. Factoring two upload routes into one
helper, the natural `return fail(res, 400, "empty upload")` makes the caller's
`if (result === undefined) return;` guard miss, and the route replies a second
time. Return `null` explicitly, and have the caller test for it.

**A per-account boundary is invisible from inside one account.** Every check
that mattered for per-account identity, brand marks and the report donor needed
two sessions: one account writes, the *other* reads. A single account uploading
a template looks exactly the same whether it wrote to its own directory or
overwrote the install-wide one, and every screen it can see says the right
thing either way. Drive two.

**A React effect is not promised to run once, and a single-use token cannot
survive a second run.** StrictMode mounts an effect, cleans it up and mounts it
again; any remount does the same. The address-confirmation screen POSTed its
token from an effect, so the first call spent it and the second was told it was
already used — and the screen reported a dead link for an address it had just
confirmed, offering only "ask for a new one", which issues a fresh token and
repeats the loop. The account was verified the whole time.

The near-miss is the guard such effects usually carry. `let live = true` with a
cleanup that clears it stops the *stale render* and does nothing about the
request, which has already gone. For an exchange that cannot be repeated the
guard belongs in front of the call, not in front of the response —
`app/web/src/lib/singleflight.js`. Share the promise rather than setting a
done-flag, so a caller arriving mid-flight reads the same outcome, and keep the
settled entry: re-asking would spend a token that no longer exists.

**A flow that only runs when a service is configured is not merely untested
without it — it does not execute.** `mailConfigured()` decides whether the app
sends confirmation mail *and* whether it enforces confirmation at all: with no
SMTP, accounts are marked verified on creation, because a gate whose only key
is an email nobody can send is a locked door with no handle. So a dev box does
not exercise a weaker version of the verification flow, it exercises none of
it, and the flow can sit broken indefinitely while every local run looks fine.
`tools/mailsink.mjs` is committed for this reason: the missing piece was a
server, not a test.

**A default-deny is only default inside the prefix it is mounted on.**
`verifiedRequestOnly` reads as one rule for the whole workspace — reading is
free, changing anything is not — and is genuinely default-deny for a route
added under `/api/decks`, `/api/reports`, `/api/presets` or `/api/briefing`.
It says nothing about a route added at a new top-level prefix, and four already
sit outside it. "Written so a route added later is covered" means later
*within* a mount; check which mounts a policy actually has before trusting the
sentence.

**An effect with no dependency array re-subscribes on every render, and a
listener removed while an event is dispatching is never called.** Those two
facts together silently disabled every in-app route change. The `applyHash`
hashchange subscription was written without a dep array — the ordinary way to
keep a handler's closure fresh — so each render removed and re-added it. On a
real hashchange the sibling `setHash` listener ran first, React flushed that
render synchronously because hashchange is a discrete event, the flush ran the
cleanup, and the DOM spec then skipped the listener that had just been removed.
The URL changed, the view did not, and only a reload showed the right page.

The tell is that re-dispatching the *same* hash worked: `setHash` was then a
no-op, nothing re-rendered, nothing was unsubscribed. Anything that looks
intermittent between "first time" and "again" is worth testing that way. The
fix is a stable subscription — `[]` deps plus a ref to the latest handler — so
nothing is ever unsubscribed mid-event. Two listeners on one event where either
can trigger a render is the shape to look for.

**A raw `fetch` next to a wrapper that adds credentials will forget them.**
`api.js` sends every authenticated request through `call()`, which attaches the
bearer token, and a handful of binary endpoints spread `authHeader()` by hand
instead. `downloadBundle` did neither, so Export → Bundle answered 401 for
every user. There is no fallback credential either: state-changing routes read
the bearer and ignore the session cookie on purpose, since the cookie exists
only so `<img>` and `<a download>` can load media. When a wrapper exists,
bypassing it is the bug; grep the raw calls whenever one is added.

**A scene with a pinned branch and a flow branch needs the clip on both.** The
landing's scroll scenes render pinned (`position: sticky`, one viewport tall)
or, when the content is too tall for that, as ordinary flow — and the flow
branch is the phone path. The pinned branch clipped, with a comment explaining
that a card animating in `from: "left"` is translated outside the frame; the
flow branch carried the same cards with the same entry vectors and clipped
nothing, so the landing scrolled sideways by 47px at 375px and no wider
viewport showed it. Whenever a component has two layout modes, ask what the
second one inherits — a fix written for one branch is not a fix for the
component.

Use `overflow-x: clip`, not `hidden`. Hidden on one axis promotes the other to
`auto`, which creates a scroll container, and a scroll container is what
`position: sticky` sticks to — the trap already recorded above. `clip` clips
without creating one and is Baseline widely available.

**A grid or flex item defaults to `min-width: auto` and will not shrink below
its content's intrinsic minimum.** The API usage column renders `JSON.stringify`
output — long unbreakable strings — and burst its 327px track to 371px, taking
the document with it. `min-w-0` on the item is the fix, and the sibling docs
view already carried it on its `<article>`, which is the tell: when one column
in a family has it and another does not, the one without is the bug. Long code
spans, URLs, file paths and JSON are the usual triggers.

**Markdown rendered to HTML brings tables nobody sized.** The docs page injects
README markdown, `prose-pre:overflow-x-auto` gave code blocks a scroll
container, and tables got nothing — so a 437px reference table widened the
whole page on a phone. Wrap tables in their own `overflow-x-auto` container at
parse time rather than setting `display: block` on the table, which also stops
it filling its column on a wide screen.

**A cap the renderer cannot honour is not a cap.** The schema's `maxLength` is
the instruction a model writes to, and it was never derived from what the
layouts can seat — `cards[].body` accepted 95 characters in a card four of
which share a row, where 53 fits. The model then writes to the number it is
given, the fitter cannot shrink below the readable floor, and every generation
pays for a rewrite pass. Measure with `capfit`, correct with `capfit-apply`,
and expect the correction to be large: 27 of the caps were over by a third or
more, and `venn` declared 30 where 14 fits.

Two measurements, and they answer different questions. `capfit` grows one field
at a time with the others at their own measured scale; `capstress` puts every
field at its cap simultaneously. The first converges to zero and the second
does not, because a slide with every field maximal is not a slide a model
writes. Tightening until the second is clean over-constrains fields that were
never the problem.

**A fixture that does not satisfy the schema is a fixture nothing can trust.**
The specimen deck is what `themematrix`, `textcheck`, `drawcheck`, `capfit` and
`capstress` all render, and nothing validated it. Cutting the caps left three
`data-cards` bodies eight characters over, the whole suite stayed green, and
every sweep was measuring a deck no generation would have been allowed to
produce. A cap cut is exactly when this breaks, and cap cuts are a thing this
project expects to keep doing — `test/specimen-valid.test.js` is the guard.

**An icon's name is not checked against what it draws.** `GearIcon` drew a
circle with eight straight rays — a sun — and sat beside the word "Settings" in
three places, so every surface that named the concept in words drew a different
one in pictures. `PanelLeftClose` and `PanelLeftOpen` differed by a single
x-coordinate and both pointed right, so a collapse button and an expand button
rendered the same arrow. Nothing fails: an icon is a path, every path is valid,
and no test in any suite looks at one.

Render the set and look at it. A contact sheet of every export at 44px and
16px, with the name under each, took minutes and found both — and the small
size is the one that decides, because teeth stop reading as teeth long before
a shape stops being a shape.

For a directional control the direction IS the content: point the chevron the
way the thing moves, and check the pair together, since the failure is that two
opposites became the same picture rather than that either was wrong alone.

**Separation by shadow works in light and disappears in dark.** `.slide-frame`
gave a deck thumbnail its edge with `box-shadow` alone. In dark mode that token
is a 4% inset highlight over a black drop shadow, and the page behind it is
near black, so a deck whose own title surface is dark sat on the dark card at
1.34:1 with no boundary. The same hole is there in light for a cream-ground
theme on a white card — dark is only where it shows first, because that is
where the shadow has nothing to fall on.

Anything whose content supplies its own colour — a thumbnail, a preview, an
embedded artefact — needs an edge that does not depend on the content or the
mode. An outline with `outline-offset: -1px` is the one to reach for: a border
changes the content box, and an inset box-shadow paints *below* content, so an
image sitting in the frame hides it completely.

**A missing edge is not a contrast failure.** The automated sweep over every
route in both modes reported zero text below its floor, before and after this
was fixed, because there is no text involved. Measuring contrast answers a
question about ink; it says nothing about whether a shape has a boundary, and
the two failures look identical in a screenshot until you know which you are
looking at.

**Two boxes that both fit can still be the same box.** Every mechanical check
passed on a `venn` whose three item stacks printed through each other: the
.pptx wrote, `textcheck` read every declared word back, the geometry watcher
saw every shape on the slide, and the fitter was content because each box fits
its own text. None of them asks whether two boxes occupy the same space. The
`roomFor` helper in that layout already solved the horizontal case — two
circles sharing a row — and nothing did the vertical one, which is the axis a
three-circle Venn overlaps on by construction.

Wherever a layout positions blocks by a shape's centre and the shapes are
meant to overlap, the collision is between the CONTENTS and no sweep can see
it. Only rendering and looking does.

**`capfit` measures how long a field may be, never how many.** It grows each
capped string toward its cap and reports the length every theme can seat, so a
type whose failure is the *number* of items — or the arrangement of them —
looks perfectly calibrated. `venn` reported clean after its caps were corrected
from 30/27 to 14 and was still overprinting itself, because the specimen
carries three items per set at any cap and three was always enough to collide.

**A tall heading is a layout input.** At the schema caps a two-line title and a
two-line standfirst take enough of the canvas that the diagram below solves for
a much smaller diameter, and elements sized as fractions of that diameter come
closer together than any specimen render shows. Types whose geometry is
computed from the room left over need looking at *at the caps*, not at the
specimen's own comfortable payloads.

**A rotated text box's WIDTH is its vertical footprint, and elements sharing a
gutter compete for it.** `matrix` places three y-axis labels down one gutter at
`rotate: 270`. Their `y` values were constants, so widening the boxes to stop a
label wrapping pushed the bottom one 0.04in off the slide — a box is centred on
`y + h/2` and spans `w/2` either side once turned, so a rotated box's position
has to be derived from its width, never fixed alongside it. The geometry
watcher caught that inside one run, which is the argument for it running inside
every render rather than as a separate sweep.

Sizing each label to its own text then let all three ask for ~1.9in of a 2.85in
gutter, and at the caps — where every label is long at once — they printed
through each other. **Divide the shared axis before sizing anything on it.**
Not into exact equal parts, though: these boxes are padded and their text is
aligned to one end, so adjacent boxes overlap by some margin before the glyphs
do, and a strict third capped every label below what it could safely take and
reintroduced the wrap. The two failures pull in opposite directions and only a
render of both extremes tells you where the line is.

**An eyebrow cannot be shrunk to fit, because its nominal size is its floor.**
Reaching for `fitOneLine` on one returns a scale of 1 and reports a floor event
that changes nothing — `floorPt` falls back to the ROLE floor when no explicit
floor is passed, and for `eyebrow` that equals the token's own size. When a
tracked all-caps label does not fit, the lever is the box, not the type.

**A percentage margin on a text box does not cover a constant inset.** A box
carries roughly 0.1in of internal padding. Sizing one at `measure(text) * 1.1`
gives a 1.2in label about 0.12in of margin and a 3in label 0.3in — so the
short labels, which is to say the ones most likely to be a single unbreakable
word, get almost nothing. Add the inset as a constant and keep the percentage
for the measurement error it is actually there for.

