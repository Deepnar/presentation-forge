# Contributing to Presentation Forge

Thanks for helping make Presentation Forge better. Bug reports, documentation
improvements, new themes, renderer fixes and carefully scoped features are all
welcome.

## Before opening work

- Search existing issues and discussions first.
- Use a discussion for setup questions and early ideas.
- Open an issue before a large feature, schema change, new dependency or change
  to the product workflow. Small, well-understood fixes can go straight to a
  pull request.
- Never include API keys, account data, private decks, institution assets or
  generated output containing confidential material.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Set up the project

The simplest product installation is documented in [LOCAL_SETUP.md](LOCAL_SETUP.md).
For source development, install Node.js 24 and the rendering dependencies listed
there, then run:

```bash
npm install
npm test
npm run dev
```

The API listens on port 5174 and Vite on port 5173 in development. The private
Docker bundle serves the complete application at <http://localhost:8090>.

## Architecture rules

The model writes content, never layout code. Keep these layers separate:

| Layer | Owns | Location |
|---|---|---|
| Chrome | fixed identity and slide furniture | `src/chrome.js` |
| Theme | palette, typography, spacing and shapes | `themes/*.yaml` |
| Content | validated presentation meaning | `schema/` and deck YAML |

Content must not introduce coordinates, font names or colour values. Add a
semantic slide type when a layout is missing. Keep `app/server/` as a thin
transport over shared logic in `src/`, so every pipeline feature remains usable
headlessly.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing the renderer,
pipeline, schema, authentication, metering or storage. Record proposed and
completed work in [docs/ROADMAP.md](docs/ROADMAP.md), the single project work
list, and update the architecture document when built behavior changes.

## Verify a change

Run the checks relevant to the change, with the full suite as the normal floor:

```bash
npm test
npx vite build --config app/web/vite.config.js
```

For presentation changes, render and inspect the result:

```bash
npm run render decks/<slug>/deck.yaml
npm run preview decks/<slug>/out/deck.pptx
```

A valid PPTX is not visual verification. Look at the rendered PNGs for clipping,
contrast, overlap and missing content. Do not commit generated files from
`decks/*/out/`, local databases, keys, uploaded documents or brand assets.

Model-backed tests must identify the backend used. Do not use a local model as
evidence of hosted writing quality.

## Pull requests

Keep each pull request focused and explain:

- the problem and why it matters;
- the chosen behavior and any trade-offs;
- the exact verification performed;
- screenshots or rendered slides for visible changes.

Use factual commit messages with a short imperative subject. Do not add tool or
AI attribution trailers. A maintainer may ask for a change to be split when
unrelated concerns are bundled together.

## Reporting security problems

Do not open a public issue for a vulnerability. Follow
[SECURITY.md](SECURITY.md) instead.
