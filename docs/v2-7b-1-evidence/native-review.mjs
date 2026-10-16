import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { preview } from '../../src/preview.js';

const root = 'docs/v2-7b-1-evidence';
const scratch = 'out/v2-7b-1-validation';
await mkdir(`${root}/native`, { recursive: true });
const records = [];
for (const [name, source, selected] of [
  ['chart', `${scratch}/browser/imported-chart.pptx`, [1]],
  ['table', `${scratch}/browser/imported-table.pptx`, [2]],
  ['relationships', `${scratch}/section-ordinals.pptx`, [0, 1, 2, 3, 4]],
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
    for (const [index, expected] of [[1, ['Section 01', 'Results']], [2, ['Section 02', 'Results']], [3, ['Treatment', 'Only adults', 'Control', 'Only children']], [4, ['Start', 'Finish', 'Section 01']], [5, ['Before: Enrollment', 'After: Enrollment']]]) {
      const xml = await zip.file(`ppt/slides/slide${index}.xml`).async('string');
      for (const text of expected) assert.ok(xml.includes(text));
    }
  }
  const rendered = await preview(source, { outDir: path.resolve(scratch, `native-${name}`) });
  assert.equal(rendered.pages.length, slides.length);
  const rasters = [];
  for (const index of selected) {
    const destination = `${root}/native/${name}-${index + 1}.png`;
    await copyFile(rendered.pages[index], destination); rasters.push(destination);
  }
  records.push({ source, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, slideCount: slides.length, chartParts: chartFiles.length, nativeTable, nativeAssertions: 'passed', rasters });
}
await writeFile(`${root}/export-inspection.json`, `${JSON.stringify({ implementationSha: '662f7d6a08647d431eded1ea17c5d13e7ca1c591', renderer: 'Actual authenticated exports; src/preview.js via LibreOffice/Poppler', records, limitation: 'LibreOffice rasters do not establish interactive Microsoft PowerPoint behavior.' }, null, 2)}\n`);
console.log('Native OOXML checks and seven selected slide rasters produced; visual inspection is separate.');
