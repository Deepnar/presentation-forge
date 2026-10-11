# V2-5E evidence

Real Chrome runs over committed fixtures (`mech-warm-humanist-plain`
slide 2 `m-cards`, `mech-warm-humanist-chromed` slide 1), plus
headless engine/OOXML assertions in `test/v2-resize-5e.test.js`,
`test/v2-style-5e.test.js`, and `test/v2-textcommit-5e.test.js`.

Reproduce:

```
node tools/v2-5e-eval.mjs               # out/v2-5e/eval-*.png + eval-manifest.json
node --test test/v2-resize-5e.test.js test/v2-style-5e.test.js test/v2-textcommit-5e.test.js  # 42/42 headless (18 fail on 73eb531)
node --test test/v2-edit-chrome-5e.test.js  # 5/5 real Chrome (isolated; needs google-chrome-stable)
```

Driver: `tools/v2-5e-eval.mjs` (serves `app/web/dist` on
127.0.0.1:5246). `manifest.json` is the driver's verbatim output.

| shot | shows |
|---|---|
| `eval-handles.png` | eight handles on the card frame's box corners/edges; style panel for the selected shape |
| `eval-resize-preview.png` | dashed preview rect at the candidate geometry mid-gesture |
| `eval-resized.png` | committed resize 5.817×1.32 → 7.263×2.043, `human`, rev 1, handles rebuilt |
| `eval-styled.png` | human fill `7A2E1F` on the resized card, rev 2, panel swatch updated |
| `eval-undo.png` | one undo: compiler paint restored, resized geometry kept (7.263×2.043, still `human`), rev 3 |
| `eval-cascade.png` | three inserted text boxes stepped diagonally on a chromed narrow slide, rev 3, chrome intact |

Scene and OOXML values (not screenshots alone): handle math,
zoom equations, validation codes, ownership flags, regeneration
carries, and slide-XML fill/stroke strings are asserted headless —
see `docs/V2-5E-EVAL.md` §§5, 10–11.
