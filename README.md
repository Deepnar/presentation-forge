# Presentation Forge

<p align="center">
  <img src="app/web/public/logo.svg" width="88" height="88" alt="Presentation Forge logo" />
</p>

<p align="center">
  <strong>Local-first presentation and report generation for academic work.</strong><br />
  Research a topic, approve the structure, and produce a themed PowerPoint deck and a companion Word report.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-242424?style=flat-square" alt="MIT license" /></a>
  <img src="https://img.shields.io/badge/node-24%2B-242424?style=flat-square" alt="Node.js 24 or newer" />
  <img src="https://img.shields.io/badge/themes-38-242424?style=flat-square" alt="38 themes" />
  <img src="https://img.shields.io/badge/slide%20types-75-242424?style=flat-square" alt="75 slide types" />
  <img src="https://img.shields.io/badge/local--first-242424?style=flat-square" alt="Local-first" />
</p>

Presentation Forge is built for the real academic workflow: a topic becomes researched material, an outline that a person can review, a presentation that respects institutional identity, and—when needed—a report rendered into a supplied Word template. The system does the repetitive work; the review points remain visible and editable.

## At a glance

```text
brief → research → outline → approval → content → render → preview → critique
          notes.md   plan.yaml              deck.yaml   .pptx       PNGs
                                                        .docx
```

- Chat-first creation with thesis-driven briefing (thesis, audience, emphasis, evidence steer research and plan), editable outlines, persistent deck conversations, and per-user workspaces.
- A deterministic renderer with 75 slide types, 38 themes, text fitting, speaker notes, presenter distribution, and editable PowerPoint text for native slides.
- Research from SearXNG, uploaded source material, arXiv, and Crossref; briefing-aware query expansion and evidence-coverage re-query, and claims are checked against saved research notes before a deck is finalised.
- Standalone reports, companion reports, and deck-from-report generation, all based on the same research record.
- Auto image supply for `[image]` notes via SearXNG images / Unsplash Source, cached under `assets/auto/` (no model writes a URL), plus manual upload.
- Deterministic quality gate (monotony, data-blind) and coherence review after generation.
- A local default using Ollama for clones; the hosted site runs on a shared gateway plus per-account BYOK keys, encrypted at rest.
- A browser application, a headless CLI, and a Docker deployment that all use the same Node core.

## Published presentations — from my account

These are real decks and reports I made with this app, committed as PDFs/PPTXs so you can see the product without logging in. No private data beyond the deck content itself — team and institution are as shown in the files. More will be added as I make them.

| Presentation | Files |
|---|---|
| **Recent Trends in Mixed-Mode Programming** — 12 slides + report | [PPTX](./published/recent-trends-mixed-mode-presentation.pptx) · [Report DOCX](./published/recent-trends-mixed-mode-report.docx) |
| **First Impressions & Networking (variant 1)** — topic-exploring | [PDF](./published/first-impressions-networking-presentation.pdf) · [PPTX](./published/first-impressions-networking-presentation.pptx) · [Report DOCX](./published/first-impressions-networking-report.docx) |
| **First Impressions & Networking (variant 2)** — topic-topic | [PPTX](./published/first-impressions-topic2-presentation.pptx) |

Browse all files: [`published/`](./published/) — previews are also rasterised via `npm run preview` for the landing page when running locally. Private decks stay in `decks/<slug>/` and are gitignored (see `.gitignore: decks/*`).

## Quick start

### 1. Install the local prerequisites

| Requirement | Why it is needed |
|---|---|
| Node.js 24 or newer | Runs the application and renderer. |
| Ollama and an instruction-following model | Default, local model backend. |
| LibreOffice and Poppler (`pdftoppm`) | Converts output into preview images. |
| Docker (optional) | Runs the bundled local SearXNG search service. |

On Debian or Ubuntu, the preview dependencies are available with:

```bash
sudo apt install libreoffice poppler-utils
```

### 2. Configure and run

```bash
git clone https://github.com/Deepnar/presentation-forge.git
cd presentation-forge
npm install
npm run fonts
npm run brand
cp config/identity.example.yaml config/identity.yaml
ollama pull qwen3:4b
npm run dev
```

Open <http://localhost:5173>. Register an account, choose **New chat**, describe the topic, complete the briefing, review the outline, then approve generation.

The web application runs on port 5173 and its API runs on port 5174. `config/identity.yaml` is intentionally ignored by Git: add your institution, guide, and brand settings there without exposing them in the repository.

