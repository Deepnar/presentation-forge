import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scenario } from '../../../test/v2-runtime-fixture.js';
import { conversationInput, calls, respond, answer } from '../../../test/v2-conversation-contract.js';
import { endpoint } from '../../../test/v2-provider-fixture.js';
import { createProviderRunner } from '../../../packages/agent/provider-run.ts';

for (const family of ['openai-compatible','anthropic']) {
  test(`${family}: ownership transfer between read rounds fences the old binding`, async t => {
    const env=await scenario(t);let rounds=0;
    const http=await endpoint(t,family,async (_req,res)=>{
      rounds++;
      await env.store.withRuntimeTransaction(env.binding,tx=>tx.query('UPDATE v2_projects SET owner=? WHERE id=?',['new-owner',env.doc.id]));
      respond(res,calls(family,rounds,[{tool:'get_selected_elements',args:{}}]));
    });
    const result=await createProviderRunner(env.store,http.provider).converse(env.binding,conversationInput(env));
    assert.equal(result.code,'not-found');assert.equal(rounds,1);
    const current=await env.store.getProject({...env.binding,owner:'new-owner'});
    assert.deepEqual(current.doc,env.doc);
    const rows=await env.store.withRuntimeTransaction({...env.binding,owner:'new-owner'},tx=>tx.query('SELECT count(*) AS n FROM v2_agent_runs WHERE project_id=?',[env.doc.id]));
    assert.equal(Number(rows[0].n),1);
  });

  test(`${family}: distinct read calls retain exact result IDs and order on the wire`, async t => {
    const env=await scenario(t);let rounds=0;
    const http=await endpoint(t,family,(_req,res,seen)=>{
      if (++rounds===1) return respond(res,calls(family,rounds,[{tool:'get_project',args:{}},{tool:'get_selected_elements',args:{}}]));
      let results,ids;
      if(family==='anthropic') {
        const last=seen.body.messages.at(-1);assert.equal(last.role,'user');
        results=last.content.map(x=>JSON.parse(x.content));ids=last.content.map(x=>x.tool_use_id);
      } else {
        const last=seen.body.messages.slice(-2);assert.ok(last.every(x=>x.role==='tool'));
        results=last.map(x=>JSON.parse(x.content));ids=last.map(x=>x.tool_call_id);
      }
      assert.deepEqual(ids,['round-1-call-0','round-1-call-1']);
      assert.deepEqual(results.map(x=>x.tool),['get_project','get_selected_elements']);
      assert.equal(results[0].data.slides.length,1);
      assert.equal(results[1].data.elements[0].element.paragraphs[0].runs[0].text,'Measured ');
      assert.ok(!JSON.stringify(results).includes('Unrelated private slide'));
      respond(res,answer(family));
    });
    const result=await createProviderRunner(env.store,http.provider).converse(env.binding,conversationInput(env));
    assert.equal(result.outcome,'text');assert.equal(result.conversation.toolCalls,2);
    assert.deepEqual((await env.store.getProject(env.binding)).doc,env.doc);
  });

  test(`${family}: absent usage retains full reservation and reduces next allowance`, async t => {
    const env=await scenario(t);let rounds=0;const allowances=[];
    const http=await endpoint(t,family,(_req,res,seen)=>{
      allowances.push(family==='anthropic'?seen.body.max_tokens:seen.body.max_completion_tokens);
      const body=++rounds===1?calls(family,rounds,[{tool:'get_project',args:{}}]):answer(family);
      delete body.usage;respond(res,body);
    });
    const input=conversationInput(env,{maxOutputTokens:64,limits:{maxExchanges:2,maxToolCalls:2,maxOutputTokensTotal:96}});
    const result=await createProviderRunner(env.store,http.provider).converse(env.binding,input);
    assert.equal(result.outcome,'text');assert.deepEqual(allowances,[64,32]);
    assert.equal(result.conversation.reservedOutputTokens,96);assert.equal(result.conversation.reportedOutputTokens,null);
    assert.deepEqual((await env.store.getProject(env.binding)).doc,env.doc);
  });
}
