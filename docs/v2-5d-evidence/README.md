# V2-5D evidence

Real Chrome runs over committed fixtures (`mech-warm-humanist-plain`,
`mech-warm-humanist-chromed`), plus headless OOXML assertions in
`test/v2-text-5d.test.js` ("v2-5d native export": user text, inserted
text, and `prst="roundRect"` in `ppt/slides/slide1.xml`; multiline
`<a:br/>` structure; run color projected; no `autoFit` reliance).

Reproduce:

```
node tools/v2-5d-eval.mjs            # out/v2-5d/eval-*.png + eval-manifest.json
node --test test/v2-text-5d.test.js  # 37/37 headless (1 fails on b7915aa at import)
node --test test/v2-edit-chrome-5d.test.js  # 4/4 real Chrome (isolated; needs google-chrome-stable)
```

Source fixtures: `app/web/src/scenes/mech-warm-humanist-plain.json`
(slide index 1, `m-prose`) and `mech-warm-humanist-chromed.json`
(slide index 1). Driver: `tools/v2-5d-eval.mjs` (serves
`app/web/dist` on 127.0.0.1:5244). `manifest.json` is the driver's
verbatim output.

| shot | shows |
|---|---|
| `eval-overlay.png` | textarea over the title box mid-edit; layout undisplaced (overlay-vs-element ≤ 0.21px, see manifest) |
| `eval-committed.png` | committed title, selection ring, inspector `human`, rev 1 |
| `cancelled-edit.png` | Escape cancel: overlay closed, rev 0, slide byte-identical |
| `eval-rich-refusal.png` | 4-paragraph body honestly refused; error banner; content intact |
| `eval-chromed-inserts.png` | inserted text + rect centered on a chromed slide; chrome untouched; rev 2 |
| `inserted-shape.png` | inserted roundRect selected after `+ Round` |
| `dragged-insert.png` | inserted text dragged to its new position (rev 3), overlay aligned |

Scene and OOXML values (not screenshots alone): the commit,
ownership, regeneration (Cases A/D/E/G/H), and export suites assert
exact paragraphs, `contentCustomized`, tombstones, and slide-XML
strings — see `docs/V2-5D-EVAL.md` §§7–8, 11.
