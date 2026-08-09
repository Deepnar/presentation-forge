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

## Session / tooling

**The browser screenshot tool can fail mid-session and stay failed.** It timed
out on every call for the back half of one session, including on pages it had
captured minutes earlier, with no console errors and a healthy server. Fall back
to `read_page`, `javascript_tool` and direct `curl` against the API — they stay
reliable. Do not conclude the app is broken from a screenshot timeout, and do
not claim a UI was visually verified when it was only checked structurally.

**Validate against the rendered artefact, not the data structure.** Valid YAML,
a passing schema, and a written file are three checks that all pass while the
output is unusable.
