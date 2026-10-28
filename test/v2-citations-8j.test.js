import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { seed, rig } from './v2-tool-fixture.js';
import { createDocument } from '../packages/model/engine.ts';
import { validateScene } from '../packages/model/scene.ts';
import { citationMetadataError } from '../packages/model/citations.ts';
import { indexCitationTargets } from '../packages/model/citation-targets.ts';
import { citationContentDigests } from '../packages/model/citation-content.ts';
import { buildProjectDocument, validateProjectDocument } from '../packages/projects/document.js';
import { compileSlide, recompileSlide } from '../packages/compiler/compile.js';
import { sampleDeckIntent, warmDesign } from './v2-fixture.js';
import { preflightScenes, renderPptx } from '../packages/renderer-pptx/render.ts';
import { createProjectCitations } from '../src/projects/citations.js';
import { snippetRangeStatus } from '../src/projects/snippet-locator.js';

import { cid, target, record } from './v2-citations-fixture.js';
const withCitation = () => {const scenes=seed();scenes[0].citations=[record()];return scenes;};
const digest = async scenes => (await citationContentDigests(indexCitationTargets(scenes,[target()],true)))[0];
const apply = (doc,op,extra={}) => doc.apply({id:'op-'+doc.status().revision,actor:'human',slideId:'s1',baseRevision:doc.status().revision,op,...extra});

test('Citation lifecycle: fixed-format labels refuse literal trailing line feeds',async()=>{
  for (const mutate of [c=>c.id+='\n',c=>c.source.id+='\n',c=>c.anchor.digest+='\n',c=>c.source.projectId+='\n']) {
    const scene=withCitation()[0];mutate(scene.citations[0]);assert.equal((await validateScene(scene)).ok,false);
  }
  let called=false;
  const backend={withCitationTransaction(){called=true;},withCitationReadTransaction(){called=true;}};
  const service=createProjectCitations(backend),binding={id:'project',owner:'owner'};
  const request={projectRevision:0,sourceGeneration:0,sourceRevision:0,citationIds:[cid(1)+'\n']};
  assert.equal((await service.inspect(binding,request)).code,'invalid-request');assert.equal(called,false);
});

test('Citation lifecycle: strict scene shape and project-wide admission preserve unverified records',async()=>{
  const scenes=withCitation();assert.equal((await validateScene(scenes[0])).ok,true);
  for(const mutation of [c=>c.quote='private',c=>c.locator={kind:'snippet-utf8-v1',startByte:2,endByte:1},c=>c.source.generation=2**53,c=>c.id='cit_bad',c=>c.anchor.digest='bad']) {
    const s=structuredClone(scenes[0]);mutation(s.citations[0]);assert.equal((await validateScene(s)).ok,false);
  }
  const duplicate=structuredClone(scenes);duplicate[1].citations=[record()];assert.match(citationMetadataError(duplicate),/identifier/);
  const tuple=structuredClone(scenes);tuple[0].citations.push(record(2));assert.match(citationMetadataError(tuple),/association/);
  const many=structuredClone(scenes);many[0].citations=Array.from({length:129},(_,i)=>record(i,{target:target('missing'+i)}));assert.equal((await validateScene(many[0])).ok,false);
  const five=Array.from({length:5},(_,s)=>({...structuredClone(scenes[0]),id:'s'+s,citations:Array.from({length:s===4?1:128},(_,i)=>record(s*128+i,{target:target('absent'+i,'s'+s)}))}));assert.match(citationMetadataError(five),/Too many project/);
  const doc=buildProjectDocument({title:'Metadata',scenes});assert.equal((await validateProjectDocument(doc)).ok,false);
  doc.scenes[0].citations[0].source.projectId=doc.id;assert.equal((await validateProjectDocument(doc)).ok,true);
});

test('Citation lifecycle: anchors ignore styling and run boundaries but preserve exact authored content',async()=>{
  const scenes=seed(), original=await digest(scenes),changed=structuredClone(scenes),text=changed[0].elements[0];
  text.x=3;text.paragraphs[0].runs=[{text:'Measured results',bold:false,color:'ABCDEF'}];text.hidden=true;text.locked=true;
  assert.equal(await digest(changed),original);text.paragraphs[0].runs[0].text+='!';assert.notEqual(await digest(changed),original);
  text.paragraphs=[{runs:[{text:'\ud800\uFEFFe\u0301\r\n'}]}];
  const expected=createHash('sha256').update(JSON.stringify(['forge-citation-content-v1',['text',[[false,'\ud800\uFEFFe\u0301\r\n']]]])).digest('hex');
  assert.equal(await digest(changed),expected);text.paragraphs[0].runs[0].text='�\uFEFFé\n';assert.notEqual(await digest(changed),expected);
  for(const kind of ['chart','table','image','group']) {const s=seed();s[0].elements[0]={id:'text',kind,x:0,y:0,w:1,h:1,z:0,provenance:'human'};assert.equal(await digest(s),createHash('sha256').update(JSON.stringify(['forge-citation-content-v1',[kind,null]])).digest('hex'));}
});

