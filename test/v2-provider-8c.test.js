import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endpoint, context, wire, caps } from './v2-provider-fixture.js';
import { edit } from './v2-tool-fixture.js';
import { createModelProvider } from '../src/agent/model-provider.js';
import { prepareExchange, parseProviderExchange } from '../packages/agent/provider.ts';

for (const family of ['openai-compatible','anthropic']) {
  test(`${family}: actual HTTP preserves scoped instructions and distinct wire format`, async t => {
    const { provider, seen } = await endpoint(t,family), { context: ctx, document } = await context();
    const result = await provider.exchange(ctx);
    assert.equal(result.ok,true); assert.deepEqual(JSON.parse(JSON.stringify(result.calls[0].request)),edit());
    assert.equal(result.model,'fixture-resolved-model'); assert.equal(result.usage.inputTokens,family==='anthropic'?49:42);
    assert.equal(document.status().revision,0,'exchange is a proposal, never an edit');
    assert.equal(seen.length,1); const sent = seen[0];
    assert.equal(sent.url,family === 'anthropic' ? '/v1/messages' : '/v1/chat/completions');
    if (family === 'anthropic') { assert.equal(sent.headers['x-api-key'],'fixture-private-key'); assert.equal(sent.headers['anthropic-version'],'2023-06-01'); assert.equal(sent.body.system,ctx.messages[0].content); assert.equal(sent.body.messages[0].role,'user'); assert.equal(sent.body.tools[0].input_schema.type,'object'); assert.equal(sent.body.max_tokens,2048); assert.equal(result.usage.cacheReadInputTokens,3); }
    else { assert.equal(sent.headers.authorization,'Bearer fixture-private-key'); assert.deepEqual(sent.body.messages,ctx.messages); assert.equal(sent.body.tools[0].function.parameters.type,'object'); assert.equal(sent.body.parallel_tool_calls,false); assert.equal(sent.body.max_completion_tokens,2048); }
    const body = JSON.stringify(sent.body); for (const secret of ['fixture-private-key','112233','445566','Unrelated private slide','fontFamily','editableTargets']) assert.ok(!body.includes(secret),secret);
  });
  test(`${family}: capability negotiation refuses before network without downgrade`, async t => {
    const { provider, seen } = await endpoint(t,family), { context: ctx } = await context();
    for (const feature of ['vision','reasoning','files','streaming','structuredOutput']) assert.equal((await provider.exchange(ctx,{requires:[feature]})).code,'unsupported-capability');
    assert.equal((await provider.exchange(ctx,{requires:['invented']})).code,'invalid-request');
    assert.equal((await provider.exchange(ctx,{maxOutputTokens:2049})).code,'invalid-request');
    assert.equal(seen.length,0);
  });
  test(`${family}: invalid options and executable accessors never execute`, async t => {
    const { provider, seen } = await endpoint(t,family), { context: ctx } = await context(); let invoked=0;
    assert.equal((await provider.exchange(ctx,{get requires(){invoked++;return [];}})).code,'invalid-request');
    assert.equal((await provider.exchange(ctx,3)).code,'invalid-request'); assert.equal(invoked,0); assert.equal(seen.length,0);
  });
  test(`${family}: context budget counts wire schemas and controls`, async t => {
    const { provider,seen } = await endpoint(t,family,null,{capabilities:{...caps(),contextChars:2048}}), {context:ctx}=await context();
    assert.equal((await provider.exchange(ctx)).code,'context-too-large'); assert.equal(seen.length,0);
  });
  test(`${family}: cancellation before dispatch and during headers is bounded`, async t => {
    const {provider,seen,arrived}=await endpoint(t,family,()=>{}),{context:ctx}=await context();
    const before=new AbortController();before.abort();assert.equal((await provider.exchange(ctx,{signal:before.signal})).code,'cancelled');assert.equal(seen.length,0);
    const during=new AbortController();const pending=provider.exchange(ctx,{signal:during.signal});await arrived;during.abort();assert.equal((await pending).code,'cancelled');assert.equal(seen.length,1);
  });
  test(`${family}: cancellation while reading a body aborts the request`, async t => {
    const {provider,arrived}=await endpoint(t,family,(_req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.write('{');}),{context:ctx}=await context();
    const controller=new AbortController();const pending=provider.exchange(ctx,{signal:controller.signal});await arrived;await new Promise(r=>setTimeout(r,20));controller.abort();assert.equal((await pending).code,'cancelled');
  });
  test(`${family}: timeout covers a stalled body without retries`, async t => {
    const {provider,seen}=await endpoint(t,family,(_req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.write('{');},{timeoutMs:40}),{context:ctx}=await context();
    const start=performance.now();assert.equal((await provider.exchange(ctx)).code,'timeout');assert.ok(performance.now()-start<2000);assert.equal(seen.length,1);
  });
  for (const [status,code] of [[401,'unauthorized'],[403,'unauthorized'],[429,'rate-limited'],[500,'provider-unavailable'],[302,'provider-unavailable']]) test(`${family}: status${status} is sanitized and never retried`,async t=>{
    const {provider,seen}=await endpoint(t,family,(_req,res)=>{res.writeHead(status,{'content-type':'application/json',location:'http://127.0.0.1:1/private'});res.end('fixture-private-key raw provider error');}),{context:ctx}=await context();
    const result=await provider.exchange(ctx);assert.equal(result.code,code);assert.ok(!JSON.stringify(result).includes('fixture-private-key'));assert.equal(seen.length,1);
  });
  for (const knownLength of [false,true]) test(`${family}: oversized ${knownLength?'declared':'chunked'} response refuses`,async t=>{
    const {provider}=await endpoint(t,family,(_req,res)=>{res.writeHead(200,{'content-type':'application/json',...(knownLength?{'content-length':'10000'}:{})});res.end('x'.repeat(10000));},{maxResponseBytes:256}),{context:ctx}=await context();assert.equal((await provider.exchange(ctx)).code,'response-too-large');
  });
  for (const body of ['{bad',Buffer.from([0xff,0xfe])]) test(`${family}: malformed ${Buffer.isBuffer(body)?'UTF8':'JSON'} refuses as invalid response`,async t=>{
    const {provider}=await endpoint(t,family,(_req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end(body);}),{context:ctx}=await context();assert.equal((await provider.exchange(ctx)).code,'invalid-response');
  });
  test(`${family}: malformed and unsafe tool proposals refuse atomically`,async t=>{
    const {provider}=await endpoint(t,family),{context:ctx}=await context();const prep=prepareExchange(provider.profile,ctx);assert.ok(!('ok' in prep));
    for(const req of [{tool:'raw_scene',args:{}},edit([{kind:'text',slideId:'s1',elementId:'text',paragraphIndex:0,runIndex:0,text:'x',x:4}]),{...edit(),args:{...edit().args,owner:'other'}},edit(undefined,99)]) assert.equal(parseProviderExchange(provider.profile,prep,wire(family,[req])).code,'invalid-response');
    let raw=wire(family,[edit(),edit()]);if(family==='anthropic')raw.content[1].id=raw.content[0].id;else raw.choices[0].message.tool_calls[1].id=raw.choices[0].message.tool_calls[0].id;assert.equal(parseProviderExchange(provider.profile,prep,raw).code,'invalid-response');
    assert.equal(parseProviderExchange(provider.profile,prep,wire(family,Array.from({length:9},()=>edit()))).code,'invalid-response');
    raw=wire(family);if(family==='anthropic')raw.stop_reason='max_tokens';else raw.choices[0].finish_reason='length';assert.equal(parseProviderExchange(provider.profile,prep,raw).code,'truncated');
    raw=wire(family);if(family==='anthropic')raw.stop_reason='end_turn';else raw.choices[0].finish_reason='stop';assert.equal(parseProviderExchange(provider.profile,prep,raw).code,'invalid-response');
  });
  test(`${family}: text, refusal and missing usage are truthful outcomes`,async t=>{
    const {provider}=await endpoint(t,family),{context:ctx}=await context();const prep=prepareExchange(provider.profile,ctx);
    const raw=wire(family,[]);delete raw.usage;
    if(family==='anthropic'){raw.stop_reason='end_turn';raw.content=[{type:'text',text:'A concise explanation.'}];}else{raw.choices[0].finish_reason='stop';raw.choices[0].message.content='A concise explanation.';}
    const answer=parseProviderExchange(provider.profile,prep,raw);assert.equal(answer.outcome,'text');assert.equal(answer.usage,null);assert.deepEqual(answer.calls,[]);
    if(family==='anthropic')raw.stop_details={type:'refusal'};else raw.choices[0].message.refusal='Cannot do that.';
    assert.equal(parseProviderExchange(provider.profile,prep,raw).outcome,'refusal');
    const bad=wire(family);if(family==='anthropic')bad.usage.input_tokens=-1;else bad.usage.total_tokens=3;assert.equal(parseProviderExchange(provider.profile,prep,bad).code,'invalid-response');
  });
}
test('transport configuration is immutable, explicit and cannot embed URL credentials',()=>{
  const base={family:'openai-compatible',id:'test',model:'operator-model',baseURL:'https://example.invalid/v1',apiKey:'fixture-private-key',capabilities:caps()};
  const provider=createModelProvider(base);base.capabilities.toolCalling=false;assert.equal(provider.profile.capabilities.toolCalling,true);assert.ok(Object.isFrozen(provider.profile.capabilities));
  for(const baseURL of ['http://example.invalid/v1','https://name:fixture-private-key@example.invalid/v1','https://example.invalid/v1?key=fixture-private-key'])assert.throws(()=>createModelProvider({...base,baseURL}),e=>!e.message.includes('fixture-private-key'));
  assert.throws(()=>createModelProvider({...base,capabilities:{...caps(),vision:true}}));
});

