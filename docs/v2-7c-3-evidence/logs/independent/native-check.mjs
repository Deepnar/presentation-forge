import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { preview } from '../../../../src/preview.js';

const output = new URL('./', import.meta.url).pathname;
const records = [];
for (const [name, source, freshness] of [
  ['shell-chart', 'out/v2-7c-3-independent/shell-chart.pptx', 'fresh independent complete 7A authenticated SQLite export'],
  ['shell-table', 'out/v2-7c-3-independent/shell-table.pptx', 'fresh independent complete 7A authenticated SQLite export'],
  ['toolbar-shapes', 'out/v2-7c-3-independent/postgres-toolbar-shapes.pptx', 'fresh independent complete toolbar authenticated PostgreSQL export'],
  ['handoff', 'out/v2-7c-3-validation/browser/handoff.pptx', 'inspected implementer final-source authenticated SQLite export; exact recorded hash'],
]) {
  const bytes = await readFile(source), sha256 = createHash('sha256').update(bytes).digest('hex');
  const zip = await JSZip.loadAsync(bytes);
  const slides = Object.keys(zip.files).filter(file => /^ppt\/slides\/slide\d+\.xml$/.test(file));
  const charts = Object.keys(zip.files).filter(file => /^ppt\/charts\/chart\d+\.xml$/.test(file));
  const first = await zip.file('ppt/slides/slide1.xml').async('string');
  if (name === 'shell-chart') {
    assert.equal(slides.length, 1); assert.equal(charts.length, 1);
    assert.ok(first.includes('<c:chart'));
    assert.ok((await zip.file(charts[0]).async('string')).includes('Shell edited'));
  } else if (name === 'shell-table') {
    assert.equal(slides.length, 1); assert.ok(first.includes('<a:tbl>') && first.includes('Shell edited'));
  } else if (name === 'toolbar-shapes') {
    assert.equal(slides.length, 3);
    for (const form of ['rect', 'roundRect', 'ellipse']) assert.ok(first.includes(`prst="${form}"`));
    assert.ok(first.includes('<a:t>New text</a:t>'));
  } else {
    const existing = JSON.parse(await readFile('docs/v2-7c-3-evidence/export-inspection.json', 'utf8'));
    assert.equal(sha256, existing.records.find(record => record.source === source).sha256);
    assert.equal(slides.length, 3); assert.ok(first.includes('Imported results'));
    const chart = await zip.file(charts[0]).async('string');
    assert.ok(chart.includes('1.25') && chart.includes('12.5'));
    const table = await zip.file('ppt/slides/slide3.xml').async('string');
    assert.ok(table.includes('<a:tbl>') && table.includes('Measurements') && table.includes('12.5'));
  }
  const destination = path.join(output, 'native', name); await mkdir(destination, { recursive: true });
  const rendered = await preview(source, { outDir: destination });
  assert.equal(rendered.pages.length, slides.length);
  records.push({ name, source, freshness, sha256, slideCount: slides.length, assertions: 'passed', renderedPages: rendered.pages });
}
await writeFile(path.join(output, 'native-inspection.json'), `${JSON.stringify({ implementationSha: '484875ff5c826a34028889ed2fc6118bfdc407ad', records, pagesRasterized: 8, inspectedVisually: false, limitation: 'Native PowerPoint interaction is not established by LibreOffice/Poppler rendering.' }, null, 2)}\n`);
console.log('Fresh shell/toolbar and recorded handoff native assertions pass; eight pages rasterized. Visual inspection remains separate.');
