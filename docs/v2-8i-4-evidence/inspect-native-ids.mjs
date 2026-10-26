import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';

const root = 'docs/v2-8i-4-evidence';
const { implementationSha } = JSON.parse(await readFile(`${root}/validation-plan.json`, 'utf8'));
const native = JSON.parse(await readFile(`${root}/native-archives.json`, 'utf8'));
const browser = JSON.parse(await readFile(`${root}/browser-archives.json`, 'utf8'));
const http = JSON.parse(await readFile(`${root}/http-archives.json`, 'utf8'));
assert.equal(http.length, 2);
assert.equal(native.length, 8);
assert.equal(browser.length, 5);
const records = [];
for (const row of [...native.map(r => ({ ...r, file: r.pptx })),
  ...[...browser, ...http].map(r => ({ ...r, file: r.originalArchive }))]) {
  const bytes = await readFile(row.file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256);
  const zip = await JSZip.loadAsync(bytes), parts = [];
  for (const name of Object.keys(zip.files).filter(n => /^ppt\/.*\.xml$/.test(n))) {
    const xml = await zip.file(name).async('string');
    const properties = [...xml.matchAll(/<p:cNvPr\b([^>]*)>/g)];
    if (!properties.length) continue;
    const ids = properties.map(([, attributes]) => {
      const id = /\bid="([0-9]+)"/.exec(attributes)?.[1];
      assert.ok(id, `${row.file}: ${name}: missing numeric identity`);
      assert.ok(BigInt(id) <= 4294967295n);
      return BigInt(id).toString();
    });
    assert.equal(new Set(ids).size, ids.length, `${row.file}: ${name}: duplicate identity`);
    parts.push({ part: name, nonvisualProperties: ids.length });
  }
  assert.ok(parts.some(p => /^ppt\/slides\/slide\d+\.xml$/.test(p.part)));
  records.push({ file: row.file, sha256: row.sha256, parts });
}
await writeFile(`${root}/native-identity-audit.json`, JSON.stringify({
  implementationSha, exitCode: 0, archives: records.length,
  parts: records.reduce((n, r) => n + r.parts.length, 0),
  nonvisualProperties: records.reduce((n, r) => n + r.parts.reduce((m, p) => m + p.nonvisualProperties, 0), 0),
  records,
  limitation: 'Numeric uniqueness in generated OOXML parts; no interactive Microsoft PowerPoint qualification.',
}, null, 2) + '\n');
console.log(`Verified numeric nonvisual identities in ${records.length} original native archives.`);
