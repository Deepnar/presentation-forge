import test from 'node:test';
import assert from 'node:assert/strict';
import { createCitationReferenceChecker } from '../src/projects/citation-references.js';
import { scalarText,validSnippetLocator,snippetLocatorStatus } from '../src/projects/snippet-locator.js';
import { seed } from './v2-tool-fixture.js';

const binding={id:'project',owner:'owner'},sourceId='src_'+'a'.repeat(64);
const locator=(startByte,endByte,quote)=>({kind:'snippet-utf8-v1',startByte,endByte,quote});
const ref=(target={kind:'element',slideId:'s1',elementId:'text'})=>({target,sourceId});
const request=(references=[ref()])=>({projectRevision:0,sourceGeneration:0,sourceRevision:0,references});
const rig=(scenes=seed())=>createCitationReferenceChecker({withCitationReadTransaction:async(b,job)=>job({dialect:'sqlite',doc:{id:b.id,revision:0,scenes},query:async()=>[]})});

test('Citation pure: exact scalar UTF-8, BOM and supplementary boundaries',()=>{
  const text='\uFEFF界😀 e\u0301\r\n�';
  for(const [start,end,quote] of [[0,3,'\uFEFF'],[3,6,'界'],[6,10,'😀'],[11,14,'e\u0301'],[14,16,'\r\n'],[16,19,'�']]) {
    assert.ok(validSnippetLocator(locator(start,end,quote)));
    assert.equal(snippetLocatorStatus(locator(start,end,quote),text),'matched');
  }
  assert.equal(snippetLocatorStatus(locator(4,6,'界'),text),'invalid');
  assert.equal(snippetLocatorStatus(locator(3,5,'界'),text),'invalid');
  assert.equal(snippetLocatorStatus(locator(0,30,'x'),text),'invalid');
  assert.equal(snippetLocatorStatus(locator(11,14,'é'),text),'mismatch');
});
test('Citation pure: locator precedence never repairs surrogates or assesses support',()=>{
  assert.equal(snippetLocatorStatus(undefined,undefined),'not-requested');
  assert.equal(snippetLocatorStatus(locator(0,1,'x'),undefined),'unavailable');
  assert.equal(snippetLocatorStatus(locator(0,100,'x'),'bad\ud800'),'unsupported-excerpt');
  assert.equal(snippetLocatorStatus(locator(0,3,'�'),'�'),'matched');
  for(const text of ['\ud800','\udc00','x\ud800z']) { assert.equal(scalarText(text),false);assert.equal(validSnippetLocator(locator(0,1,text)),false); }
  for(const value of [null,{},locator(-1,1,'x'),locator(1,1,'x'),locator(0,8193,'x'),locator(0,1,''),locator(0,1,'界'.repeat(3000))]) assert.equal(!!validSnippetLocator(value),false);
});
test('Citation pure: invalid complete DTOs refuse before storage or accessor execution',async()=>{
  let calls=0,getters=0;const checker=createCitationReferenceChecker({withCitationReadTransaction(){calls++;throw new Error('private');}}),q=request();
  const duplicated={target:{elementId:'text',slideId:'s1',kind:'element'},sourceId};
  for(const input of [undefined,{...q,projectRevision:-1},{...q,sourceGeneration:2**53},{...q,references:[]},
    {...q,references:Array(25).fill(ref())},{...q,references:[ref(),duplicated]},
    request([{...ref(),locator:null}]),request([{...ref(),locator:locator(0,1,'\ud800')}]),
    request([{...ref(),target:{kind:'slide',slideId:'s1',elementId:'text'}}]),
    request([{...ref(),sourceId:'src_foreign'}]),{...q,quote:'x'.repeat(400000)},
    {...q,get references(){getters++;return [ref()];}}]) assert.equal((await checker.check(binding,input)).code,'invalid-request');
  assert.equal((await checker.check({...binding,admin:true},q)).code,'invalid-request');
  assert.equal((await checker.check({...binding,owner:''},q)).code,'invalid-request');
  assert.equal(calls,0);assert.equal(getters,0);
});
test('Citation pure: exact targets include group children and observe ambiguity without inference',async()=>{
  const scenes=seed(),el=structuredClone(scenes[0].elements[0]);
  scenes[0].elements.push({...el,id:'group',kind:'group',group:{children:[{...el,id:'dup',hidden:true,locked:true},{...el,id:'dup'}]}});
  scenes[0].suppressed=[{id:'deleted',semanticRef:'text-block'}];
  const targets=[{kind:'slide',slideId:'s1'},...['text','group','dup','deleted','text-block','other'].map(elementId=>({kind:'element',slideId:'s1',elementId})),{kind:'element',slideId:'absent',elementId:'text'}];
  const out=await rig(scenes).check(binding,request(targets.map(ref)));
  assert.equal(out.ok,true);assert.deepEqual(out.references.map(r=>r.target),['present','present','present','ambiguous','missing','missing','missing','missing']);
  assert.ok(out.references.every(r=>r.source==='missing' && r.locator==='not-requested' && r.claimSupport==='not-assessed'));
  assert.ok(Object.isFrozen(out.references[0]));assert.equal(JSON.stringify(out).includes('Unrelated private'),false);
});
test('Citation pure: node/depth budgets refuse the whole result rather than stop at first match',async()=>{
  for(const mode of ['nodes','depth']) {
    const scenes=seed(),el=scenes[0].elements[0];
    if(mode==='nodes') scenes[0].elements=Array.from({length:10001},(_,i)=>({...el,id:i===0?'text':'x'+i}));
    else {let child={...el};for(let i=0;i<129;i++)child={...el,id:'g'+i,kind:'group',group:{children:[child]}};scenes[0].elements=[child];}
    const out=await rig(scenes).check(binding,request());assert.equal(out.code,'target-budget-exceeded');assert.equal(Object.hasOwn(out,'references'),false);
  }
});
test('Citation pure: complete requests and adapter method are captured before await',async()=>{
  let entered,release;const started=new Promise(r=>{entered=r;}),gate=new Promise(r=>{release=r;});
  const backend={async withCitationReadTransaction(b,job){entered();await gate;assert.ok(Object.isFrozen(b));return job({dialect:'sqlite',doc:{id:b.id,revision:0,scenes:seed()},query:async()=>[]});}};
  const checker=createCitationReferenceChecker(backend),b={...binding},q=request(),pending=checker.check(b,q);await started;
  b.id='other';b.owner='foreign';q.projectRevision=99;q.references[0].target.elementId='missing';q.references.push(ref());
  backend.withCitationReadTransaction=()=>{throw new Error('replacement');};release();
  const out=await pending;assert.equal(out.ok,true);assert.equal(out.snapshot.projectId,'project');assert.equal(out.references.length,1);assert.equal(out.references[0].target,'present');
});
test('Citation pure: backend/domain refusals are static and publish no partial observations',async()=>{
  for(const [error,code] of [[new Error('private URL/token/quote'),'storage-unavailable'],[{code:'not-found'},'not-found'],[{code:'invalid-document'},'invalid-state']]) {
    const checker=createCitationReferenceChecker({async withCitationReadTransaction(){throw error;}}),out=await checker.check(binding,request());
    assert.equal(out.code,code);assert.deepEqual(Object.keys(out),['ok','code','message']);assert.equal(JSON.stringify(out).includes('private'),false);assert.ok(Object.isFrozen(out));
  }
});
