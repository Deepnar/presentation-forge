# Presentation Forge

Local-first generator for academic presentations and reports. A brief goes in,
a themed `.pptx` comes out. Node + pptxgenjs + local models via Ollama by
default, with an optional cloud backend per role.

```
brief ──► research ──► outline ──► [you approve] ──► content ──► render ──► critique
          SearXNG      plan.yaml                     deck.yaml   .pptx      vision
```

Models are local by default: every role resolves to an Ollama model and
nothing leaves the machine unless you opt in. To use a cloud model for a role,
add a provider under `providers:` in `config/models.yaml` and set
`provider:` on that role — OpenAI-compatible endpoints only, key read from an
environment variable. Local and cloud roles can mix (e.g. local author, cloud
critic), and the rest of this README assumes the local default.

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
npm run sweep -- --dry-run                   # preview the monthly deck sweep
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

## Deploying on a home Linux server

The app is built to be "plug your API key and play" on a friend's old laptop —
one container, one command, persistent data:

```bash
cd docker
cp ../.env.example .env        # then set FORGE_SMTP_* etc.
docker compose -f docker-compose.app.yml up -d --build
```

The `forge` container ships Node, LibreOffice and headless Chrome (the whole
render pipeline), serves the built UI on one port, and talks to the bundled
SearXNG container for local research. State lives in a Docker volume
(`/data`): decks, brand marks, config, plate cache. Redeploying never loses a
deck.

Environment (set in `docker/.env`, all optional):

| Variable | Meaning |
|---|---|
| `FORGE_PORT` | public port (default 8080) |
| `FORGE_SWEEP_DAYS` | delete decks older than N days of inactivity (default off) |
| `FORGE_SWEEP_HOUR` | run the daily sweep at this hour (default 3) |
| `FORGE_SMTP_HOST/PORT/USER/PASS/FROM/TO` | sweep email (see `src/mail.js`) |
| `FORGE_SMTP_SECURE=1` | implicit TLS for SMTP |
| `FORGE_AUTH_RATE_LIMIT` | login/register attempts per 10 min per IP (default 20) |
| `FORGE_UI_ORIGIN` | comma-separated allowed CORS origins (empty = same-origin only) |

The monthly sweep is what keeps the server from becoming cloud storage: decks
older than `FORGE_SWEEP_DAYS` are deleted unless their `meta.yaml` has
`keep: true`, and an email is sent on sweep day listing what was removed.
People download daily to local machines, so the server only ever holds recent
work. `npm run sweep` runs it manually; `POST /api/sweep` does the same from
the UI (dry run by default).

For a domain in front, put a reverse proxy (Caddy/nginx) on the public port
with a TLS cert and forward to the container. The research papers feature
(arXiv/Crossref) and the Jina Reader fallback (`RESEARCH_JINA=1`) are the only
outbound network calls the app makes beyond SearXNG.

## Licence

MIT for the code. Any brand marks or institutional templates you add are yours
and are not covered by it.