test('OpenAI-compatible legacy token parameter is an explicit configuration choice',async t=>{
  const {provider,seen}=await endpoint(t,'openai-compatible',null,{tokenParameter:'max_tokens'}),{context:ctx}=await context();
  assert.equal((await provider.exchange(ctx)).ok,true);assert.equal(seen[0].body.max_tokens,2048);assert.ok(!('max_completion_tokens' in seen[0].body));
});
test('wire budget includes the output limit and refuses before HTTP at its boundary',async t=>{
  const {context:ctx}=await context();const first=await endpoint(t,'openai-compatible');const prep=prepareExchange(first.provider.profile,ctx);const size=JSON.stringify(prep.wire).length;
  const next=await endpoint(t,'openai-compatible',null,{capabilities:{...caps(),contextChars:size-1}});
  assert.equal((await next.provider.exchange(ctx)).code,'context-too-large');assert.equal(next.seen.length,0);
});
test('transport failure details never escape and a non-cooperating injected fetch is bounded',async()=>{
  const base={family:'openai-compatible',id:'test',model:'operator-model',baseURL:'https://example.invalid/v1',apiKey:'fixture-private-key',capabilities:caps(),timeoutMs:20};const {context:ctx}=await context();
  const failed=createModelProvider(base,{fetch:async()=>{throw new Error('fixture-private-key');}});const result=await failed.exchange(ctx);assert.equal(result.code,'provider-unavailable');assert.ok(!JSON.stringify(result).includes('fixture-private-key'));
  const stalled=createModelProvider(base,{fetch:()=>new Promise(()=>{})});assert.equal((await stalled.exchange(ctx)).code,'timeout');
});

