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

## Seen, page by page (screenshots `01`–`09`)

**Workspace** (`02`, `09`). Every project card carries five actions — Open,
History, Rename, Export, Delete… — wrapping onto two lines, so the grid reads
as rows of buttons. Each card says "Saved presentation" and "rev 34" (internal
vocabulary). A manual Refresh button sits beside Create. The left sidebar is
unlabelled icons. A generated deck with no thumbnail shows a bare letter.

**Chat** (`03`). The calmest page: one question, one box, three suggestions.
Still: a three-line explanation under the question, a header subtitle, and
an "ON THIS MACHINE" badge in green monospace — a technical status, not
something the person needs.

**Editor** (`04`, `08`) — the clearest case of the clutter:
- **two stacked bars of words**: the top bar (Workspace, Slides, title, Save,
  "Saved · rev 34", Undo, Redo, History, Export, Present, Assistant,
  Inspector) and a second one (Prev, Next, zoom, Fit, Done, Layout, + Text,
  + Rect, + Round, + Ellipse, + Chart, + Table, + Line, + Image, …) that runs
  off the right edge;
- **the inspector is a stack of small text**: an instruction sentence, then
  statistics ("Slide 1 of 22 · Layout Custom slide · Objects 3"), then Theme,
  PowerPoint look, Files, Report and Speaker notes all at once, whatever is
  selected;
- **speaker notes are always open** under the slide;
- **the slide gets about half the screen**; chrome takes the rest;
- unexplained marks: a "▲ 2" badge in the rail, "rev 34", "Slide 1 · Custom".
- In dark mode the light slide on the dark stage reads well; grey secondary
  text gets fainter, and the disabled "Apply theme" all but disappears.

**Themes** (`05`). The previews are good. Around them: an intro paragraph in
engineering terms ("A design language is one YAML file, kept in two halves…")
and five pieces of text on every card, including the internal id in
monospace (`art-deco`) and the font pair.

**Admin** (`06`). Sensible structure — four totals, two charts, recent decks
— set almost entirely in small type, with tiny uppercase labels and heavy
black bars; most of the screen is empty.

**Landing** (`01`, `07`). The dots are a starfield in dark mode and dust in
light; the hero is the best-composed screen on the site.

## What this adds up to

1. **Words where controls should be.** Toolbars are rows of "+ Word";
   cards are rows of actions; the inspector is sentences and statistics.
2. **Everything visible at once.** No progressive disclosure: the inspector,
   notes, both toolbars and every card action show whatever the person is
   doing (the study's lesson 10 — simple by default, more behind a switch).
3. **Internal vocabulary on screen**: rev numbers, ids, "Managed by AI
   layout", "ON THIS MACHINE", YAML.
4. **No type scale**: small text as the default, 16 sizes on one page.
5. **One effect, two modes**: the landing dots, the faint greys — designed
   for dark and inverted for light.
6. **No identity of its own**: a neutral sans, black buttons, grey borders —
   competent and anonymous (the owner's "modern but somehow old"). The brand
   pass (roadmap F5) starts here.
