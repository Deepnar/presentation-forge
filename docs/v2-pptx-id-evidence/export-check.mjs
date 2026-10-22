import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { renderPptx } from '../../packages/renderer-pptx/render.ts';
import { nativeIdScenes } from '../../test/helpers/native-id-fixture.js';
import { preview } from '../../src/preview.js';
const root='docs/v2-pptx-id-evidence';
const plan=JSON.parse(await readFile(`${root}/validation-plan.json`));
const scenes=nativeIdScenes(), saved=structuredClone(scenes), start=performance.now();
const bytes=await renderPptx(scenes,{title:'Native shape identity regression',author:'Forge'});
const renderMilliseconds=performance.now()-start;
assert.deepEqual(scenes,saved);
await writeFile('out/v2-pptx-id-validation/native/after.pptx',bytes,{flag:'wx'});
await mkdir(`${root}/images`,{recursive:true});
const renders={};
for(const phase of ['before','after']) {
 const output=await preview(`out/v2-pptx-id-validation/native/${phase}.pptx`,{outDir:`out/v2-pptx-id-validation/native/${phase}-preview`,dpi:110});
 assert.equal(output.pages.length,3);
 renders[phase]=[];
 for(const [i,file] of output.pages.entries()) {
  const destination=`${root}/images/${phase}-${i+1}.png`;
  await copyFile(file,destination);renders[phase].push(destination);
 }
}
const comparisons=[];
for(let i=0;i<3;i++) {
 const before=await sharp(renders.before[i]).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const after=await sharp(renders.after[i]).removeAlpha().raw().toBuffer({resolveWithObject:true});
 assert.deepEqual(before.info,after.info);
 let changedChannels=0;
 for(let k=0;k<before.data.length;k++) if(before.data[k]!==after.data[k]) changedChannels++;
 assert.equal(changedChannels,0,`slide ${i+1} pixels must remain identical`);
 comparisons.push({slide:i+1,width:after.info.width,height:after.info.height,changedChannels,before:renders.before[i],after:renders.after[i]});
}
await writeFile(`${root}/raster-comparison.json`,JSON.stringify({implementationSha:plan.implementationSha,renderMilliseconds,pptxBytes:bytes.length,scenesUnchanged:true,comparisons,interactivePowerPointExecuted:false},null,2)+'\n');
console.log(JSON.stringify({renderMilliseconds,pptxBytes:bytes.length,slides:3,changedChannels:0}));