### Use a hosted model instead

The default path sends model work only to Ollama. A hosted OpenAI-compatible provider is optional: configure it in `config/models.yaml`, then add the key through **Settings → Cloud** and select the Cloud mode in the app. Keys are stored locally in the ignored `config/local.yaml`; only model requests are sent to that provider.

The project also supports an administrator-configured shared Auto provider with usage limits. It is a routing option, not a replacement for the local-first default.

## Why the renderer is structured this way

Asking a language model to write PowerPoint layout code is unreliable: coordinates, text metrics, and overflow decisions change whenever content changes. Presentation Forge makes those decisions inaccessible to the model.

| Layer | Responsibility | Controlled by |
|---|---|---|
| Chrome | Institutional marks, presenter line, slide number | Locked renderer code in `src/chrome.js` |
| Theme | Palette, typography, spacing, and visual treatment | Human-authored files in `themes/` |
| Content | Message, structure, slide type, and data | Validated YAML written by the generation pipeline |

The model can select a semantic slide type and provide its content. It cannot supply coordinates, colour values, font names, or sizes. That boundary keeps layouts repeatable, allows a theme to evolve independently of content, and makes a regenerated deck visually stable.

Each theme also separates machine-readable `tokens` from model-facing `voice`. Renderer tokens contain exact values; voice contains only editorial direction. The two are deliberately never shared across their boundary.

## What the application produces

### Presentations

The deck pipeline combines research, an approval gate, schema validation, deterministic layout, and visual review.

- 75 slide types across title and section surfaces, lists, statistics, charts, comparisons, processes, timelines, quotations, media, tables, diagrams, definitions, teams, and special-purpose slides.
- Nine chart variants, including bar, line, area, pie, doughnut, scatter, radar, and stacked bar.
- 38 bundled themes, with native PowerPoint shapes where possible and an optional Chrome-rendered background plate for effects that Office cannot represent cleanly.
- Readability controls: measured text fitting, per-role font floors, density sweeping, field-length rewrites, and a final trim pass that avoids mid-sentence truncation.
- Presentation workflow controls: balanced contiguous presenter assignments, speaker-script generation, content grounding, coherence review, slide-type conversion, version backups, export, and editable deck YAML.

Native slides retain editable PowerPoint text. The `freeform` slide type and plate-based visual treatments are rasterised by design; use them when visual freedom matters more than downstream text editing.

### Research

Research is stored with the deck rather than hidden in a prompt. A research pass can expand a brief into multiple search angles, collect and diversify sources, retrieve relevant papers from arXiv and Crossref, and save the resulting evidence in `research/notes.md` and `research/sources.json`.

For source-led work, upload Markdown, text, PDF, or DOCX material. Upload-only mode treats that document as the sole content source. Before finalisation, the grounding pass detects unsupported figures and records what needs attention instead of silently presenting it as established fact.

### Reports

Reports are not simply slides in another format. The report renderer preserves the required structure of a donor `.docx` template while injecting generated content, including its institutional chrome and table of contents. You can generate:

- a companion report from an approved deck plan and its shared research;
- a standalone report from a brief; or
- a companion deck from an existing report.

Reports support `full` and `brief` depth, DOCX rendering, preview images, and download through the web application or CLI.

## Everyday commands

```bash
# Run the browser application and API.
npm run dev

# Render a checked-in deck definition and inspect the resulting slides.
npm run render decks/gpu-demo/deck.yaml
npm run preview decks/gpu-demo/out/deck.pptx

# Search from the terminal. Start local SearXNG first if desired.
npm run searxng
npm run search "recent developments in green hydrogen"

# Maintain local assets and inspect theme output.
npm run fonts
npm run brand
npm run gallery

# Preview a retention sweep without deleting anything.
npm run sweep -- --dry-run
```

The generation CLI exposes the complete workflow without the browser:

```bash
# Create a researched outline, then generate only after it has been reviewed.
npm run forge -- new "Ray tracing in 2026" --research --theme warm-humanist
npm run forge -- generate ray-tracing-in-2026 --critic

# Refine a generated deck conversationally from the terminal.
npm run forge -- chat ray-tracing-in-2026 "Make the comparison slide more concise."

# Generate a report or a speaker script.
npm run forge -- report ray-tracing-in-2026 --generate --depth full
npm run forge -- script ray-tracing-in-2026
```

Run `npm run forge -- new --help` for the full command reference, including resumable generation, uploads, report-only work, and deck-from-report flows.

