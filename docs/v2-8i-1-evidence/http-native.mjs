import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import JSZip from 'jszip';
import { preview } from '../../src/preview.js';

const root = 'docs/v2-8i-1-evidence';
const out = process.env.FORGE_VALIDATION_OUT ?? 'out/v2-8i-1-validation';
const { implementationSha } = JSON.parse(await readFile(`${root}/validation-plan.json`, 'utf8'));
const runs = JSON.parse(await readFile(`${out}/coordinator.json`, 'utf8'));
const records = [], images = [];
for (const [backend, job] of [['sqlite', 'bulk'], ['postgres', 'v2-conversation-http-postgres-8i.test']]) {
  const run = runs.find(row => row.name === job);
  assert.ok(run && run.exitCode === 0 && run.implementationSha === implementationSha);
  assert.ok(!run.tests.fail && !run.tests.skip && !run.tests.cancelled);
  const source = `${out}/http/${backend}-approved.pptx`;
  assert.ok((await stat(source)).mtimeMs >= Date.parse(run.atUtc));
  const bytes = await readFile(source), zip = await JSZip.loadAsync(bytes);
  const slides = Object.keys(zip.files).filter(file => /^ppt\/slides\/slide\d+\.xml$/.test(file));
  assert.equal(slides.length, 2);
  const slide = await zip.file('ppt/slides/slide1.xml').async('string');
  const chart = await zip.file('ppt/charts/chart1.xml').async('string');
  assert.ok(slide.includes('Reviewed ') && slide.includes('<a:tbl>') && slide.includes('15.75'));
  assert.ok(chart.includes('Reviewed score') && chart.includes('15.75'));
  const originalArchive = `${root}/http-archives/${backend}-approved.pptx`;
  await mkdir(path.dirname(originalArchive), { recursive: true });
  await copyFile(source, originalArchive);
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.equal(createHash('sha256').update(await readFile(originalArchive)).digest('hex'), digest);
  const rendered = await preview(source, { outDir: path.resolve(out, `http-native-${backend}`) });
  assert.equal(rendered.pages.length, 2);
  const rasters = [];
  for (const [index, raster] of rendered.pages.entries()) {
    const file = `${root}/native/http-${backend}-${index + 1}.png`;
    await mkdir(path.dirname(file), { recursive: true });
    await copyFile(raster, file);
    rasters.push(file);
    images.push({ file, implementationSha, sha256: createHash('sha256').update(await readFile(file)).digest('hex') });
  }
  records.push({ source, originalArchive, implementationSha, sha256: digest, bytes: bytes.length,
    backend, job, slideCount: 2, nativeAssertions: 'passed', rasters,
    provenance: 'Authenticated production HTTP approval, canonical run execution, and authenticated PPTX export; offline provider fixture.' });
}
await writeFile(`${root}/http-archives.json`, JSON.stringify(records, null, 2) + '\n');
await writeFile(`${root}/http-images.json`, JSON.stringify(images, null, 2) + '\n');
console.log('Preserved two actual HTTP-approved native exports and four rasters; visual inspection remains separate.');
