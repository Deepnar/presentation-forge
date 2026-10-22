import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';
import { renderPptx } from '../../../packages/renderer-pptx/render.ts';
import { uniquePptxShapeIds } from '../../../packages/renderer-pptx/shape-ids.ts';
import { nativeIdScenes } from '../../../test/helpers/native-id-fixture.js';
import { preview } from '../../../src/preview.js';
const out = 'out/v2-pptx-id-review';
const evidence = 'docs/v2-pptx-id-evidence/independent';
await copyFile('out/v2-pptx-id-validation/native/before.pptx', `${out}/before.pptx`, constants.COPYFILE_EXCL);
const before = await readFile(`${out}/before.pptx`);
await writeFile(`${out}/repaired.pptx`, await uniquePptxShapeIds(before), { flag: 'wx' });
const scenes = nativeIdScenes(), original = structuredClone(scenes), start = performance.now();
await writeFile(`${out}/fresh.pptx`, await renderPptx(scenes, { title: 'Native shape identity regression', author: 'Forge' }), { flag: 'wx' });
const milliseconds = performance.now() - start;
assert.deepEqual(scenes, original);
const rendered = {};
for (const phase of ['before', 'repaired', 'fresh']) {
  rendered[phase] = await preview(`${out}/${phase}.pptx`, { outDir: `${out}/${phase}-preview`, dpi: 110 });
  assert.equal(rendered[phase].pages.length, 3);
}
const comparisons = [];
for (let i = 0; i < 3; i++) {
  const old = await sharp(rendered.before.pages[i]).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const phase of ['repaired', 'fresh']) {
    const current = await sharp(rendered[phase].pages[i]).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual(current.info, old.info);
    let changedChannels = 0;
    for (let j = 0; j < old.data.length; j++) if (old.data[j] !== current.data[j]) changedChannels++;
    assert.equal(changedChannels, 0);
    comparisons.push({ slide: i + 1, phase, width: old.info.width, height: old.info.height, changedChannels });
  }
}
await writeFile(`${evidence}/raster.json`, JSON.stringify({ scenesUnchanged: true, freshRenderMilliseconds: milliseconds, comparisons, images: Object.values(rendered).flatMap(r => r.pages), interactivePowerPointExecuted: false }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ slides: 3, renders: 9, comparisons: comparisons.length, milliseconds, scenesUnchanged: true }));
