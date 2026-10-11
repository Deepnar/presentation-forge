# Table-editor evidence

Real Chrome runs over committed fixtures (`mech-warm-humanist-plain`
slide 4 `m-table`, `mech-warm-humanist-chromed` slide 4), plus
headless engine/OOXML assertions in `test/v2-table-edit.test.js`.

Reproduce:

```
node tools/table-eval.mjs                # out/table-editor/eval-*.png + eval-manifest.json
node --test test/v2-table-edit.test.js   # 22/22 headless
node --test test/v2-edit-chrome-table.test.js  # 3/3 real Chrome (isolated; needs google-chrome-stable)
```

Driver: `tools/table-eval.mjs` (serves `app/web/dist` on
127.0.0.1:5253). `manifest.json` is the driver's verbatim output.

| shot | shows |
|---|---|
| `eval-grid.png` | table editor grid with header note over the 2×2 fixture |
| `committed.png` | edited cell committed in one revision, inspector `human` |
| `eval-committed.png` | driver cell edit committed |
| `added.png` | added row and column on the slide with updated grid |
| `eval-overflow.png` | grown 4×3 table kept whole with an explicit row-3 density warning, geometry unchanged |
| `eval-undone.png` | undo restored the prior matrix exactly |
| `eval-chromed.png` | header wording edited on a chromed slide, marks intact |
| `narrow.png` | grid usable and committing at 900px width |

Scene and OOXML values (not screenshots alone): matrix rules,
fidelity strings, ownership flags, regeneration carries, and
slide-XML `<a:t>` cells are asserted headless — see
`docs/V2-5H-EVAL.md` §§3–4, 8–10.
