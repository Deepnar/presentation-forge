# Presentation Forge

> **Topic in → Standing ovation out.** A brief goes in, a themed deck and report come out. The app does the bulk, you do the final touches.

<p align="center">
  <img src="app/web/public/logo.svg" width="80" height="80" alt="Logo" />
</p>

<p align="center">
  <a href="https://github.com/Deepnar/presentation-forge"><img src="https://img.shields.io/badge/license-MIT-black?style=for-the-badge" /></a>
  <a href="https://github.com/Deepnar/presentation-forge"><img src="https://img.shields.io/badge/node-24-black?style=for-the-badge" /></a>
  <a href="https://github.com/Deepnar/presentation-forge"><img src="https://img.shields.io/badge/themes-38-black?style=for-the-badge" /></a>
  <a href="https://github.com/Deepnar/presentation-forge"><img src="https://img.shields.io/badge/slides-75-black?style=for-the-badge" /></a>
  <a href="https://github.com/Deepnar/presentation-forge"><img src="https://img.shields.io/badge/docker-ready-black?style=for-the-badge" /></a>
</p>

<p align="center">
  <b>Local-first · Chat-first · 75 types · 38 themes · One container</b>
</p>

---

## ✨ Why this exists

Asking a model to write `pptxgenjs` code fails with small local models. Layout is coordinate math, the model reshuffles geometry every regeneration.

**So layout is unreachable.** Three layers, strictly separated:

| Layer | Owns | Written by |
|---|---|---|
| **chrome** | crest, presenter, slide number | `src/chrome.js` (locked) |
| **theme** | palette, type, spacing | `themes/*.yaml` (human) |
| **content** | what the slides say | model as validated YAML |

The model picks *what* and *which type*, never *where* or *what color*.

---

## 🚀 Pipeline

```
brief → research → outline → [you approve] → content → render → critique
         SearXNG    plan.yaml               deck.yaml  .pptx      vision
         +papers    (plain cards)                      .docx
```

---

## 🎨 Features

- **Chat-first** — `topic → briefing (one question at a time) → outline gate → deck`. The thread persists, edits the deck by conversation, and survives reloads. Slides panel collapsable, lazy New chat.
- **75 slide types** in 14 families — stats, charts, compare, timeline, quote, image, diagram, team, freeform — each with live per-theme preview and per-slide swap.
- **Research that researches** — 5-8 angle queries, source-diversity, arXiv/Crossref papers, Jina fallback, grounding that flags invented numbers.
- **Graded reports** — donor `.docx` renderer, fixed section order, Word previews, standalone or deck-from-report.
- **Quality** — density sweep, font floor (14pt), balanced presenter blocks, coherence pass, speaker script.
- **38 themes** — `tokens`/`voice` split, native or Chrome plate (glass, aurora), all without college header.
- **One container** — Node + LibreOffice + Chrome + SearXNG, `docker-compose.app.yml`.

---

## ⚡ Quick start

```bash
git clone https://github.com/Deepnar/presentation-forge.git
cd presentation-forge
npm install
npm run fonts && npm run brand
cp config/identity.example.yaml config/identity.yaml # edit: institution
ollama pull qwen3:4b
npm run dev # :5173 + :5174
```

Open http://localhost:5173 → `Register` → `New chat` → topic → briefing → `Plan the deck` → `Approve & generate`.

**Cloud:** `Identity → Cloud` paste key (OpenAI/OpenRouter/OpenCode Go), toggle `CLOUD` in chat box (Auto has no model list, Cloud shows your models).

---

## 📁 Where data lives

| What | Where | Notes |
|---|---|---|
| Decks | `decks/<slug>/` | `deck.yaml`, `plan.yaml`, `research/`, `out/` |
| Accounts | `config/users.json` | scrypt, no plaintext |
| Sessions | `config/sessions.json` | bearer tokens |
| Identity | `config/identity.yaml` | institution, guide |
| Key | `config/local.yaml` | gitignored |
| Brand | `brand/logos/` | gitignored |

No database — `decks/<slug>/` is portable: copy to another machine and it opens.

---

## 🐳 Deploy

```bash
cd docker
cp ../.env.example .env # set FORGE_PORT etc.
docker compose -f docker-compose.app.yml up -d --build
```

State in `forge_data` volume (`/data`): decks, brand, config, plate cache. Redeploy never loses a deck.

| Env | Default | Meaning |
|---|---|---|
| `FORGE_PORT` | `8080` | public port |
| `FORGE_SWEEP_DAYS` | off | delete decks older than N days |
| `FORGE_OPEN_REGISTRATION` | `1` | `0` closes signup |
| `FORGE_TRUST_PROXY` | `0` | `1` behind proxy |

See `docker/.env.example` for full table.

---

## ⌨️ Shortcuts

| Keys | Action |
|---|---|
| `Ctrl+K` | search |
| `Ctrl+N` | new chat |
| `Esc` | close modal |

---

## 🎨 Themes

One YAML, two halves:

- **`tokens`** — hex, pt, inches. Renderer only.
- **`voice`** — tone, density. Model only.

`npm run gallery` to retake thumbnails (now without header).

---

## 📚 Docs

- `docs/ARCHITECTURE.md` — why not LangChain, plate primitive, report donor
- `docs/TRAPS.md` — constrained decoding fails, how
- `docs/ROADMAP.md` — done + learned

---

## 📜 Licence

MIT for code. Brand marks and templates are yours.

