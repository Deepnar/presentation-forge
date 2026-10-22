import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { renderPptx } from '../packages/renderer-pptx/render.ts';
import { nativeIdScenes } from './helpers/native-id-fixture.js';
import { uniqueShapeIds, uniquePptxShapeIds } from '../packages/renderer-pptx/shape-ids.ts';

test('mixed native objects have unique unsigned nonvisual IDs per slide', async () => {
  const scenes = nativeIdScenes();
  const before = structuredClone(scenes);
  const zip = await JSZip.loadAsync(await renderPptx(scenes));
  for (let i = 1; i <= scenes.length; i++) {
    const xml = await zip.file(`ppt/slides/slide${i}.xml`).async('string');
    const ids = [...xml.matchAll(/<p:cNvPr\b[^>]*\bid="([^"]+)"/g)].map(m => m[1]);
    assert.ok(ids.length >= 4, `slide ${i} includes root and mixed objects`);
    for (const id of ids) assert.ok(/^\d+$/.test(id) && Number(id) <= 4294967295);
    assert.equal(new Set(ids.map(Number)).size, ids.length, `slide ${i}: ${ids}`);
    assert.match(xml, /<a:tbl>/);
    assert.match(xml, /Native objects|Tables before|Decor, groups/);
    assert.doesNotMatch(xml, /Hidden wording/);
  }
  assert.deepEqual(scenes, before);
  assert.equal(zip.file(/^ppt\/charts\/chart\d+\.xml$/).length, 2);
  assert.equal(zip.file(/^ppt\/embeddings\/[^/]+\.xlsx$/).length, 2);
});

test('collision repair preserves all bytes except later duplicate ID attributes', () => {
  const xml = '<p:spTree><p:cNvPr id="1" name=""/><p:cNvPr name="Text &amp; 2" id="2"/>' +
    '<p:cNvPr id="4" name="Chart"/><p:cNvPr id="2" name="Table"/><p:cNvPr id="3" name="Line"/>' +
    '<p:cNvPr id="2" name="Second table"/><c:chart r:id="rId2"/></p:spTree>';
  assert.equal(uniqueShapeIds(xml), xml.replace('id="2" name="Table"', 'id="5" name="Table"').replace('id="2" name="Second table"', 'id="6" name="Second table"'));
  assert.equal(uniqueShapeIds(uniqueShapeIds(xml)), uniqueShapeIds(xml));
});

test('numeric identity reserves later valid IDs and handles the uint32 boundary', () => {
  assert.equal(uniqueShapeIds("<p:cNvPr id='4294967295'/><p:cNvPr id='4294967295'/><p:cNvPr id='1'/>"),
    "<p:cNvPr id='4294967295'/><p:cNvPr id='2'/><p:cNvPr id='1'/>");
  assert.equal(uniqueShapeIds('<p:cNvPr id="02"/><p:cNvPr id="2"/>'), '<p:cNvPr id="02"/><p:cNvPr id="1"/>');
  for (const value of ['-1', '4294967296', 'not-numeric', '']) {
    assert.throws(() => uniqueShapeIds(`<p:cNvPr id="${value}"/>`), /invalid nonvisual id/);
  }
});

test('ambiguous animation, build and connector targets refuse instead of guessing', () => {
  const shapes = '<p:cNvPr id="1"/><p:cNvPr id="2"/><p:cNvPr id="2"/>';
  for (const reference of ['<p:spTgt spid="2"/>', '<p:bldP spid="2"/>', '<a:stCxn id="2" idx="0"/>', '<a:endCxn idx="1" id="2"/>', '<x:object shapeId="2"/>']) {
    assert.throws(() => uniqueShapeIds(shapes + reference), /ambiguous duplicate shape reference/);
  }
  assert.equal(uniqueShapeIds(shapes + '<p:spTgt spid="1"/><a:hlinkClick r:id="rId2"/>'),
    shapes.replace(/id="2"\/>$/, 'id="3"/>') + '<p:spTgt spid="1"/><a:hlinkClick r:id="rId2"/>');
});

test('archive correction preserves other parts and leaves a valid archive byte-identical', async () => {
  const zip = new JSZip();
  for (const name of ['slides/slide1', 'slides/slide2', 'slideLayouts/slideLayout1', 'slideMasters/slideMaster1', 'notesSlides/notesSlide1', 'notesMasters/notesMaster1']) {
    zip.file(`ppt/${name}.xml`, '<p:cNvPr id="1"/><p:cNvPr id="2"/><p:cNvPr id="2"/>');
  }
  zip.file('ppt/slides/_rels/slide1.xml.rels', '<Relationships><Relationship Id="rId2" Target="../charts/chart1.xml"/></Relationships>');
  zip.file('ppt/charts/chart1.xml', '<chart>12.5</chart>');
  zip.file('ppt/media/image1.png', Uint8Array.from([1, 2, 3, 4]));
  const before = await zip.generateAsync({ type: 'uint8array' });
  const corrected = await uniquePptxShapeIds(before);
  const after = await JSZip.loadAsync(corrected);
  for (const part of zip.file(/\.xml$/).filter(p => !p.name.includes('/charts/'))) {
    assert.equal(await after.file(part.name).async('string'), '<p:cNvPr id="1"/><p:cNvPr id="2"/><p:cNvPr id="3"/>');
  }
  for (const name of ['ppt/slides/_rels/slide1.xml.rels', 'ppt/charts/chart1.xml', 'ppt/media/image1.png']) {
    assert.deepEqual(await after.file(name).async('uint8array'), await zip.file(name).async('uint8array'));
  }
  assert.equal(await uniquePptxShapeIds(corrected), corrected);
});
