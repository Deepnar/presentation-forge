# V2-5F evidence

Real Chrome runs over committed fixtures (`mech-warm-humanist-plain`
slide 1 `m-prose`, `mech-warm-humanist-chromed` slide 3), plus
headless engine/OOXML assertions in `test/v2-paragraph-5f.test.js`
and `test/v2-textformat-5f.test.js`.

Reproduce:

```
node tools/v2-5f-eval.mjs            # out/v2-5f/eval-*.png + eval-manifest.json
node --test test/v2-paragraph-5f.test.js test/v2-textformat-5f.test.js  # 33/33 headless
node --test test/v2-edit-chrome-5f.test.js  # 5/5 real Chrome (isolated; needs google-chrome-stable)
```

Driver: `tools/v2-5f-eval.mjs` (serves `app/web/dist` on
127.0.0.1:5248). `manifest.json` is the driver's verbatim output.

| shot | shows |
|---|---|
| `eval-multi-editing.png` | textarea over the 4-bullet body with appended fifth line; layout undisplaced (overlay-vs-element ≤ 0.02px, see manifest) |
| `eval-multi-committed.png` | five bullets committed in one revision |
| `eval-formatted.png` | second bullet native blue, siblings ink; per-paragraph dock rows; honest overflow warning (5 lines in a 4-line box — commit landed whole, rev 2) |
| `eval-format-undone.png` | undo restored the compiler bullet color |
| `eval-mixed-committed.png` | mixed label+body reworded on chrome with label bold intact, rev 1, chrome untouched |

Scene and OOXML values (not screenshots alone): slot-attached
styles, structural edits, validation codes, ownership flags,
regeneration carries, and slide-XML colors/bullets are asserted
headless — see `docs/V2-5F-EVAL.md` §§3–4, 8–10.