test('Citation lifecycle: chart table image and slide content changes have distinct bounded anchors',async()=>{
  const s=seed();s[0].elements.push({id:'image',kind:'image',x:0,y:0,w:1,h:1,z:3,provenance:'human',image:{src:'data:image/png;base64,YQ==',alt:'Chart'}});
  const ts=[target('chart'),target('table'),target('image'),{kind:'slide',slideId:'s1'}],hash=async()=>citationContentDigests(indexCitationTargets(s,ts,true));
  const old=await hash();s[0].elements[1].chart.series[0].values[0]=99;s[0].elements[2].table.rows[1][0]='B';s[0].elements[3].image.alt='New chart';const next=await hash();assert.ok(next.every((v,i)=>v!==old[i]));
  s[0].elements[0].paragraphs[0].runs[0].text='x'.repeat(393216);await assert.rejects(()=>hash(),{code:'target-budget-exceeded'});
});

test('Citation lifecycle: exact targets and protected ancestor/group scopes never use first matches',()=>{
  const s=seed(),child={...structuredClone(s[0].elements[0]),id:'child',hidden:true};
  s[0].elements.push({id:'g',kind:'group',x:0,y:0,w:1,h:1,z:3,provenance:'human',group:{children:[child]}});
  assert.deepEqual(indexCitationTargets(s,[target('child'),target('g'),target('missing')],true).map(o=>[o.status,o.blocked]),[['present',true],['present',true],['missing',false]]);
  s[0].elements.push({...child,id:'text'});assert.equal(indexCitationTargets(s,[target()],true)[0].status,'ambiguous');
  const large=seed(),el=large[0].elements[0];large[0].elements=Array.from({length:10001},(_,i)=>({...el,id:'e'+i}));
  assert.throws(()=>indexCitationTargets(large,[{kind:'slide',slideId:'s1'}],true),{code:'target-budget-exceeded'});
  let nested=structuredClone(el);for(let i=0;i<129;i++)nested={...el,id:'g'+i,kind:'group',group:{children:[nested]}};large[0].elements=[nested];assert.throws(()=>indexCitationTargets(large,[target()],true),{code:'target-budget-exceeded'});
});

test('Citation lifecycle: commands are atomic, no-op aware and exactly undoable',async()=>{
  const d=await createDocument(seed()),c=record();assert.equal((await apply(d,{type:'citation.put',mode:'add',citation:c})).ok,true);
  const saved=d.snapshot();assert.equal((await apply(d,{type:'citation.put',mode:'replace',citation:c})).noop,true);assert.deepEqual(d.snapshot(),saved);
  const fail=await d.applyBatch({id:'atomic',actor:'human',baseRevision:1,ops:[{slideId:'s1',op:{type:'citation.remove',id:c.id}},{slideId:'s1',op:{type:'citation.remove',id:cid(99)}}]});assert.equal(fail.ok,false);assert.deepEqual(d.snapshot(),saved);
  assert.equal((await apply(d,{type:'citation.remove',id:c.id})).ok,true);assert.equal(d.snapshot().scenes[0].citations,undefined);
  await d.undo();assert.deepEqual(d.snapshot().scenes,saved.scenes);await d.redo();assert.equal(d.snapshot().scenes[0].citations,undefined);
});

test('Citation lifecycle: raw agent citation ingress refuses while ordinary edits preserve metadata',async()=>{
  const d=await createDocument(withCitation()),before=d.snapshot();
  assert.equal((await apply(d,{type:'citation.remove',id:cid(1)},{actor:'agent'})).ok,false);
  assert.equal((await apply(d,{type:'citation.put',mode:'replace',citation:record()},{actor:'agent'})).ok,false);
  const insert=structuredClone(before.scenes[0]);insert.id='new';assert.equal((await apply(d,{type:'slide.insert',scene:insert},{slideId:null,actor:'agent'})).ok,false);
  assert.deepEqual(d.snapshot(),before);assert.equal((await apply(d,{type:'element.move',id:'text',x:2,y:1},{actor:'agent'})).ok,true);assert.deepEqual(d.snapshot().scenes[0].citations,before.scenes[0].citations);
  const locked=seed();locked[0].elements[0].locked=true;const l=await createDocument(locked);assert.equal((await apply(l,{type:'citation.put',mode:'add',citation:record()})).code,'locked');
});

