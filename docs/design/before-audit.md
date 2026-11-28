# Before-audit — Forge's own pages, before the redesign

The second step of F5: what makes the site feel old and cluttered, measured
and looked at, before any design work. The owner's words (2026-11-11/16):
"there is just too much text everywhere in the entire site, small text
everywhere, unnecessary"; "it feels cluttered"; the inspector and layers
"could not be understood"; light and dark mode each look wrong in different
places. The study of other editors is `editor-study.md`; what we decide to
build goes in `docs/ROADMAP.md`.

Screenshots (light and dark, 1440×900) live in `out/evidence/f5-before/`,
which is not committed — re-take them with the sandbox.

## Measured (2026-11-28, sandbox, light mode, 1440×900)

Counted over every visible text node on the page (the slide itself and the
slide thumbnails excluded): how much of the text is set below 13px, how many
distinct font sizes appear, how many bordered containers and buttons.

| Page | Text chars | Text under 13px | at 11.5px or less | Font sizes | Bordered boxes | Buttons |
|---|---:|---:|---:|---:|---:|---:|
| Home / landing (`#/home`) | 4,173 | 16% | 8% | **16** | 24 | 5 |
| Workspace (`#/projects`) | 995 | 45% | 1% | 8 | 12 | 34 |
| Chat (`#/chat`) | 436 | 51% | 16% | 9 | 4 | 12 |
| **Editor** (`#/project/…`) | 1,499 | **86%** | 6% | 5 | 15 | **45** |
| Themes (`#/themes`) | 4,172 | 81% | 28% | 6 | **35** | 38 |
| Usage (`#/usage`) | 1,242 | 60% | 5% | 7 | 8 | 1 |
| **Admin** (`#/admin`) | 496 | **97%** | **46%** | 6 | 8 | 11 |

What the numbers say:

- **Small text is the default, not the exception**, everywhere but the
  landing hero: the editor's chrome is 86% small text, admin 97% (nearly half
  at 11.5px or less). This is the owner's "small text everywhere".
- **The editor shows 45 buttons at once** — the toolbar of "+ Text, + Rect,
  + Round, + Ellipse, + Chart…" words, the inspector and the rail — where
  Canva shows a short tool row and a toolbar for the selection.
- **The landing page uses 16 font sizes** — no type scale; every section
  invents its own.
- **Boxes inside boxes**: the themes page draws 35 bordered containers.

## Seen

- **The landing hero fades in over many seconds.** Eight seconds after load
  the headline is at about 60% opacity and the line under it at 13%; a first
  screenshot shows only the background dots. A visitor sees an empty page.
- **The background dots read as stars in dark mode and as dust in light**
  (owner's note); in light mode they are grey specks on near-white.
- **The hero itself is clean** — one headline, one sentence, two buttons —
  but the stats line under it is small grey text that says little at a
  glance.

*(More to add from the screenshots of each page in both modes.)*
