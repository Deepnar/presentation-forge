# Presentation Forge

Local-first generator for academic presentations and reports. A brief goes in,
a themed `.pptx` comes out. Node + pptxgenjs + local models via Ollama — no
cloud LLM anywhere in the pipeline.

```
brief ──► research ──► outline ──► [you approve] ──► content ──► render ──► critique
          SearXNG      plan.yaml                     deck.yaml   .pptx      vision
```

## The idea

The obvious approach — ask a model to write pptxgenjs code — falls apart with a
local model. Slide layout is coordinate arithmetic, text metrics and overflow
handling, which is exactly what small models are worst at, and it is unstable:
every regeneration reshuffles the geometry, so iterating on content destroys the
design and iterating on design destroys the content.

So layout is made unreachable. Three layers, strictly separated:

| Layer | Owns | Written by |
|---|---|---|
| **chrome** | institutional marks, presenter, slide number | locked code |
| **theme** | palette, type, spacing, shape | YAML, by hand |
| **content** | what the slides actually say | the model, as validated YAML |

The model picks *what to say* and *which of 15 slide types fits each beat*. It
cannot place anything, colour anything, or choose a font. All design quality
lives in theme files where it is deterministic and tunable.

## Requirements

- Node 24+
- [Ollama](https://ollama.com) with at least one instruction-following model
- LibreOffice and poppler (`pdftoppm`) — used to rasterise slides for review
- Docker, if you want local web search

## Setup

```bash
npm install
npm run fonts                 # 27 typefaces the themes call for
npm run brand                 # normalises brand marks (generates placeholders if none)
cp config/identity.example.yaml config/identity.yaml   # then edit
npm run searxng               # optional: local metasearch on :8888
```

## Use

```bash
npm run render decks/gpu-demo/deck.yaml      # deck.yaml -> .pptx
npm run preview decks/gpu-demo/out/deck.pptx # .pptx -> PNGs, so you can SEE it
npm run dev                                  # web UI :5173, API :5174
npm run search "your query"                  # research from the terminal
```

Generate a deck from a brief:

```js
import { generateDeck } from "./src/ai/generate.js";
import { loadTheme } from "./src/theme.js";

const { deck } = await generateDeck({
  theme: await loadTheme("warm-humanist"),
  brief: "Introduce real-time ray tracing: what it is, how it differs from "
       + "rasterisation, the pipeline stages, and where hardware is heading.",
});
```

## Themes

One YAML file each, split into two halves that never overlap:

- **`tokens`** — exact machine values. Read only by the renderer. Hex, points,
  inches. No adjectives, no "or similar".
- **`voice`** — tone and density. Read only by the model. No hex, no geometry.

That disjointness is load-bearing. Give a model sight of hex values and it
starts inventing them; give the renderer adjectives and it starts guessing.

## What is worth reading

- **[`docs/TRAPS.md`](docs/TRAPS.md)** — the most portable thing here. Constrained
  decoding guarantees shape, not sense, and a large schema actively degrades
  generation. Records how that fails, in what order, and why tuning sampling
  parameters does not help.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — why this shape, the two
  rendering paths, why not LangChain.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — status plus what was learned per feature.

## Brand marks and identity

`brand/logos/` and `config/identity.yaml` are gitignored. Institutional logos
are trademarks and identity files carry personal details, so neither belongs in
a repository. `npm run brand` generates neutral placeholders when no marks are
present, so a fresh clone renders immediately; drop your own in and re-run it.

## Licence

MIT for the code. Any brand marks or institutional templates you add are yours
and are not covered by it.
