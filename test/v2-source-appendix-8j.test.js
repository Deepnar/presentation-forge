import test from 'node:test';import assert from 'node:assert/strict';
import { compileSourceAppendix,literalReferenceText } from '../packages/compiler/source-appendix.ts';
import { validateScene } from '../packages/model/scene.ts';
import { createDocument } from '../packages/model/engine.ts';
import { createToolSession } from '../packages/tools/session.ts';
import { createProjectSourceAppendix } from '../src/projects/source-appendix.js';
import { appendixPure,design,applyRequest } from './v2-source-appendix-fixture.js';
import { source } from './v2-source-registry-fixture.js';
import { record,target } from './v2-citations-fixture.js';
import { binding } from './v2-citation-export-fixture.js';
const options={revision:1,existingScenes:2,reservedIds:['s1','s2']};
const text=(pages,semantic)=>pages.flatMap(p=>p.elements).filter(e=>e.semanticRef===semantic).flatMap(e=>e.paragraphs.flatMap(p=>p.runs.map(r=>r.text))).join('');
test('Appendix compiler: deterministic complete Unicode/control/long URL pagination and readable native boxes',async()=>{
 const d=await design(),reference={title:'Title <literal> 界😀 e\u0301\n\u202e'+'Wide'.repeat(100),url:'https://example.org/?private='+'q'.repeat(1800),slides:[1,2]},pages=compileSourceAppendix([reference],d,options);
 assert.ok(pages.length>1);assert.deepEqual(compileSourceAppendix([reference],d,options),pages);
 for(const page of pages){assert.equal((await validateScene(page)).ok,true);assert.ok(page.elements.some(e=>e.paragraphs[0].runs[0].text==='Claim support is not assessed.'));for(const e of page.elements){assert.ok(e.x>=0&&e.y>=0&&e.x+e.w<=page.width+.001&&e.y+e.h<=page.height+.001);for(const r of e.paragraphs[0].runs)assert.ok(r.size>=12&&r.line>=1.2);}}
 assert.equal(text(pages,'reference-1-title'),literalReferenceText(reference.title));
 const words=compileSourceAppendix([{title:'Complete title '.repeat(25).trim(),url:'https://example.org/',slides:[1]}],d,options).flatMap(p=>p.elements).filter(e=>e.semanticRef==='reference-1-title').map(e=>e.paragraphs[0].runs[0].text);assert.ok(words.slice(0,-1).every(line=>line.endsWith(' ')));assert.equal(text(pages,'reference-1-url'),reference.url);assert.ok(text(pages,'reference-1-label').includes('continued'));
 const ids=pages.flatMap(p=>[p.id,...p.elements.map(e=>e.id)]);assert.equal(new Set(ids).size,ids.length);
 const collision=compileSourceAppendix([reference],d,{...options,reservedIds:[pages[0].elements[0].id]});assert.notEqual(collision[0].id,pages[0].id);
});
test('Appendix compiler: invalid scalar, impossible fit, complete scene/page and field limits refuse',async()=>{
 const d=await design(),r={title:'Title',url:'https://example.org/',slides:[1]};
 for(const refs of [[{...r,title:'\ud800'}],[{...r,title:'x'.repeat(501)}],[{...r,slides:[3]}],Array(513).fill(r)])assert.throws(()=>compileSourceAppendix(refs,d,options));
 assert.throws(()=>compileSourceAppendix([r],d,{...options,existingScenes:120}),{code:'appendix-capacity'});
 const giant=structuredClone(d);giant.grid.margins.top=7;assert.throws(()=>compileSourceAppendix([r],giant,options),{code:'appendix-fit'});
});
test('Appendix domain: exact metadata preview, one human batch preserves original scenes and deduplicates by retained identity',async()=>{
 const a=source(),b=source('project',1,{url:a.url,title:a.title,excerpt:'A distinct retained snippet.'}),f=await appendixPure({sources:[a,b],citations:[record(1,{source:{projectId:'project',id:a.id,generation:0}}),record(2,{target:target('chart'),source:{projectId:'project',id:a.id,generation:0}}),record(3,{target:target('table'),source:{projectId:'project',id:b.id,generation:0}})]}),api=createProjectSourceAppendix(f.backend),before=structuredClone(f.doc);
 assert.notEqual(a.id,b.id);const preview=await api.preview(binding);assert.equal(preview.ok,true,JSON.stringify(preview));assert.equal(preview.citationCount,3);assert.equal(preview.referenceCount,2);assert.deepEqual(f.doc,before);assert.equal(JSON.stringify(preview).includes(a.url),false);
 const out=await api.apply(binding,applyRequest(preview));assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.snapshot.projectRevision,2);assert.equal(f.saved.length,1);assert.deepEqual(f.doc.scenes.slice(0,2),before.scenes);assert.ok(f.doc.scenes.slice(2).every(p=>p.layoutState==='detached'));
 const repeat=await api.apply(binding,applyRequest(preview));assert.equal(repeat.code,'stale-project');assert.equal(f.saved.length,1);
});
test('Appendix domain: consent/counters/design, source/target/content and theme failures do not write or echo source text',async()=>{
 const f=await appendixPure(),api=createProjectSourceAppendix(f.backend),p=await api.preview(binding);
 for(const [q,code] of [[applyRequest(p,{disclosure:'source-title-url-v1'}),'consent-required'],[applyRequest(p,{sourceRevision:2}),'stale-catalog'],[applyRequest(p,{designFingerprint:'f'.repeat(64)}),'stale-design'],[applyRequest(p,{admin:true}),'invalid-request']])assert.equal((await api.apply(binding,q)).code,code);
 delete f.doc.theme;assert.equal((await api.preview(binding)).code,'theme-required');assert.equal((await api.preview(binding,{theme:'../private'})).code,'invalid-request');assert.equal((await api.preview(binding,{theme:'missing-theme'})).code,'theme-unavailable');
 f.doc.theme={name:'warm-humanist'};f.doc.scenes[0].elements[0].hidden=true;assert.equal((await api.preview(binding)).code,'target-hidden');delete f.doc.scenes[0].elements[0].hidden;f.doc.scenes[0].elements[0].paragraphs[0].runs[0].text='changed';assert.equal((await api.preview(binding)).code,'content-changed');assert.equal(f.saved.length,0);
});
test('Appendix domain: both public entries freeze complete identity/theme/request before an await',async()=>{
 const f=await appendixPure(),api=createProjectSourceAppendix(f.backend),p=await api.preview(binding);
 for(const apply of [false,true]){let release,entered;const wait=new Promise(r=>release=r),ready=new Promise(r=>entered=r),base=f.backend.withCitationReadTransaction;
  const backend={...f.backend,[apply?'withCitationTransaction':'withCitationReadTransaction']:async(b,job)=>{entered();await wait;return base(b,tx=>job({...tx,saveScenes:async()=>2}));}},bound={...binding},q=apply?applyRequest(p):{theme:'warm-humanist'};
  const pending=createProjectSourceAppendix(backend)[apply?'apply':'preview'](bound,q);await ready;bound.owner='foreign';q.theme='missing-theme';if(apply)q.projectRevision=100;release();assert.equal((await pending).ok,true);
 }
 const accessor=Object.defineProperty({},'theme',{enumerable:true,get(){throw Error('must not run');}});assert.equal((await api.preview(binding,accessor)).code,'invalid-request');
});
test('Appendix domain: empty authored citation and oversized traversal refuse; uncited projects are a true no-op',async()=>{
 const f=await appendixPure();f.doc.scenes[0].elements[0].paragraphs=[];const {anchor}=await import('./v2-citation-export-fixture.js');f.doc.scenes[0].citations=await anchor(f.doc.scenes,f.doc.scenes[0].citations);assert.equal((await createProjectSourceAppendix(f.backend).preview(binding)).code,'target-unavailable');
 const huge=await appendixPure();huge.doc.scenes[1].elements.push(...Array.from({length:10001},(_,i)=>({id:'large-'+i,kind:'shape',x:0,y:0,w:1,h:1,z:0,provenance:'human'})));assert.equal((await createProjectSourceAppendix(huge.backend).preview(binding)).code,'target-budget-exceeded');
 delete f.doc.scenes[0].citations;delete f.doc.theme;const empty=await createProjectSourceAppendix(f.backend).preview(binding);assert.equal(empty.changed,false);assert.equal(empty.pageCount,0);assert.equal(f.saved.length,0);
});
test('Appendix engine/provider seam: batch undo/redo and detached content survive; scoped ordinary AI reads disclose only copied text',async()=>{
 const f=await appendixPure({sources:[source('project',0,{url:'https://example.org/?private=copy',excerpt:'SECRET_EXCERPT'})]}),api=createProjectSourceAppendix(f.backend),p=await api.preview(binding);await api.apply(binding,applyRequest(p));
 const added=f.doc.scenes.slice(2),engine=await createDocument(f.doc.scenes.slice(0,2)),original=engine.snapshot().scenes;
 const result=await engine.applyBatch({id:'append',actor:'human',baseRevision:0,ops:added.map(scene=>({slideId:null,op:{type:'slide.insert',scene}}))});assert.equal(result.ok,true);assert.equal((await engine.undo()).ok,true);assert.deepEqual(engine.snapshot().scenes,original);assert.equal((await engine.redo()).ok,true);
 const scene=added[0],tools=createToolSession({document:engine,projectId:'project',ownerId:'owner',actorId:'owner',agentId:'fixture',mode:'inspect',readableSlides:[scene.id],editableTargets:[],selection:[]});
 const read=await tools.execute({tool:'get_slide',args:{slideId:scene.id}});assert.equal(read.ok,true,JSON.stringify(read));const encoded=JSON.stringify(read);assert.ok(encoded.includes('private=copy'));assert.equal(encoded.includes('SECRET_EXCERPT'),false);
});
