import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectCopier } from '../src/projects/copy.js';
import { seed } from './v2-tool-fixture.js';
import { record } from './v2-citations-fixture.js';

function rig() {
  const state = { calls: 0 };
  const backend = { async withCopyTransaction(binding,job) {
    state.calls++; state.binding = binding;
    const out = await job({ dialect: 'sqlite', doc: { id: 'project', revision: 7 }, query: async () => [],
      insertCopy: async doc => { state.inserted = structuredClone(doc); } });
    if (state.unknown) throw Object.assign(new Error('private connection string'),{ code: 'copy-outcome-unknown' });
    return out;
  } };
  return { state, copy: createProjectCopier(backend).copy };
}
test('copy captures the complete binding and live snapshot before its first await',async () => {
  const {state,copy} = rig(), binding = {id:'project',owner:'owner'}, request = {title:'Pinned',scenes:seed()};
  const expected = structuredClone(request.scenes), pending = copy(binding,request);
  binding.owner='foreign';binding.id='other';request.title='Mutated';request.scenes[0].elements=[];
  const out = await pending;
  assert.equal(out.ok,true);assert.deepEqual({...state.binding},{id:'project',owner:'owner'});
  assert.equal(out.project.title,'Pinned');assert.deepEqual(out.project.scenes,expected);assert.equal(out.sourceSnapshot.projectRevision,7);
  assert.equal(Object.isFrozen(out.project.scenes),true);
});
test('copy refuses executable, sparse, cyclic, unknown and privilege-bearing inputs before storage',async () => {
  const {state,copy} = rig(), binding = {id:'project',owner:'owner'};
  let invoked=false;const accessor={scenes:seed()};Object.defineProperty(accessor,'title',{enumerable:true,get(){invoked=true;return 'bad';}});
  const cyclic={title:'cycle',scenes:seed()};cyclic.self=cyclic;
  for (const input of [accessor,cyclic,{title:'bad',scenes:new Array(1)},{title:'bad',scenes:seed(),owner:'foreign'},{title:'bad',scenes:seed(),origin:{kind:'mixed'}}])
    assert.equal((await copy(binding,input)).code,'invalid-request');
  assert.equal((await copy({...binding,admin:true},{title:'bad',scenes:seed()})).code,'invalid-request');
  assert.equal(invoked,false);assert.equal(state.calls,0);
});
test('copy checks project-bound citation shape and limits before storage',async () => {
  const {state,copy}=rig(),scenes=seed();scenes[0].citations=[record(1,{source:{projectId:'foreign',id:'src_'+'a'.repeat(64),generation:0}})];
  assert.equal((await copy({id:'project',owner:null},{title:'Foreign',scenes})).code,'invalid-request');
  scenes[0].citations=Array.from({length:129},(_,i)=>record(i+1));
  assert.equal((await copy({id:'project',owner:null},{title:'Over limit',scenes})).code,'invalid-request');
  assert.equal(state.calls,0);
});
test('project-sized capture supports scenes larger than tool DTO traversal budgets',async () => {
  const {copy}=rig(),scenes=Array.from({length:100},(_,i)=>({...seed()[0],id:'slide'+i}));
  const out=await copy({id:'project',owner:null},{title:'Large live deck',scenes});
  assert.equal(out.ok,true);assert.deepEqual(out.project.scenes,scenes);
});
test('copy reports unknown complete commit without driver details or automatic retry',async () => {
  const {state,copy}=rig();state.unknown=true;
  const out=await copy({id:'project',owner:null},{title:'Uncertain',scenes:seed()});
  assert.equal(out.code,'copy-outcome-unknown');assert.equal(state.calls,1);assert.ok(state.inserted);
  assert.equal(JSON.stringify(out).includes('private connection'),false);
});
test('UTF-8 byte capacity is enforced even below the JSON character ceiling',async () => {
  const {state,copy}=rig();
  assert.equal((await copy({id:'project',owner:null},{title:'界'.repeat(3*1024*1024),scenes:seed()})).code,'capacity-exceeded');
  assert.equal(state.calls,0);
});
