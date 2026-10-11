# Slide-management evidence

Real Chrome runs over the committed `mech-warm-humanist-plain`
fixture (12 slides), plus headless engine/adapter/OOXML
assertions in `test/v2-slides-5i.test.js`.

Reproduce:

```
node tools/v2-5i-eval.mjs                 # out/slide-management/eval-*.png + eval-manifest.json
node --test test/v2-slides-5i.test.js     # 29/29 headless
node --test test/v2-edit-chrome-5i.test.js  # 6/6 real Chrome (isolated; needs google-chrome-stable)
```

Driver: `tools/v2-5i-eval.mjs` (serves `app/web/dist` on
127.0.0.1:5255). `manifest.json` is the driver's verbatim
output, including full slide-ID order before/after.

| shot | shows |
|---|---|
| `eval-blank.png` | `+ Slide` inserted after the active slide, navigated, empty warm stage |
| `blank.png` | same, chrome-test run |
| `eval-keyboard-reorder.png` | blank moved down by Alt+Arrow, identity followed |
| `reordered.png` | adjacent drag swap committed in one revision |
| `eval-delete-confirm.png` | two-step inline delete confirmation, no native dialog |
| `duplicated.png` | copy after its source with content preserved, `Custom` badge |
| `multiselect.png` | three selected thumbs with the bulk bar |
| `eval-detached.png` + `detached.png` | `Manual` badge on the detached thumb, state line |
| `eval-undone.png` | four undos restored order, identities, and states |
| `narrow.png` | filmstrip usable at 900px width |

Slide IDs and order accompany every claim in `manifest.json`;
authoritative order/count and OOXML slide parts are asserted
headless — see `docs/V2-5I-EVAL.md` §§11–13.
