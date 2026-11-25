# Editor study — how the tools people find natural do it

The first step of F5 (roadmap: *Editor UI redesign*): study the slide editors
people already know, write down what to take from each, then design with the
Claude Design skill. This file is reference, not a work list — what we decide
to build goes into `docs/ROADMAP.md`. Each section says where its facts came
from; anything marked *(check by hand)* was not confirmed by a source and must
be looked at in the product before it shapes a decision.

Owner's direction (2026-11-16): **Canva's model is the target** — "genuinely
good and much, much better than any, and accessible". A small, deliberate set
of editing features (F4b's scope rule) done that well.

## Canva

Sources: Canva Help Center — [Format text](https://www.canva.com/help/format-text/),
[Add and edit text](https://www.canva.com/help/add-and-edit-text/),
[Keyboard shortcuts](https://www.canva.com/en_gb/help/canva-keyboard-shortcuts/),
[Move elements](https://www.canva.com/help/moving-elements/),
[Group, layer, and align](https://www.canva.com/help/layer-group-align/),
[Arranging layers](https://www.canva.com/en_in/help/finding-and-arranging-layers/).

- **One toolbar, about what is selected.** Select text and the bar above the
  canvas becomes the text bar: font, size with − / + and a typed value, bold,
  italic, underline, strikethrough, colour, alignment (left, centre, right,
  justify). Some controls sit in a floating toolbar beside the selection. No
  Apply buttons — a change shows at once.
- **Words or the whole box.** Emphasis (bold, italic, colour) applies to the
  selected words; Canva's help notes **size applies to the whole text box** —
  a deliberate simplicity we can choose to match or to exceed (our engine
  styles ranges, sizes included).
- **Keyboard first-class.** Ctrl+B / Ctrl+I; Shift+Ctrl+L / C / R align;
  Shift+Ctrl+. and , step the size by one; Ctrl+F1 moves focus into the
  toolbar — the toolbar is reachable without a mouse.
- **Pages as thumbnails you can drop on.** Show the page thumbnails, select
  an element (Shift for more), drag it onto another page's thumbnail and it
  moves there. If it will not move, it is locked or grouped — the floating
  toolbar unlocks or ungroups.
- **Layers as a list.** Position → Layers shows the stack as a list to drag;
  group, align and lock live on the selection, not in a separate inspector.
- Side panel of insert sources (Elements, Text, Uploads, Projects…) *(check
  by hand: the exact list and grouping)*; presenter notes and the page grid
  view *(check by hand: not covered by the sources found)*.

## Google Slides

Sources: Google Docs Editors Help —
[Slides with a screen reader](https://support.google.com/docs/answer/1634140?hl=en_1),
[Keyboard shortcuts](https://support.google.com/docs/answer/1696717?hl=en&co=GENIE.Platform%3DDesktop),
[Text fitting](https://support.google.com/docs/answer/10364036?hl=en),
[Images & videos](https://support.google.com/docs/answer/97447?hl=en&co=GENIE.Platform%3DDesktop);
community threads on the [toolbar](https://support.google.com/docs/thread/302723779)
and on [customising it](https://support.google.com/docs/thread/277450946);
[speaker notes guide](https://slidesgo.com/slidesgo-school/google-slides-tutorials/how-to-add-and-work-with-speaker-notes-in-google-slides).

- **Menus plus one toolbar; deeper settings in a side panel.** The toolbar
  holds the common edit and format controls; *Format options* opens a
  sidebar for the rest (text fitting, sizing, shadows). The toolbar cannot be
  customised, and can be collapsed with a small arrow.
- **Filmstrip on the left; layout from the Slide menu.** Select slides in the
  filmstrip, then Slide → Apply layout.
- **Speaker notes are a pane you can hide** — View → Show speaker notes, ticked
  while shown, just above Show filmstrip; hiding never deletes them. Presenter
  view shows them in a separate window, never to the audience.
- **Keyboard and search for commands.** Menu access keys (Alt+O for Format)
  and a tool finder (Alt+/) that searches every command by name.

## What to take, for Forge

1. **A contextual toolbar above the canvas** (Canva), changing with the
   selection — text, shape, picture, chart — with live changes and one undo
   each; the inspector keeps only what does not fit a toolbar (Google's
   Format options sidebar is the model for that leftover).
2. **Selected words get emphasis; we also allow size on a range**, which our
   engine already supports (Canva sizes whole boxes; decide by looking).
3. **Keyboard reach for everything**: Ctrl+B/I/U, align shortcuts, size steps,
   a shortcut into the toolbar, and a command search (Google's Alt+/).
4. **Hideable notes and filmstrip** (Google's View menu), matching the owner's
   F5 items.
5. **Drag an element onto a slide thumbnail to move it** (Canva), as already
   recorded for F5.
6. **Layers as a simple draggable list with lock and hide**, not an
   inspector of fields (Canva) — answers the owner's "could not understand the
   inspector or the layers".

## Still to study

PowerPoint (desktop and web), Excalidraw, Gamma, Pitch and Figma — the same
questions: canvas, toolbar, insert, inspector, layers, slide rail, notes,
keyboard, accessibility.
