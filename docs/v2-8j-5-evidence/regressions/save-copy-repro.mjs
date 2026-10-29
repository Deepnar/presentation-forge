import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const baseline='665cd0459b0f267b32e808a59046e3d0b914e74f';
const source=execFileSync('git',['show',`${baseline}:app/web/src/components/SceneViewer.jsx`],{encoding:'utf8'});
const handler=source.slice(source.indexOf('  async function saveAsNewProject() {'),source.indexOf('  async function refreshProjectList() {'));
assert.ok(handler.includes('await apiCreate'));
test('a late copy response must preserve later edits and the original project binding',async t=>{
  t.diagnostic(JSON.stringify({baseline,handlerSha256:createHash('sha256').update(handler).digest('hex'),method:'execute original handler with isolated closure dependencies; no DOM/browser claim'}));
  let revision=1,release;const response=new Promise(r=>release=r);
  const projectRef={current:{id:'original',title:'Deck',revision:0}},states=[];
  const context={docRef:{current:{snapshot:()=>({revision,scenes:[]})}},editOn:true,adapterRef:{current:null},projectRef,
    savedEngineRevRef:{current:0},setProject:()=>{},setSaveState:s=>states.push(s),setSaveError:()=>{},apiCreate:()=>response,
    writeLastProject:()=>{},refreshProjectList:()=>{},embedded:true,structuredClone,Date};
  vm.createContext(context);vm.runInContext(handler+'\nthis.action=saveAsNewProject;',context);
  const pending=context.action();revision=2;release({id:'copy',title:'Deck',revision:0,updatedAt:'2026-10-29T00:00:00Z'});await pending;
  assert.deepEqual({binding:projectRef.current.id,status:states.at(-1)}, {binding:'original',status:'dirty'},'later edits must stay with the original editor instead of being marked saved in a different project');
});
