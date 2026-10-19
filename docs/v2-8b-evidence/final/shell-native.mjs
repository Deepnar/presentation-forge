import {readFile,mkdir,writeFile,copyFile,stat} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import {preview} from '../../../src/preview.js';
const root='docs/v2-8b-evidence/final',out='out/v2-8b-final-validation',records=[];
const serial=JSON.parse(await readFile(`${out}/coordinator.json`,'utf8')).find(run=>run.name==='v2-edit-chrome-7a.test');assert.ok(serial&&serial.exitCode===0);
for(const kind of ['chart','table']){
 const source=`out/v2-7a-validation/shell-${kind}.pptx`;
 assert.ok((await stat(source)).mtimeMs>=Date.parse(serial.atUtc));
 const bytes=await readFile(source),zip=await JSZip.loadAsync(bytes),slides=Object.keys(zip.files).filter(f=>/^ppt\/slides\/slide\d+\.xml$/.test(f));
 assert.equal(slides.length,1);const slide=await zip.file(slides[0]).async('string');
 if(kind==='chart'){const charts=Object.keys(zip.files).filter(f=>/^ppt\/charts\/chart\d+\.xml$/.test(f));assert.equal(charts.length,1);assert.ok((await zip.file(charts[0]).async('string')).includes('Shell edited'));assert.ok(slide.includes('<c:chart'));}
 else assert.ok(slide.includes('<a:tbl>')&&slide.includes('Shell edited'));
 const result=await preview(source,{outDir:path.resolve(out,`native-shell-${kind}`)});assert.equal(result.pages.length,1);
 const raster=`${root}/native/shell-${kind}.png`;await mkdir(`${root}/native`,{recursive:true});await copyFile(result.pages[0],raster);
 records.push({source,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,slideCount:1,nativeAssertions:'passed',backend:'SQLite; authenticated actual embedded editor save/export from complete7A suite',rasters:[raster]});
}
await writeFile(`${root}/shell-export-inspection.json`,JSON.stringify({implementationSha:JSON.parse(await readFile(`${root}/validation-plan.json`,'utf8')).implementationSha,renderer:'src/preview.js through LibreOffice/Poppler',records,limitation:'Raster inspection does not establish interactive Microsoft PowerPoint behavior.'},null,2)+'\n');
console.log('Two actual embedded-shell exports verified and rasterized; inspect images separately.');