for(const family of ['openai-compatible','anthropic']) test(`${family}: altered catalogs and noncanonical complete requests refuse`,async t=>{
  const {provider,seen}=await endpoint(t,family),{context:ctx}=await context();const forged=JSON.parse(JSON.stringify(ctx));forged.tools.find(t=>t.name==='edit_content').inputSchema={type:'object'};
  assert.equal((await provider.exchange(forged)).code,'invalid-request','altered catalog refused before HTTP');assert.equal(seen.length,0);
  const prep={context:forged,outputTokens:2048,wire:{}};
  assert.equal(parseProviderExchange(provider.profile,prep,wire(family,[{tool:'edit_content',args:{...edit().args,x:4,fontFamily:'Invented',owner:'other'}}])).code,'invalid-response','canonical request remains enforced independently of catalog schema');
});

for(const family of ['openai-compatible','anthropic']) test(`${family}: normalized usage includes cached input exactly once`,async t=>{
  const {provider}=await endpoint(t,family),{context:ctx}=await context();const prep=prepareExchange(provider.profile,ctx);const raw=wire(family);
  if(family==='openai-compatible')raw.usage.prompt_tokens_details={cached_tokens:3,cache_write_tokens:4};
  const result=parseProviderExchange(provider.profile,prep,raw);assert.equal(result.ok,true);assert.equal(result.usage.inputTokens,family==='anthropic'?49:42);assert.equal(result.usage.cacheReadInputTokens,3);assert.equal(result.usage.cacheWriteInputTokens,4);
});

for(const family of ['openai-compatible','anthropic']) test(`${family}: cache counters reject invalid accounting and preserve unavailable breakdowns`,async t=>{
  const {provider}=await endpoint(t,family),{context:ctx}=await context();const prep=prepareExchange(provider.profile,ctx);
  for(const count of [-1,'3',100000001]){const raw=wire(family);if(family==='anthropic')raw.usage.cache_read_input_tokens=count;else raw.usage.prompt_tokens_details={cached_tokens:count};assert.equal(parseProviderExchange(provider.profile,prep,raw).code,'invalid-response');}
  const missing=wire(family);if(family==='anthropic'){delete missing.usage.cache_read_input_tokens;missing.usage.cache_creation_input_tokens=null;}else missing.usage.prompt_tokens_details=null;
  const result=parseProviderExchange(provider.profile,prep,missing);assert.equal(result.ok,true);assert.equal(result.usage.inputTokens,42);assert.ok(!('cacheReadInputTokens' in result.usage));assert.ok(!('cacheWriteInputTokens' in result.usage));
});
