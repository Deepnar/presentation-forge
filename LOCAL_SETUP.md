# Running Presentation Forge on your own machine

Two ways to run this yourself — pick the one that fits your machine:

- **Local models (fully offline)** — needs a machine with ~8GB+ RAM for a small
  model. Nothing leaves your computer.
- **Cloud models (any laptop)** — attach an API key in the app and the pipeline
  runs on a cloud model. No GPU needed. Your decks, research and data stay on
  your machine; only the model calls go out.

Both share the same setup steps below; the difference is just which model
backend you point at.

---

## What you need

| Requirement | Local-model path | Cloud path |
|---|---|---|
| Node.js 24+ | yes | yes |
| [Ollama](https://ollama.com) + a model | yes (e.g. `qwen3:4b` or bigger) | no |
| LibreOffice + poppler | yes (renders slide previews) | yes |
| Docker (optional) | local web search | local web search |
| An API key | no | yes (in-app) |

LibreOffice and poppler are used to rasterise slides so you can *see* them
(`npm run preview`). Without them the app runs but previews fail.

## One-time setup

```bash
# 1. Get the code
git clone https://github.com/Deepnar/presentation-forge.git
cd presentation-forge

# 2. Install
npm install

# 3. Fonts (27 typefaces the themes call for) and brand placeholders
npm run fonts
npm run brand

# 4. Your institution identity
cp config/identity.example.yaml config/identity.yaml
#    edit config/identity.yaml: institution name, guide, academic, your team

# 5. (Local models only) start Ollama and pull a model
ollama pull qwen3:4b          # or any instruction-following model you have
```

## Choose your model backend

**Local models (default):** nothing to do — the app resolves every role to
Ollama automatically. Check `config/models.yaml` if you want to change which
local model handles which role.

**Cloud models:** in the app, go to Identity → Cloud, paste your API key, and
flip the header toggle to CLOUD. The key is stored in the gitignored
`config/local.yaml` on your machine and never sent anywhere but the model
provider. Supported: any OpenAI-compatible endpoint.

## Run it

```bash
npm run dev
```

- Web app: http://localhost:5173/
- API: http://localhost:5174/

Register an account (first run), then start a new chat, type a topic, answer
the briefing questions, approve the outline — deck and report come out.

## Working from the terminal (headless)

```bash
npm run render decks/gpu-demo/deck.yaml        # deck.yaml -> .pptx
npm run preview decks/gpu-demo/out/deck.pptx   # .pptx -> PNGs, so you can SEE it
npm run search "your query"                    # research from the terminal
npm run sweep -- --dry-run                     # preview the monthly deck sweep
```

Generate a deck from a brief in a script:

```js
import { generateDeck } from "./src/ai/generate.js";
import { loadTheme } from "./src/theme.js";

const { deck } = await generateDeck({
  theme: await loadTheme("warm-humanist"),
  brief: "Introduce real-time ray tracing.",
});
```

## Where your data lives (all local, all yours)

| What | Where |
|---|---|
| Decks (per account) | `decks/<slug>/` — deck.yaml, plan.yaml, research/, out/ |
| Accounts | `config/users.json` (scrypt hashes — no plaintext passwords) |
| Sessions | `config/sessions.json` (opaque bearer tokens) |
| Saved briefing presets | per-account, in config/ |
| Institution identity | `config/identity.yaml` |
| Cloud API key | `config/local.yaml` (gitignored, never committed) |
| Brand marks | `brand/logos/` + `brand/generated/` (gitignored) |

Every user of the app gets their own scope: decks carry the owning account's
email, presets are per-account, sessions are per-account. Nothing is shared
between accounts except the machine-level identity and brand files. No
database — it's all JSON and YAML files, which is also what makes a deck
portable: copy `decks/<slug>/` to another machine and it opens there.

## Updating

```bash
git pull
npm install
```

## Troubleshooting

- **Previews fail / "pdftoppm not found"** — install poppler-utils and
  LibreOffice, or `sudo apt install libreoffice poppler-utils` (Debian/Ubuntu)
  / `sudo pacman -S libreoffice-fresh poppler` (Arch).
- **Nothing renders from chat** — check the API log (`npm run dev` output) and
  that Ollama is running (`ollama list`); if using cloud, check the key in
  Identity → Cloud.
- **Ports busy** — the app binds :5173 (UI) and :5174 (API); change with
  `FORGE_API_PORT` or the Vite config.
- **"No such deck" on an old folder** — decks created before an account
  existed are ownerless; they stay visible but are not editable by new
  accounts. Create a new deck from the chat instead.

## Want the hosted version instead?

See `docs/DEPLOY.md` (or the README's "Deploying on a home Linux server"
section) — one container, one command, intended for an always-on home server.
