import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { preview } from '../../src/preview.js';

const root = 'docs/v2-8e-evidence';
const scratch = process.env.FORGE_VALIDATION_OUT ?? 'out/v2-8e-validation';
await mkdir(`${root}/native`, { recursive: true });
const records = [];
for (const [name, source, selected] of [
  ['chart', 'out/v2-7b-1-validation/browser/imported-chart.pptx', [1]],
  ['table', 'out/v2-7b-1-validation/browser/imported-table.pptx', [2]],
  ['handoff', 'out/v2-7b-2-validation/browser/handoff.pptx', [0, 1, 2]],
]) {
  const bytes = await readFile(source), zip = await JSZip.loadAsync(bytes);
  const slides = Object.keys(zip.files).filter(file => /^ppt\/slides\/slide\d+\.xml$/.test(file));
  const chartFiles = Object.keys(zip.files).filter(file => /^ppt\/charts\/chart\d+\.xml$/.test(file));
  let nativeTable = false;
  for (const file of slides) if ((await zip.file(file).async('string')).includes('<a:tbl>')) nativeTable = true;
  if (name === 'chart') {
    const xml = await zip.file(chartFiles[0]).async('string');
    for (const text of ['Human chart', '1.25', '12.5']) assert.ok(xml.includes(text));
  } else if (name === 'table') {
    const xml = await zip.file('ppt/slides/slide3.xml').async('string');
    assert.ok(xml.includes('<a:tbl>') && xml.includes('Human table'));
  } else {
    assert.equal(slides.length, 3);
    assert.ok((await zip.file('ppt/slides/slide1.xml').async('string')).includes('Imported results'));
    const chart = await zip.file(chartFiles[0]).async('string');
    for (const value of ['1.25', '12.5']) assert.ok(chart.includes(value));
    const table = await zip.file('ppt/slides/slide3.xml').async('string');
    assert.ok(table.includes('<a:tbl>') && table.includes('Measurements'));
  }

  const rendered = await preview(source, { outDir: path.resolve(scratch, `native-${name}`) });
  assert.equal(rendered.pages.length, slides.length);
  const rasters = [];
  for (const index of selected) {
    const destination = `${root}/native/${name}-${index + 1}.png`;
    await copyFile(rendered.pages[index], destination); rasters.push(destination);
  }
  records.push({ source, backend: 'SQLite; authenticated current serial B1/B2 browser exports', sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, slideCount: slides.length, chartParts: chartFiles.length, nativeTable, nativeAssertions: 'passed', rasters });
}
await writeFile(`${root}/export-inspection.json`, `${JSON.stringify({ implementationSha: JSON.parse(await readFile(`${root}/validation-plan.json`, 'utf8')).implementationSha, renderer: 'Actual authenticated exports; src/preview.js via LibreOffice/Poppler', records, limitation: 'LibreOffice rasters do not establish interactive Microsoft PowerPoint behavior.' }, null, 2)}\n`);
console.log('Native OOXML checks and five selected slide rasters produced; visual inspection is separate.');