## Project map

```text
app/server/       Express transport layer over the shared core
app/web/          Vite and React browser application
src/              renderer, generation pipeline, research, validation, previews
themes/           presentation design languages
styles/           reusable token overrides layered over a theme
schema/           content contracts for decks and reports
templates/        starting content templates
config/           model configuration and local identity defaults
brand/            source and normalised institutional marks
decks/<slug>/     portable deck workspace: content, plan, research, output
docker/           home-server image, Compose deployment, and SearXNG setup
docs/             architecture decisions, roadmap, operational lessons
```

The API deliberately holds no presentation logic: anything available in the web application is built on the same `src/` primitives that the CLI uses.

## Data, privacy, and portability

Presentation Forge has no external database requirement. Deck workspaces are ordinary files and can be copied to another installation.

| Data | Location | Versioned? |
|---|---|---|
| Deck content, outline, research, scripts, and output | `decks/<slug>/` | Deck definitions are; rendered output is ignored. |
| Institution identity | `config/identity.yaml` (install default), `config/identities/` (per account) | No; kept local. |
| Accounts, sessions, per-user API keys, usage | `config/forge.db` | No; keys are encrypted at rest under `FORGE_KEY_PEPPER`. |
| Provider keys (install-wide) | `config/local.yaml` | No; kept local. |
| Brand source and generated assets | `brand/logos/`, `brand/users/<account>/` | No; they may contain protected marks. |

Model calls remain on the machine when using Ollama. Research providers and an explicitly selected hosted model provider involve network requests; the saved deck, research files, and account data remain in the configured local storage.

## Docker deployment

The Compose setup builds the application with Node, LibreOffice, Poppler, Chromium, the 27 theme font families, and a separate SearXNG service, behind an optional Caddy TLS terminator. Persistent state lives in the `forge_data` volume, so rebuilding the image does not remove decks, accounts, configuration, brand assets, the report donor, or the plate cache.

```bash
cd docker
cp ../.env.example .env
# FORGE_KEY_PEPPER, SEARXNG_SECRET and FORGE_DOMAIN have no defaults.
docker compose -f docker-compose.app.yml --profile tls up -d --build
```

[`docs/DEPLOY.md`](docs/DEPLOY.md) is the full walkthrough, including which free hosts can actually run this — it needs a long-running container with ~2 GB of RAM, a writable disk, and the ability to run LibreOffice and Chromium, so serverless platforms are out regardless of how the UI is written.

Single repo, two modes: `FORGE_HOSTED=1` (hosted — Auto is the shared gateway, Cloud is per-user BYOK, no Ollama) vs unset/`0` (local — Auto falls back to Ollama). Toggle at runtime in Admin → System or Settings (admin), which writes `config/hosted.json`.

Admin is the `admin` role and nothing else. The operator's account is created or promoted at boot from `FORGE_ADMIN_EMAIL`/`FORGE_ADMIN_PASSWORD`; an email address alone never grants admin, because self-registration does not verify email ownership. See `#/admin` for users, decks, analytics and the hosted switch.

Reports need an institutional `.docx` donor, which is gitignored and not in the image — an admin uploads one after first boot, or you point `FORGE_REFERENCE_DIR` at a directory containing it. Deck generation works without it.

Ollama is not bundled in the image. For local-model generation, run Ollama on the host or a reachable machine and point the `host` in `config/models.yaml` to it.

## Verification and development

```bash
npm test

# A PPTX file alone is not proof that the layout works. Rasterise and inspect it.
npm run render decks/gpu-demo/deck.yaml
npm run preview decks/gpu-demo/out/deck.pptx
```

The test suite covers the renderer’s supporting contracts, generation stages, research handling, transport behaviour, reports, authentication, and the web-facing API. Visual changes should always be checked from generated preview images as well as tests.

## Further reading

- [Local setup guide](LOCAL_SETUP.md) — prerequisites, configuration, troubleshooting, and headless usage.
- [Architecture](docs/ARCHITECTURE.md) — design boundaries, the rendering paths, research, reports, chat, and deployment rationale.
- [Traps](docs/TRAPS.md) — hard-won implementation constraints and failure modes.
- [Roadmap](docs/ROADMAP.md) — completed work, future work, and feature-specific lessons.

## License

The code is released under the [MIT License](LICENSE). Institutional marks, donor templates, and other assets you add remain yours and may carry their own usage restrictions.