test('Citation lifecycle: duplication remaps only unique live identities and retains unresolved tuples',async()=>{
  const scenes=withCitation(),el=scenes[0].elements[0];scenes[0].elements.push({...structuredClone(el),id:'dup'},{...structuredClone(el),id:'dup'});
  scenes[0].citations.push(record(2,{target:target('missing')}),record(3,{target:target('dup')}),record(4,{target:{kind:'slide',slideId:'s1'}}));
  const d=await createDocument(scenes),duplicate=()=>apply(d,{type:'slide.duplicate',id:'s1'},{slideId:null,actor:'agent'});
  assert.equal((await duplicate()).ok,true);const out=d.snapshot().scenes,copy=out[1];assert.notEqual(copy.id,'s1');
  assert.equal(new Set(out.flatMap(s=>(s.citations??[]).map(c=>c.id))).size,8);
  assert.equal(copy.citations[0].target.slideId,copy.id);assert.notEqual(copy.citations[0].target.elementId,'text');
  assert.deepEqual(copy.citations.slice(1,3).map(c=>c.target),scenes[0].citations.slice(1,3).map(c=>c.target));assert.equal(copy.citations[3].target.slideId,copy.id);
  assert.equal((await duplicate()).ok,true);assert.equal(citationMetadataError(d.snapshot().scenes),null);
  await d.undo();await d.undo();assert.deepEqual(d.snapshot().scenes,scenes);
});

test('Citation lifecycle: deletion leaves orphans and session undo retains exact metadata for 200 changes',async()=>{
  const scenes=withCitation(),d=await createDocument(scenes);
  for(let i=0;i<200;i++)assert.equal((await apply(d,{type:'element.move',id:'text',x:2+i/1000,y:1})).ok,true);
  assert.equal(d.status().historyLength,200);for(let i=0;i<200;i++)assert.equal((await d.undo()).ok,true);assert.deepEqual(d.snapshot().scenes,scenes);
  await apply(d,{type:'element.delete',id:'text'});assert.deepEqual(d.snapshot().scenes[0].citations,scenes[0].citations);assert.equal(indexCitationTargets(d.snapshot().scenes,[target()],true)[0].status,'missing');await d.undo();assert.deepEqual(d.snapshot().scenes,scenes);
});

test('Citation lifecycle: recompilation preserves exact orphan records and detached identity',async()=>{
  const design=await warmDesign(),intent=sampleDeckIntent().slides[1],previous=compileSlide(intent,design);previous.citations=[record(1,{target:target('orphan',previous.id)})];
  const out=recompileSlide({...intent,title:'Changed'},previous,design);assert.deepEqual(out.citations,previous.citations);assert.notEqual(out.citations,previous.citations);
  previous.layoutState='detached';assert.equal(recompileSlide(intent,previous,design),previous);assert.equal(compileSlide(intent,design).citations,undefined);
});

test('Citation lifecycle: central native preflight refuses all cited targets before producing bytes',async()=>{
  const s=seed();assert.deepEqual(await preflightScenes(s),[]);
  for(const targetValue of [target(),target('missing'),{kind:'slide',slideId:'s1'}]) {const cited=seed();cited[0].elements[0].hidden=true;cited[0].citations=[record(1,{target:targetValue})];assert.match((await preflightScenes(cited))[0].reason,/Citation-bearing/);await assert.rejects(()=>renderPptx(cited),/Citation-bearing/);}
});

test('Citation lifecycle: tool projections and scalar range observations disclose no citation payload',async()=>{
  const {tools}=await rig({},withCitation());const result=await tools.execute({tool:'get_slide',args:{slideId:'s1'}});assert.equal(result.ok,true);assert.equal(JSON.stringify(result).includes('cit_'),false);assert.equal(tools.catalog().some(t=>t.name.includes('citation')),false);
  assert.equal(snippetRangeStatus({startByte:3,endByte:6},'\uFEFF界'),'range-valid');assert.equal(snippetRangeStatus({startByte:4,endByte:6},'\uFEFF界'),'invalid');assert.equal(snippetRangeStatus({startByte:0,endByte:1},'\ud800'),'unsupported-excerpt');
});

test('Citation lifecycle: strict domain capture refuses accessors and captures binding before awaits',async()=>{
  let calls=0,getters=0,release,entered;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
  const backend={async withCitationReadTransaction(binding,job){calls++;entered();await gate;assert.equal(binding.owner,'owner');return job({doc:{id:binding.id,revision:0,scenes:withCitation()}});},withCitationTransaction(){calls++;throw new Error('private');}};
  const service=createProjectCitations(backend),b={id:'project',owner:'owner'},request={projectRevision:0,sourceGeneration:0,sourceRevision:0,citationIds:[cid(1)]};
  assert.equal((await service.inspect({...b,admin:true},request)).code,'invalid-request');assert.equal((await service.inspect(b,{...request,get citationIds(){getters++;return [cid(1)];}})).code,'invalid-request');assert.equal(getters,0);assert.equal(calls,0);
  const pending=service.inspect(b,request);await started;b.owner='foreign';request.citationIds[0]=cid(2);release();const out=await pending;assert.equal(out.code,'storage-unavailable');assert.equal(JSON.stringify(out).includes('private'),false);assert.ok(Object.isFrozen(out));
});
