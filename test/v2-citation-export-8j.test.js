import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectCitationExporter } from '../src/projects/citation-export.js';
import { seed } from './v2-tool-fixture.js';
import { source } from './v2-source-registry-fixture.js';
import { record,target } from './v2-citations-fixture.js';
import { pureFixture,binding,request,anchor } from './v2-citation-export-fixture.js';

test('notes domain: strict capture refuses extra authority and executable data before storage',async()=>{
  let calls=0,getters=0;const e=createProjectCitationExporter({withCitationReadTransaction(){calls++;throw Error('private');}});
  for(const q of [undefined,{},request({projectRevision:-1}),request({sourceRevision:2**53}),request({disclosure:false}),{...request(),notes:[]},
    {...request(),get sourceGeneration(){getters++;return 0;}}])assert.equal((await e.render(binding,q)).code,'invalid-request');
  assert.equal((await e.render({...binding,admin:true},request())).code,'invalid-request');
  assert.equal((await e.inspect({...binding,owner:''})).code,'invalid-request');assert.equal(calls,0);assert.equal(getters,0);
});
test('notes domain: capture binding and all counters before await; metadata has no source content',async()=>{
  const f=await pureFixture();let release,entered;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r);
  const backend={async withCitationReadTransaction(b,job){entered();await gate;return f.backend.withCitationReadTransaction(b,job);}},e=createProjectCitationExporter(backend),b={...binding},q=request();
  const pending=e.render(b,q);await ready;b.id='foreign';b.owner=null;q.projectRevision=99;q.sourceGeneration=99;q.disclosure='other';backend.withCitationReadTransaction=()=>{throw Error('replacement');};release();
  const out=await pending;assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.snapshot.projectId,'project');assert.equal(out.citationCount,1);
  const metadata=await createProjectCitationExporter(f.backend).inspect(binding);assert.deepEqual(Object.keys(metadata),['ok','snapshot','citationCount']);
  for(const value of [f.sources[0].title,f.sources[0].url,f.sources[0].excerpt])assert.equal(JSON.stringify(metadata).includes(value),false);
});
test('notes domain: complete target content range and snapshot failures refuse the entire export',async()=>{
  const f=await pureFixture({sources:[source('project',0,{excerpt:'界😀 retained evidence.'})]}),e=createProjectCitationExporter(f.backend),c=f.doc.scenes[0].citations[0];
  assert.equal((await e.render(binding,request({projectRevision:0}))).code,'stale-project');
  assert.equal((await e.render(binding,request({sourceRevision:0}))).code,'stale-catalog');
  const original=structuredClone(c);
  for(const [change,code] of [[{target:target('orphan')},'target-unavailable'],[{target:target('other','s2')},'target-unavailable'],
    [{anchor:{kind:'content-sha256-v1',digest:'0'.repeat(64)}},'content-changed'],[{source:{...c.source,id:'src_'+'a'.repeat(64)}},'source-unavailable'],
    [{source:{...c.source,generation:1}},'stale-catalog'],[{locator:{kind:'snippet-utf8-v1',startByte:1,endByte:3}},'locator-invalid']]) {
    f.doc.scenes[0].citations[0]={...original,...change};const out=await e.render(binding,request());assert.equal(out.code,code);assert.equal(Object.hasOwn(out,'bytes'),false);
  }
  f.doc.scenes[0].citations[0]={...original,locator:{kind:'snippet-utf8-v1',startByte:0,endByte:8}};
  assert.equal((await e.render(binding,request())).ok,true);
  f.doc.scenes[0].elements.push(structuredClone(f.doc.scenes[0].elements[0]));assert.equal((await e.render(binding,request())).code,'target-unavailable');
});
test('notes domain: visibility follows anchored scope, ordinary locks export, chrome does not disclose',async()=>{
  const scenes=seed(),el=scenes[0].elements[0];el.locked=true;
  scenes[0].elements.push({...structuredClone(el),id:'group',kind:'group',x:0,y:0,group:{children:[{...structuredClone(el),id:'child',x:1,y:0,locked:false},
    {id:'chrome',kind:'shape',x:0,y:0,w:1,h:1,z:0,provenance:'compiler',locked:true,hidden:true}]}});
  const f=await pureFixture({scenes}),e=createProjectCitationExporter(f.backend);
  assert.equal((await e.render(binding,request())).ok,true);
  const cite=async t=>{f.doc.scenes[0].citations=await anchor(f.doc.scenes,[record(1,{target:t,source:{projectId:'project',id:f.sources[0].id,generation:0}})]);return e.render(binding,request());};
  assert.equal((await cite(target('group'))).ok,true);
  assert.equal((await cite(target('chrome'))).code,'target-chrome');
  f.doc.scenes[0].elements.at(-1).hidden=true;assert.equal((await cite(target('child'))).code,'target-hidden');
  f.doc.scenes[0].elements.at(-1).hidden=false;f.doc.scenes[0].elements.at(-1).group.children[0].hidden=true;
  assert.equal((await cite(target('group'))).code,'target-hidden');assert.equal((await cite({kind:'slide',slideId:'s1'})).code,'target-hidden');
});
test('notes domain: uncited mode cannot silently discard citations and backend failures are sanitized',async()=>{
  const f=await pureFixture(),e=createProjectCitationExporter(f.backend),{disclosure,...q}=request();
  assert.equal((await e.renderUncited(binding,q)).code,'consent-required');f.doc.scenes[0].citations=[];
  assert.equal((await e.renderUncited(binding,q)).ok,true);
  for(const [error,code] of [[Error('private secret URL'),'storage-unavailable'],[{code:'not-found'},'not-found'],[{code:'invalid-document'},'invalid-state']]) {
    const out=await createProjectCitationExporter({async withCitationReadTransaction(){throw error;}}).render(binding,request());
    assert.deepEqual(Object.keys(out),['ok','code','message']);assert.equal(out.code,code);assert.equal(JSON.stringify(out).includes('private secret'),false);
  }
});
test('notes domain: complete traversal and selected canonical source validation remain fail-closed',async()=>{
  const f=await pureFixture(),e=createProjectCitationExporter(f.backend),el=structuredClone(f.doc.scenes[0].elements[0]);
  f.doc.scenes[0].elements=Array.from({length:10001},(_,i)=>({...el,id:i===0?'text':'node-'+i}));
  assert.equal((await e.render(binding,request())).code,'target-budget-exceeded');
  const corrupt=await pureFixture();corrupt.sources[0].excerpt='body changed without reminting its identity';
  assert.equal((await createProjectCitationExporter(corrupt.backend).render(binding,request())).code,'invalid-state');
});
test('notes domain: qualified disclosure retains all non-citation native safety checks and scalar validation',async()=>{
  const f=await pureFixture(),e=createProjectCitationExporter(f.backend);
  const chart=f.doc.scenes[0].elements[1];chart.chart.chartKind='pie';chart.chart.series.push({name:'Other',values:[3,4]});
  assert.equal((await e.render(binding,request())).code,'export-unsafe');
  const malformed=await pureFixture({sources:[source('project',0,{title:'lone\ud800 source title'})]});
  assert.equal((await createProjectCitationExporter(malformed.backend).render(binding,request())).code,'notes-unsafe');
});
