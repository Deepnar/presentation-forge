# Presentation Forge — working agreement

Local-first generator for TCET presentations and reports. Node + pptxgenjs +
local Ollama models. No cloud LLM in the pipeline.

## The one rule that governs everything

**The model never writes layout code.** Three layers, strictly separated:

| Layer | Owns | Written by |
|---|---|---|
| chrome | banner, crest, presenter, slide number | `src/chrome.js`, locked |
| theme | palette, type, spacing, shape | `themes/*.yaml`, human |
| content | what the slides say | the model, as validated YAML |

A change that lets content specify a coordinate, a hex colour, or a font name is
wrong regardless of how convenient it looks. If a slide needs a layout that does
not exist, add a slide *type* — do not add an escape hatch to the schema.

Themes are split into `tokens` (exact machine values, read only by the renderer)
and `voice` (tone guidance, read only by the model). These must never overlap:
the moment a model can see a hex value it will start inventing them.

## Repository layout

```
src/            renderer, validator, fitter, chrome, preview      (CLI + API share this)
themes/         one YAML per design language
schema/         deck.schema.json — the content contract
config/         identity.yaml — remembered defaults, user-editable
brand/logos/    raw source marks (any format)
brand/generated/ normalised marks — produced, never hand-edited
app/server/     Express; a transport over src/, holds no logic
app/web/        Vite + React UI
decks/<slug>/   deck.yaml, meta.yaml, out/
reference/      the institutional templates output is checked against
docs/           ROADMAP.md, ARCHITECTURE.md
```

`app/server` must stay a thin wrapper. Anything it can do, the CLI must also do,
because the pipeline has to run headless.

## Commit discipline

1. **Impersonal, factual messages.** Describe what changed and why, in the
   repository's voice. Never narrate the session — no "the user said…",
   "as requested…", "we decided…", "per our discussion". Subject ≤ ~70 chars;
   the body explains the *why*, not the *what* (the diff shows the what).
2. **Many small, focused commits.** Split by concern, not by session — one
   logical change per commit (renderer / theme / docs / tests as separate
   commits). Never one massive end-of-session commit. If a message needs bullets
   to list unrelated changes, it should have been several commits.
3. **Stage in logical chunks** — `git add <specific paths>` per commit, never
   `git add -A` once.
4. **No AI attribution.** No `Co-Authored-By` trailers, no "generated with", no
   tool names anywhere in commit messages or code comments.

## Conventions

- ES modules throughout, Node 24. No TypeScript.
- Comments explain *why*, never *what*. No comment that restates the next line.
- Never hardcode institution details in `src/` — they belong in `config/identity.yaml`.
- Generated artefacts (`decks/*/out/`, `brand/generated/`, `brand/fonts/`) are
  gitignored and must be reproducible from a clean checkout.
- Before claiming a render works, rasterise it and look at the image. Valid YAML
  and a written .pptx prove nothing about whether text fits on the slide.

## Verification

```
npm run render decks/<slug>/deck.yaml     # content -> .pptx
npm run preview decks/<slug>/out/deck.pptx # .pptx -> PNGs + thumbs
npm run dev                                # API :5174 + UI :5173
```

`src/preview.js` exists so output can be *seen*. Use it.
