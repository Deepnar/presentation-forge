import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import sharp from 'sharp';
import {rig,edit,textEdit,target} from '../../test/v2-tool-fixture.js';
import {composeInstructions} from '../../packages/agent/context.ts';
import {sceneToSvg} from '../../packages/editor/scene-svg.js';
import {renderPptx} from '../../packages/renderer-pptx/render.ts';
import {preview} from '../../src/preview.js';

const root='docs/v2-8a-evidence',out='out/v2-8a-validation';
test('bound headless caller edits content and preserves the authoritative scene through export',async()=>{
 await mkdir(`${root}/native`,{recursive:true});
 const {tools,document}=await rig(),before=document.snapshot();
 const context=await composeInstructions({session:tools,request:'Summarize the selected results using the exact supplied data.',reads:[{tool:'get_slide',args:{slideId:'s1'}}]});
 assert.equal(context.ok,true);const input=JSON.stringify(context);
 for(const forbidden of ['112233','445566','Inter','Unrelated private slide','ownerId','semanticRef'])assert.equal(input.includes(forbidden),false,forbidden);
 const result=await tools.execute(edit([textEdit('Reviewed '),{kind:'chart',...target('chart'),categories:['First','Second'],series:[{name:'Reviewed score',values:[2.5,15.75]}]},{kind:'table',...target('table'),rows:[['Cell','Score'],['First','2.5'],['Second','15.75']]}]),'evidence-content');
 assert.equal(result.ok,true);assert.equal(result.revision,1);assert.equal(document.status().historyLength,1);
 const after=document.snapshot(),expected=structuredClone(before.scenes);
 expected[0].elements[0].paragraphs[0].runs[0].text='Reviewed ';
 expected[0].elements[1].chart.categories=['First','Second'];expected[0].elements[1].chart.series=[{name:'Reviewed score',values:[2.5,15.75]}];
 expected[0].elements[2].table.rows=[['Cell','Score'],['First','2.5'],['Second','15.75']];
 for(const e of expected[0].elements){e.provenance='human';if(e.kind==='text')e.contentCustomized=true;else if(e.kind==='chart')e.dataCustomized=true;else e.tableCustomized=true;}
 assert.deepEqual(after.scenes,expected);assert.deepEqual(after.scenes[1],before.scenes[1]);
 await document.undo();assert.deepEqual(document.snapshot().scenes,before.scenes);
 await document.redo();assert.deepEqual(document.snapshot().scenes,after.scenes);
 const stable=before.scenes.flatMap(s=>s.elements.map(e=>({slideId:s.id,id:e.id,x:e.x,y:e.y,w:e.w,h:e.h,z:e.z})));
 assert.deepEqual(after.scenes.flatMap(s=>s.elements.map(e=>({slideId:s.id,id:e.id,x:e.x,y:e.y,w:e.w,h:e.h,z:e.z}))),stable);
 const records=[];
 for(const [label,snapshot] of [['before',before],['after',after]]){
  const source=`${root}/native/${label}.pptx`,bytes=await renderPptx(snapshot.scenes),zip=await JSZip.loadAsync(bytes);
  await writeFile(source,bytes);await writeFile(`${root}/native/${label}-scenes.json`,JSON.stringify(snapshot.scenes,null,2)+'\n');
  const charts=Object.keys(zip.files).filter(f=>/^ppt\/charts\/chart\d+\.xml$/.test(f));assert.equal(charts.length,1);
  const chart=await zip.file(charts[0]).async('string'),slide=await zip.file('ppt/slides/slide1.xml').async('string');
  assert.ok(slide.includes('<a:tbl>')&&slide.includes(label==='after'?'Reviewed ':'Measured '));
  for(const value of label==='after'?['Reviewed score','2.5','15.75']:['Score','1.25','12.5'])assert.ok(chart.includes(value),value);
  const rendered=await preview(source,{outDir:path.resolve(out,`native-foundation-${label}`)});assert.equal(rendered.pages.length,2);
  const rasters=[];
  for(let i=0;i<2;i++){
   const native=`${root}/native/${label}-${i+1}.png`;await copyFile(rendered.pages[i],native);rasters.push(native);
   const svg=sceneToSvg(snapshot.scenes[i]);await writeFile(`${root}/native/${label}-${i+1}.svg`,svg);
   await sharp(Buffer.from(svg)).png().toFile(`${root}/native/${label}-${i+1}-svg.png`);
  }
  records.push({source,backend:'Bound in-memory canonical EditorHandle; no ProjectStore or provider call',sha256:createHash('sha256').update(bytes).digest('hex'),slideCount:2,nativeAssertions:'passed',rasters});
 }
 assert.equal(await readFile(`${root}/native/before-2.svg`,'utf8'),await readFile(`${root}/native/after-2.svg`,'utf8'));
 await writeFile(`${root}/headless-inspection.json`,JSON.stringify({implementationSha:JSON.parse(await readFile(`${root}/validation-plan.json`,'utf8')).implementationSha,records,contextMeasure:context.measure,revision:result.revision,historyEntries:1,geometryDelta:0,exactUndoRedo:true,untargetedSlideByteIdentical:true,actor:document.log()[0].actor,limitation:'Scripted semantic edits exercise plumbing, not model quality. Native rasters use LibreOffice/Poppler; visual inspection is separate.'},null,2)+'\n');
});
