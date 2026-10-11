# Layers evidence

Real Chrome runs over committed fixtures (`mech-warm-humanist-plain`
slides 1–2, `mech-warm-humanist-chromed` slide 1), plus headless
engine/OOXML assertions in `test/v2-layers-5j.test.js`. No fixture
deck carries groups, so group expansion is proven headlessly
(`flattenLayers`/`applyCollapse` units), not in screenshots.

Reproduce:

```
node tools/layers-eval.mjs                # out/layers/eval-*.png + eval-manifest.json
node --test test/v2-layers-5j.test.js     # 25/25 headless
node --test test/v2-edit-chrome-5j.test.js  # 5/5 real Chrome (isolated; needs google-chrome-stable)
```

Driver: `tools/layers-eval.mjs` (serves `app/web/dist` on
127.0.0.1:5257). `manifest.json` is the driver's verbatim output,
including the full layer order.

| shot | shows |
|---|---|
| `eval-tree.png` / `tree.png` | Slides/Layers tabs, readable tree, selection highlight, canvas ring |
| `eval-restacked.png` / `restacked.png` | card body sent behind its white frame — text covered, order changed |
| `eval-locked.png` / `locked.png` | locked row, failed drag, chrome marks intact |
| `eval-hidden.png` / `hidden.png` | dimmed hidden row, projection without it, chrome intact |
| `narrow.png` | panel usable at 900px width |

Scene and OOXML values (not screenshots alone): z ranks, flag
semantics, regeneration carries, and slide-XML shape sequences
are asserted headless — see `docs/V2-5J-EVAL.md` §§5–9, 11.
