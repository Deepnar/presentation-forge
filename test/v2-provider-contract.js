import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from '../packages/model/engine.ts';
import { createToolSession } from '../packages/tools/session.ts';
import { composeInstructions } from '../packages/agent/context.ts';
import { endpoint, wire } from './v2-provider-fixture.js';
import { edit, textEdit, target } from './v2-tool-fixture.js';
export const reviewedEdit = () => edit([textEdit('Reviewed '), {kind:'chart',...target('chart'),categories:['First','Second'],series:[{name:'Reviewed score',values:[2.5,15.75]}]}, {kind:'table',...target('table'),rows:[['Cell','Score'],['First','2.5'],['Second','15.75']]}]);
export async function exchangeFor(t,env,family,{handler,scope=env.plan.scope}={}) {
  const document=await createDocument(env.doc.scenes);
  const session=createToolSession({document,projectId:env.doc.id,ownerId:'owner',actorId:'owner',agentId:'provider-exchange',...scope});
  const context=await composeInstructions({session,request:'Review this slide wording and data.',reads:[{tool:'get_slide',args:{slideId:'s1'}}]});assert.equal(context.ok,true);
  const {provider,seen}=await endpoint(t,family,handler ?? ((_req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(wire(family,[reviewedEdit()])));}));
  const started=performance.now(),result=await provider.exchange(context);return {result,seen,context,exchangeMs:performance.now()-started};
}
export const trustedPlan=(env,result)=>({...env.plan,requestId:crypto.randomUUID(),projectRevision:env.doc.revision,steps:result.calls.map(c=>c.request)});
export function expectedReview(before) {
  const scenes=structuredClone(before.scenes);const [text,chart,table]=scenes[0].elements;
  text.paragraphs[0].runs[0].text='Reviewed ';chart.chart.categories=['First','Second'];chart.chart.series=[{name:'Reviewed score',values:[2.5,15.75]}];table.table.rows=[['Cell','Score'],['First','2.5'],['Second','15.75']];
  for(const e of scenes[0].elements){e.provenance='human';if(e.kind==='text')e.contentCustomized=true;else if(e.kind==='chart')e.dataCustomized=true;else e.tableCustomized=true;}return scenes;
}
export function providerContract(backend,setup) {
  for(const family of ['openai-compatible','anthropic']) {
    test(`${backend}/${family}: HTTP proposal commits canonically, reopens and restores exact history`,async t=>{
      const env=await setup(t);const {result,seen}=await exchangeFor(t,env,family);assert.equal(result.ok,true);assert.equal(result.outcome,'tool-calls');assert.equal((await env.store.getProject(env.binding)).doc.revision,0);
      const run=await env.runtime.start(env.binding,trustedPlan(env,result));const claim=await env.runtime.claim(env.binding,run.id,'provider-test',10000);assert.equal(claim.ok,true);const step=await env.runtime.advance(env.binding,run.id,claim.lease);assert.equal(step.run.status,'succeeded');assert.equal(step.result.changed,true);
      await env.store.closeProjectStore();const after=(await env.store.getProject(env.binding)).doc;assert.equal(after.revision,1);assert.deepEqual(after.scenes,expectedReview(env.doc));assert.equal((await env.store.listRevisions(env.binding)).revisions.length,2);
      const restored=await env.store.restoreRevision({...env.binding,baseRevision:1,targetRevision:0});assert.deepEqual(restored.doc.scenes,env.doc.scenes);
      assert.ok(!JSON.stringify(seen[0].body).includes('Unrelated private slide'));assert.equal((await env.runtime.inspect(env.binding,run.id)).receipts.length,1);
    });
    test(`${backend}/${family}: a human save during HTTP prevents stale plan execution`,async t=>{
      const env=await setup(t);let saved;
      const {result}=await exchangeFor(t,env,family,{handler:async(_req,res)=>{const scenes=structuredClone(env.doc.scenes);scenes[0].elements[0].paragraphs[0].runs[0].text='Human won ';saved=await env.store.saveProject({...env.binding,baseRevision:0,scenes});res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(wire(family,[reviewedEdit()])));}});
      assert.equal(result.ok,true);assert.equal(saved.status,'saved');await assert.rejects(env.runtime.start(env.binding,trustedPlan(env,result)),{code:'invalid-document'});assert.deepEqual((await env.store.getProject(env.binding)).doc,saved.doc);
    });
    test(`${backend}/${family}: protected content remains protected after a valid proposal`,async t=>{
      const env=await setup(t);const scenes=structuredClone(env.doc.scenes);scenes[0].elements[0].locked=true;env.doc=(await env.store.saveProject({...env.binding,baseRevision:0,scenes})).doc;
      const {result}=await exchangeFor(t,env,family);assert.equal(result.ok,true);const run=await env.runtime.start(env.binding,trustedPlan(env,result));const claim=await env.runtime.claim(env.binding,run.id,'provider-test',10000);const step=await env.runtime.advance(env.binding,run.id,claim.lease);assert.equal(step.result.ok,false);assert.equal(step.result.code,'locked');assert.deepEqual((await env.store.getProject(env.binding)).doc,env.doc);assert.equal(step.receipt.changed,false);
    });
    test(`${backend}/${family}: a normalized response grants no foreign-owner authority`,async t=>{
      const env=await setup(t);const {result}=await exchangeFor(t,env,family);assert.equal(result.ok,true);
      await assert.rejects(env.runtime.start({...env.binding,owner:'foreign'},trustedPlan(env,result)),{code:'not-found'});assert.deepEqual((await env.store.getProject(env.binding)).doc,env.doc);
    });
    test(`${backend}/${family}: inspection scope cannot receive an edit proposal`,async t=>{
      const env=await setup(t);const {result}=await exchangeFor(t,env,family,{scope:{...env.plan.scope,mode:'inspect',editableTargets:[]}});assert.equal(result.code,'invalid-response');assert.deepEqual((await env.store.getProject(env.binding)).doc,env.doc);
    });
  }
}
