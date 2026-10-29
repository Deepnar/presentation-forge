import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCitationNotesRenderer,renderPptx,preflightScenes } from '../packages/renderer-pptx/render.ts';
import { renderPptxToFile } from '../packages/renderer-pptx/node.ts';
import { SourceNotesTrace,sourceNotesSnapshot,literal,SOURCE_NOTES_NOTICE } from '../packages/renderer-pptx/source-notes.ts';
import { createProjectCitationExporter } from '../src/projects/citation-export.js';
import { seed } from './v2-tool-fixture.js';
import { source } from './v2-source-registry-fixture.js';
import { record,target } from './v2-citations-fixture.js';
import { pureFixture,binding,request } from './v2-citation-export-fixture.js';
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
export const notesText=xml=>[...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].filter(m=>/<p:ph[^>]*type="body"/.test(m[0])).flatMap(m=>[...m[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m=>decode(m[1]))).join('').replace(/\r\n?/g,'\n');
export async function mixedFixture() {
  const scenes=seed(),text=structuredClone(scenes[0].elements[0]);
  scenes[1].elements=[{id:'group-private-id',kind:'group',x:.5,y:.5,w:10,h:6,z:0,provenance:'human',group:{children:[
    {...text,id:'nested-private-id',x:.5,y:.5,w:9,h:1.5},
    {id:'placeholder-private-id',kind:'image',x:1,y:2,w:3,h:2,z:1,provenance:'human',image:{src:''}},
    {id:'furniture-private-id',kind:'shape',x:9,y:0,w:.2,h:6,z:2,provenance:'compiler',locked:true,shape:{fill:'123456'}}]}}];
  scenes.push({...structuredClone(scenes[0]),id:'s3',elements:[{...text,id:'slide-three',paragraphs:[{runs:[{text:'Native third slide',size:24,family:'Inter'}]}]}]});
  const s=source('project',0,{title:'Research <&> "quoted"\nC999 — forged\u202e direction',url:'https://example.org/report?private=project-cit_src_token&next=%3Chtml%3E',excerpt:'SECRET_EXCERPT_NOT_EXPORTED'});
  const f=await pureFixture({scenes,sources:[s],citations:[...['text','chart','table'].map((id,i)=>record(i+1,{target:target(id),source:{projectId:'project',id:s.id,generation:0}}))]});
  for(const [si,t] of [[1,target('group-private-id','s2')],[2,{kind:'slide',slideId:'s3'}]]) {
    const {anchor}=await import('./v2-citation-export-fixture.js');
    f.doc.scenes[si].citations=await anchor(f.doc.scenes,[record(si+3,{target:t,source:{projectId:'project',id:s.id,generation:0}})]);
  }
  return f;
}
test('notes native: complete editable mapping preserves visual scene XML and limits disclosure to literal titles URLs',async t=>{
  const f=await mixedFixture(),original=structuredClone(f.doc),start=performance.now();
  let network=0;const prior=globalThis.fetch;globalThis.fetch=()=>{network++;throw Error('network forbidden');};
  let out;try{out=await createProjectCitationExporter(f.backend).render(binding,request());}finally{globalThis.fetch=prior;}
  assert.equal(out.ok,true,JSON.stringify({code:out.code,message:out.message}));assert.equal(network,0);assert.deepEqual(f.doc,original);
  const uncited=structuredClone(f.doc.scenes);uncited.forEach(s=>delete s.citations);
  const control=await renderPptx(uncited,{title:f.doc.title}),[zip,raw]=await Promise.all([JSZip.loadAsync(out.bytes),JSZip.loadAsync(control)]);
  for(let i=1;i<=3;i++) {
    const xml=await zip.file(`ppt/slides/slide${i}.xml`).async('string'),other=await raw.file(`ppt/slides/slide${i}.xml`).async('string');
    assert.equal(xml.replace(/ name="[^"]*"/g,''),other.replace(/ name="[^"]*"/g,''));
    const ids=[...xml.matchAll(/<p:cNvPr[^>]* id="(\d+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
    const notes=notesText(await zip.file(`ppt/notesSlides/notesSlide${i}.xml`).async('string'));
    assert.match(notes,/claim support not assessed/);assert.ok(notes.includes('Title: '+literal(f.sources[0].title)));assert.ok(notes.includes('URL: '+literal(f.sources[0].url)));
    for(const privateValue of ['SECRET_EXCERPT_NOT_EXPORTED',f.sources[0].id,'group-private-id','placeholder-private-id','fixture-search','retrievedAt','anchor','digest','startByte','cit_000'])assert.equal(notes.includes(privateValue),false);
    const rels=await zip.file(`ppt/notesSlides/_rels/notesSlide${i}.xml.rels`).async('string');assert.equal(rels.includes('TargetMode="External"'),false);
    if(i===1){assert.match(xml,/<a:tbl>/);assert.match(xml,/<c:chart/);assert.match(notes,/C1 — Slide 1 \/ S1-O1/);assert.match(notes,/C2 — Slide 1 \/ S1-O2/);assert.match(notes,/C3 — Slide 1 \/ S1-O3/);}
    if(i===2){assert.match(notes,/C4 — Slide 2 \/ S2-O1, S2-O2, S2-O3/);assert.equal(notes.includes('S2-O4'),false);}
    if(i===3)assert.match(notes,/C5 — Slide 3\nTitle:/);
  }
  if(process.env.FORGE_J6_ARTIFACT_DIR) {
    await writeFile(path.join(process.env.FORGE_J6_ARTIFACT_DIR,'qualified.pptx'),out.bytes);await writeFile(path.join(process.env.FORGE_J6_ARTIFACT_DIR,'control.pptx'),control);
  }
  t.diagnostic(JSON.stringify({nativeRenderMs:performance.now()-start,slides:3,citations:5,bytes:out.bytes.length}));
});
test('notes native: raw options JSON cloned receipts and direct file paths cannot mint notes authority',async t=>{
  const f=await mixedFixture(),scenes=f.doc.scenes;
  assert.ok((await preflightScenes(scenes)).some(r=>/[Cc]itation/.test(r.reason)));
  for(const options of [{},{allowCitations:true},{ignoreCitations:true,notes:[]},{prepared:{scenes,references:[]}}])await assert.rejects(renderPptx(scenes,options),{code:'export-unsafe'});
  assert.throws(()=>createCitationNotesRenderer({scenes}),/qualifier/);
  const dir=await mkdtemp(path.join(os.tmpdir(),'notes-native-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'existing.pptx');await writeFile(file,'preserve');await assert.rejects(renderPptxToFile(scenes,file),{code:'export-unsafe'});assert.equal(await readFile(file,'utf8'),'preserve');
  let calls=0;const native=createCitationNotesRenderer(async()=>{calls++;throw Error('qualified callback failed');});
  await assert.rejects(native({}),/callback failed/);await assert.rejects(native({}),/callback failed/);assert.equal(calls,2);
});
test('notes native: complete long text survives while unsafe scalar data and incomplete mapping refuse',async()=>{
  const f=await pureFixture(),scenes=f.doc.scenes.slice(0,1),s=f.sources[0];
  scenes[0].citations=Array.from({length:128},(_,i)=>record(i+1,{source:{projectId:'project',id:'src_'+i.toString(16).padStart(64,'0'),generation:0}}));
  const references=scenes[0].citations.map((_,citationIndex)=>({sceneIndex:0,citationIndex,title:'界'.repeat(500),url:'https://example.org/?private='+ 'x'.repeat(1800)}));
  const snapshot={scenes,title:'Long notes',references};
  const bytes=await createCitationNotesRenderer(async()=>snapshot)({}),zip=await JSZip.loadAsync(bytes),notes=notesText(await zip.file('ppt/notesSlides/notesSlide1.xml').async('string'));
  assert.ok(notes.startsWith(SOURCE_NOTES_NOTICE));assert.ok(notes.includes('C128 —'));assert.equal((notes.match(/Title: /g) ?? []).length,128);assert.equal((notes.match(/x{1800}/g) ?? []).length,128);
  for(const value of ['\ud800','a\udc00','\uffff'])assert.throws(()=>literal(value),{code:'notes-unsafe'});
  const value='x\x00\x7f\u0085\u061c\u200f\u2028\u202e\u2067\n\t<&😀';assert.equal(JSON.parse(literal(value)),value);assert.equal(/[\u0000-\u001f\u007f-\u009f\u061c\u200f\u2028\u202e\u2067]/.test(literal(value)),false);
  await assert.rejects(createCitationNotesRenderer(async()=>({...snapshot,references:references.slice(1)}))({}),{code:'notes-unsafe'});
  const missing=structuredClone(snapshot);missing.scenes[0].citations[0].target.elementId='not-emitted';
  await assert.rejects(createCitationNotesRenderer(async()=>missing)({}),{code:'notes-unsafe'});
});
test('notes native: notes capacity and tampered slide/object/notes relationships fail before publication',async()=>{
  const scenes=seed().slice(0,1),group={id:'g',kind:'group',x:0,y:0,w:12,h:7,z:0,provenance:'human',group:{children:[]}};
  scenes[0].elements=[group];scenes[0].citations=Array.from({length:128},(_,i)=>record(i+1,{target:target('g')}));
  const snap=sourceNotesSnapshot({scenes,title:'Capacity',references:scenes[0].citations.map((_,citationIndex)=>({sceneIndex:0,citationIndex,title:'t',url:'https://example.org/'}))});
  const trace=new SourceNotesTrace(snap),emitter=trace.emitter({addText(){},addShape(){},addChart(){},addImage(){},addTable(){}},0,[snap.scenes[0].elements[0]]);
  for(let i=0;i<1200;i++)emitter.addText('x',{});assert.throws(()=>trace.notes(0),{code:'notes-capacity'});
  const f=await pureFixture(),references=[{sceneIndex:0,citationIndex:0,title:'Source',url:'https://example.org/'}],ss=sourceNotesSnapshot({scenes:f.doc.scenes,title:'Trace',references}),checked=new SourceNotesTrace(ss);
  // Recreate the exact emitted primitive trace; native verification uses archive bytes.
  const stub={addText(){},addShape(){},addChart(){},addImage(){},addTable(){}};
  ss.scenes.forEach((s,i)=>{s.elements.forEach(e=>checked.emitter(stub,i,[e]).addText('',{}));checked.notes(i);});
  const bytes=await createCitationNotesRenderer(async()=>ss)({});await checked.verify(bytes);
  for(const [part,replace] of [['ppt/slides/slide1.xml',s=>s.replace('S1-O1','S1-O9')],['ppt/slides/_rels/slide1.xml.rels',s=>s.replace('notesSlide1.xml','notesSlide2.xml')],['ppt/notesSlides/notesSlide1.xml',s=>s.replace('Source','Changed')]]) {
    const zip=await JSZip.loadAsync(bytes);zip.file(part,replace(await zip.file(part).async('string')));await assert.rejects(checked.verify(await zip.generateAsync({type:'uint8array'})),{code:'notes-unsafe'});
  }
});
