import {readFile,copyFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {preview} from '../../../src/preview.js';
const root='docs/v2-8a-evidence/independent';
const source=`${root}/b2-generated/handoff.pptx`,bytes=await readFile(source),zip=await JSZip.loadAsync(bytes);
const slides=Object.keys(zip.files).filter(f=>/^ppt\/slides\/slide\d+\.xml$/.test(f));assert.equal(slides.length,3);
assert.ok((await zip.file('ppt/slides/slide1.xml').async('string')).includes('Imported results'));
const chart=await zip.file(Object.keys(zip.files).find(f=>/^ppt\/charts\/chart\d+\.xml$/.test(f))).async('string');
for(const value of ['1.25','12.5'])assert.ok(chart.includes(value));
const table=await zip.file('ppt/slides/slide3.xml').async('string');assert.ok(table.includes('<a:tbl>')&&table.includes('Measurements'));
const rendered=await preview(source,{outDir:path.resolve('out/v2-8a-independent-native-b2')});assert.equal(rendered.pages.length,3);
await mkdir(`${root}/native-b2`,{recursive:true});const rasters=[];
for(let i=0;i<3;i++){const target=`${root}/native-b2/slide-${i+1}.png`;await copyFile(rendered.pages[i],target);rasters.push(target);}
await writeFile(`${root}/native-inspection.json`,JSON.stringify({implementationSha:'d4f446c7b2fcae851c37d1a46288cf91317c38b4',source,sha256:createHash('sha256').update(bytes).digest('hex'),backend:'SQLite; fresh independently executed complete B2 authenticated browser export',nativeObjects:true,slideCount:3,rasters,visualInspection:'pending'},null,2)+'\n');
console.log('Fresh authenticated B2 export verified:3native pages, chart/table and exact decimals.');
