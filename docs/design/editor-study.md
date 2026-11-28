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

## PowerPoint (desktop and web)

Sources: Microsoft Support —
[PowerPoint for the web basics](https://support.microsoft.com/en-us/powerpoint/basic-tasks-in-powerpoint-for-the-web?ui=en-us&amp=&amp=&rs=en-us&ad=us),
[Apply a slide layout](https://support.microsoft.com/en-us/powerpoint/training/apply-a-slide-layout),
[Add, rearrange, duplicate and delete slides](https://support.microsoft.com/en-us/powerpoint/training/add-rearrange-duplicate-and-delete-slides-in-powerpoint),
[Keyboard shortcuts](https://support.microsoft.com/en-us/accessibility/powerpoint/use-keyboard-shortcuts-to-create-powerpoint-presentations),
[Mini toolbar](https://support.microsoft.com/en-gb/office/use-the-mini-toolbar-to-format-text-47012f83-b553-40a9-b7de-f038876f4db3),
[Guides for arranging things](https://support.microsoft.com/en-au/powerpoint/training/guides-for-arranging-things-on-a-slide),
[Align and arrange objects](https://support.microsoft.com/en-gb/office/align-and-arrange-objects-on-a-slide-5f961535-a2ae-4914-a24a-94c669903ae3),
[Choose the right view](https://support.microsoft.com/en-us/office/choose-the-right-view-for-the-task-in-powerpoint-21332d8d-adbc-4717-a2c6-e25a697b40e9).

- **New Slide and Layout sit side by side on the Home tab.** Home → New Slide
  adds one (its drop-down picks a layout); Layout changes the current
  slide's. Both are the first things on the tab — never hidden.
- **A mini toolbar at the selection.** Selecting text with the mouse shows a
  small toolbar beside it: font, alignment, colour, indent, bullets. It is
  not customisable and can be turned off. The ribbon holds everything else.
- **Smart guides** — red dashed lines while dragging — align to other objects
  and slide edges and show **equal spacing** between objects; Align →
  Distribute spaces three or more evenly.
- **Selection pane** (Alt+F10 on desktop): every object on the slide as a
  list, to select, reorder, rename and hide — PowerPoint's layers *(check by
  hand: its place in the web app)*.
- **Notes pane** under the slide, opened and closed with a Notes button.
- **Search for any command**: Alt+Q moves to the ribbon's search box (Tell me);
  the simplified ribbon on the web is a one-line version of the full one
  (Alt+. Z R toggles them on Windows).

## Excalidraw

Sources: [How to start drawing](https://plus.excalidraw.com/how-to-start)
(Excalidraw+), GitHub issues on
[property shortcuts](https://github.com/excalidraw/excalidraw/issues/2649) and
[shape shortcuts](https://github.com/excalidraw/excalidraw/issues/27), and a
[discussion on property defaults](https://github.com/excalidraw/excalidraw/discussions/6563).
The official docs did not come up; current behaviour *(check by hand: press ?
in the app)*.

- **One small tool bar, one key per tool.** R draws a rectangle; Tab cycles a
  shape being drawn between rectangle, diamond and ellipse. The tools stay a
  single short row — the opposite of a ribbon.
- **Properties appear only for what is selected**, as a compact panel of
  swatches and toggles (stroke, background, fill style, width, opacity); S
  and G open the stroke and background colour pickers.
- **? shows every shortcut; Ctrl+/ opens a command palette** to run any
  action by name.
- Not customisable (toolbar and properties panel), by design.

## Gamma

Sources: Gamma Help —
[Style slides and adjust layout](https://help.gamma.app/en/articles/11969695-how-do-i-style-slides-and-adjust-layout-settings-in-my-gamma),
[What are cards](https://help.gamma.app/en/articles/11016396-what-are-cards-in-gamma-and-how-to-do-they-work);
Gamma guides on [the card system](https://gamma.app/explore/content/guides/how-gamma-maps-content-directly-to-slides-using-its-card-system)
and [layout customisation](https://gamma.app/explore/content/guides/gamma-ai-presentation-tool-flexible-layout-customization-guide).

- **Type "/" to insert anything.** Every item in the Insert menu also has a
  slash command — text, lists, images, charts, tables, callouts, embeds.
- **Other layouts are previewed, not configured.** A Smart Layouts button
  shows the current card in many layouts to pick from; right-clicking a
  card's edge opens a quick menu (copy, restyle, notes, change layout).
  This is our Layout ▾, and it confirms the thumbnail-picker approach.
- **Card style in the toolbar for the selected card** (background colour or
  image, image position, overlay); global look (roundness, stroke, shadow)
  in a Theme Editor — the split between a slide's style and the theme's.

## Pitch

Sources: Pitch Help —
[Find keyboard shortcuts](https://help.pitch.com/en/articles/4287527-find-keyboard-shortcuts),
[Quick menu](https://help.pitch.com/en/articles/4287519-navigate-pitch-faster-using-the-quick-menu),
[Add slides](https://help.pitch.com/en/articles/7003075-add-slides-to-your-deck),
[Slide styles](https://help.pitch.com/en/articles/4063049-work-with-slide-styles),
[Align blocks](https://help.pitch.com/en/articles/3748873-align-blocks),
[Speaker notes](https://help.pitch.com/en/articles/4301460-add-speaker-notes),
[Speaker view](https://help.pitch.com/en/articles/4056889-present-using-speaker-view).

- **Single keys for the common inserts**: N new slide, H headline, I image,
  S shape, L list; Cmd/Ctrl+K opens a quick menu to search everything; the
  shortcut list sits behind the Help bubble with its own search.
- **Add slide → Templates or Layouts tabs**: layouts are designed slide
  types (timeline, image grid, diagram, quote…) that work with any template
  — our gallery and "Your layouts", side by side.
- **The Design panel shows slide styles only when nothing is selected** —
  the panel follows the selection: a block selected shows the block,
  nothing selected shows the slide.
- Speaker notes per slide, shown in speaker view while presenting.

## Figma (Figma Slides)

Sources: Figma Help —
[Explore Figma Slides](https://help.figma.com/hc/en-us/articles/24170630629911-Explore-Figma-Slides),
[Select layers in a slide deck](https://help.figma.com/hc/en-us/articles/27330413404567-Select-layers-in-a-slide-deck),
[Layer properties in the right sidebar](https://help.figma.com/hc/en-us/articles/360039832014-Design-prototype-and-explore-layer-properties-in-the-right-sidebar),
[Use Figma with a keyboard](https://help.figma.com/hc/en-us/articles/360040328653-Use-Figma-products-with-a-keyboard),
[Accessibility at Figma](https://help.figma.com/hc/en-us/articles/35063862380311-Accessibility-at-Figma).

- **Simple by default, power behind a switch.** In Figma Slides the right
  sidebar's Design tab holds the selected object's properties, and **the
  layers panel is not shown by default** — a "design mode" toggle in the
  toolbar unlocks layers, auto layout and advanced properties for those who
  want them.
- **Cmd/Ctrl+K for actions; Ctrl+Shift+? for the shortcut sheet**, which
  opens along the bottom with tabs by category.
- Full keyboard operation is documented as an accessibility commitment.

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
   inspector of fields (Canva, and PowerPoint's Selection pane) — answers the
   owner's "could not understand the inspector or the layers".
7. **New Slide and Layout always in view**, side by side (PowerPoint's Home
   tab) — the fix for the hard-to-find "+ Slide ▾".
8. **Few tools, one key each** (Excalidraw): T text, R rectangle, O ellipse,
   L line and so on, with grouped insert menus for the rest; **? opens the
   shortcut sheet**, Ctrl+/ the command search (PowerPoint's Alt+Q,
   Google's Alt+/).
9. **Properties only for the selection**, as swatches and toggles rather than
   form fields (Excalidraw); smart guides with equal spacing we already have
   (F4b), matching PowerPoint's.
10. **Simple by default, more behind a switch** (Figma Slides hides layers
    until "design mode"): the everyday editor shows the toolbar and the
    slide; layers, exact geometry and the rest open on request. The most
    direct answer to "too much text everywhere".
11. **The side panel follows the selection** (Pitch): an object selected
    shows the object; nothing selected shows the slide — theme, layout,
    notes.
12. **Insert by typing** (Gamma's "/", Pitch's single keys, everyone's
    Cmd/Ctrl+K): one search box that inserts, finds commands and jumps to
    slides.

## Study complete

All seven tools are covered (2026-11-25 to 28). Next: the before-audit of
Forge's own pages (`before-audit.md`), then the design direction with the
Claude Design skill.
