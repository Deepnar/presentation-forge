import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { uniqueShapeIds, uniquePptxShapeIds } from '../../../packages/renderer-pptx/shape-ids.ts';

test('root zero, lexical first IDs, later reservations and repeated duplicates are preserved deterministically', () => {
  const xml = '<p:spTree><p:cNvPr id="0" name="Root"/><p:cNvPr id="02"/><p:cNvPr id="2"/><p:cNvPr id="1"/><p:grpSp><p:cNvPr id="2"/><p:cNvPr id="3"/></p:grpSp></p:spTree>';
  assert.equal(uniqueShapeIds(xml), xml.replace('id="2"/>', 'id="4"/>').replace('id="2"/>', 'id="5"/>'));
});

test('valid boundary IDs and empty shape parts remain byte-identical', () => {
  for (const xml of ['', '<p:spTree/>', '<p:cNvPr id="0"/><p:cNvPr id="4294967295"/>']) assert.equal(uniqueShapeIds(xml), xml);
});

test('all duplicate-target lexical spellings refuse while unique-target references survive', () => {
  const xml = '<p:cNvPr id="02"/><p:cNvPr id="2"/><p:cNvPr id="8"/>';
  for (const ref of ['<p:spTgt spid = \'02\'/>', '<p:bldDgm spid="2"/>', '<x:ref spId="2"/>', '<x:ref shapeId="2"/>', '<a:stCxn idx="0" id = \'02\'/>']) assert.throws(() => uniqueShapeIds(xml + ref), /ambiguous duplicate shape reference/);
  assert.equal(uniqueShapeIds(xml + '<a:endCxn id="8"/>'), xml.replace('id="2"/>', 'id="1"/>') + '<a:endCxn id="8"/>');
});

test('missing and non-integer identities fail closed', () => {
  for (const xml of ['<p:cNvPr name="missing"/>', '<p:cNvPr id="1.5"/>', '<p:cNvPr id="-0"/>', '<p:cNvPr id="NaN"/>']) assert.throws(() => uniqueShapeIds(xml), /invalid nonvisual id/);
});

test('a duplicate reference anywhere in one part rejects the whole archive', async () => {
  const zip = new JSZip();
  zip.file('ppt/slides/slide1.xml', '<p:cNvPr id="1"/><p:cNvPr id="1"/>');
  zip.file('ppt/slides/slide2.xml', '<p:cNvPr id="2"/><p:cNvPr id="2"/><p:spTgt spid="2"/>');
  await assert.rejects(uniquePptxShapeIds(await zip.generateAsync({ type: 'uint8array' })), /ambiguous duplicate shape reference/);
});
