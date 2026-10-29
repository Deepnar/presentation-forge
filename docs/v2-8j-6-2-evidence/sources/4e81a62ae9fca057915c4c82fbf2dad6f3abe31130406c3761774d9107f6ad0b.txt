import test from 'node:test';
import assert from 'node:assert/strict';
import { createSavedExport,browserExportDownload,PPTX_MIME,NOTES_BYTES } from '../app/web/src/lib/nativeExport.js';
const meta={ok:true,snapshot:{projectId:'p',projectRevision:2,sourceGeneration:3,sourceRevision:4},citationCount:1};
const input=()=>({id:'p',title:'Saved deck',revision:2});
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const cited=()=>new Response('inherited issue list',{status:422,headers:{'X-Forge-Export-Refusal':'citation-preservation-required'}});
const binary=(value='pptx',extra={})=>new Response(value,{headers:{'Content-Type':PPTX_MIME,'X-Forge-Project-Revision':'2','X-Forge-Source-Generation':'3','X-Forge-Source-Revision':'4',...extra}});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function rig(responses=[cited(),json(meta),binary()]) {
  const calls=[],downloads=[],states=[];let auth={token:'owner',epoch:1};
  const controller=createSavedExport({session:()=>auth,fetchFn:async(url,options)=>{calls.push({url,options});const response=responses.shift();return typeof response==='function'?response():await response;},download:value=>{downloads.push(value);return value.current();},onChange:value=>states.push(value)});
  return {controller,calls,downloads,states,setSession:value=>auth=value};
}
test('export client: uncited direct download preserves revision identity and has no notes path',async()=>{
  const r=rig([binary()]);assert.equal(await r.controller.start(input()),true);assert.equal(r.downloads.length,1);assert.equal(r.calls.length,1);assert.equal(r.controller.snapshot().phase,'done');
  const {options}=r.calls[0];assert.equal(options.headers.get('Authorization'),'Bearer owner');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
});
test('export client: cited metadata is bounded preview, explicit one-shot consent alone dispatches POST',async()=>{
  const r=rig();await r.controller.start(input());assert.equal(r.controller.snapshot().phase,'confirm');assert.equal(r.downloads.length,0);assert.equal(r.calls.length,2);
  assert.equal(await r.controller.start({...input(),id:'other'}),false);assert.equal(r.calls.length,2);
  const pending=r.controller.confirm();assert.equal(await r.controller.confirm(),false);await pending;
  assert.equal(r.calls.length,3);assert.equal(r.downloads.length,1);assert.deepEqual(JSON.parse(r.calls[2].options.body),{projectRevision:2,sourceGeneration:3,sourceRevision:4,disclosure:'source-title-url-v1'});
});
test('export client: metadata schema ID counters MIME byte limits and displayed revision fail closed',async()=>{
  for(const response of [json({...meta,source:'private'}),json({...meta,citationCount:513}),json({...meta,snapshot:{...meta.snapshot,projectId:'foreign'}}),
    json({...meta,snapshot:{...meta.snapshot,projectRevision:3}}),json({...meta,snapshot:{...meta.snapshot,sourceGeneration:-1}}),
    new Response('<html>private</html>',{headers:{'Content-Type':'text/html'}}),new Response('x'.repeat(8193),{headers:{'Content-Type':'application/json'}})]) {
    const r=rig([cited(),response]);await r.controller.start(input());assert.equal(r.controller.snapshot().phase,'error');assert.equal(r.downloads.length,0);assert.equal(r.calls.length,2);assert.equal(JSON.stringify(r.controller.snapshot()).includes('private'),false);
  }
});
test('export client: generic422 and oversized errors do not authorize notes inspection or reflect body text',async()=>{
  for(const response of [json({ok:false,error:'PRIVATE-URL'},422),new Response('x'.repeat(8193),{status:503,headers:{'Content-Type':'application/json'}})]) {
    const r=rig([response]);await r.controller.start(input());assert.equal(r.calls.length,1);assert.equal(r.controller.snapshot().phase,'error');assert.equal(JSON.stringify(r.states).includes('PRIVATE'),false);
  }
});
test('export client: pending edits refuse synchronously and later dirty state suppresses confirmation/download',async()=>{
  let clean=false;const r=rig();await r.controller.start({...input(),clean:()=>clean});assert.equal(r.calls.length,0);assert.equal(r.controller.snapshot().error,'Finish editing and save this presentation before exporting.');
  clean=true;await r.controller.start({...input(),clean:()=>clean});clean=false;await r.controller.confirm();assert.equal(r.calls.length,2);assert.equal(r.downloads.length,0);
});
test('export client: cancel or session/route ABA at each awaited stage makes old completion inert',async()=>{
  for(const stage of [0,1,2])for(const reason of ['cancel','session','route']) {
    const gate=deferred(),responses=[cited(),json(meta),binary()];responses[stage]=gate.promise;
    const r=rig(responses);let route=true;
    const start=r.controller.start({...input(),current:()=>route});let pending=start;
    if(stage===1){while(r.calls.length<2)await new Promise(resolve=>setImmediate(resolve));}
    if(stage===2){await start;pending=r.controller.confirm();while(r.calls.length<3)await new Promise(resolve=>setImmediate(resolve));}
    if(reason==='cancel')r.controller.cancel();else if(reason==='session')r.setSession({token:'owner',epoch:3});else route=false;
    gate.resolve(stage===0?cited():stage===1?json(meta):binary());await pending;
    assert.equal(r.downloads.length,0);
  }
});
test('export client: old cancellation cannot release a newer shared ticket',async()=>{
  const gate=deferred(),r=rig([gate.promise,cited(),json(meta)]),old=r.controller.start(input());r.controller.cancel();
  await r.controller.start(input());assert.equal(r.controller.snapshot().phase,'confirm');gate.resolve(binary());await old;assert.equal(r.controller.snapshot().phase,'confirm');assert.equal(r.downloads.length,0);
});
test('export client: notes headers and actual64MiB body ceiling reject before Blob/link publication',async()=>{
  for(const response of [binary('x',{'X-Forge-Source-Revision':'99'}),binary(new Uint8Array(NOTES_BYTES+1))]) {
    const r=rig([cited(),json(meta),response]);await r.controller.start(input());await r.controller.confirm();assert.equal(r.controller.snapshot().phase,'error');assert.equal(r.downloads.length,0);
  }
});
test('export client: stale direct revision and wrong MIME never download, immutable inputs stay captured',async()=>{
  for(const response of [binary('x',{'X-Forge-Project-Revision':'3'}),binary('x',{'Content-Type':'application/json'})]) {
    const r=rig([response]);await r.controller.start(input());assert.equal(r.downloads.length,0);assert.equal(r.controller.snapshot().phase,'error');
  }
  const gate=deferred(),r=rig([gate.promise]),q=input(),pending=r.controller.start(q);q.id='foreign';q.revision=90;q.title='changed';gate.resolve(binary());await pending;assert.equal(r.downloads[0].title,'Saved deck');
});
test('export client: actual download cleanup revokes unclicked URLs and gives clicked URLs bounded grace',()=>{
  const previous={document:globalThis.document,create:URL.createObjectURL,revoke:URL.revokeObjectURL,timer:globalThis.setTimeout};
  const revoked=[],timers=[];let current=true,clicked=0,removed=0;
  URL.createObjectURL=()=>{return 'blob:private';};URL.revokeObjectURL=value=>revoked.push(value);
  globalThis.setTimeout=(fn,ms)=>{timers.push({fn,ms});return 1;};
  globalThis.document={body:{appendChild(){}},createElement:()=>({click(){clicked++;},remove(){removed++;}})};
  try {
    assert.equal(browserExportDownload({blob:new Blob(['x']),title:'Unsafe/title',current:()=>current}),true);assert.equal(clicked,1);assert.equal(removed,1);assert.deepEqual(revoked,[]);assert.equal(timers[0].ms,1000);timers[0].fn();assert.deepEqual(revoked,['blob:private']);
    URL.createObjectURL=()=>{current=false;return 'blob:cancelled';};current=true;assert.equal(browserExportDownload({blob:new Blob(['x']),title:'x',current:()=>current}),false);assert.deepEqual(revoked,['blob:private','blob:cancelled']);
  } finally {globalThis.document=previous.document;URL.createObjectURL=previous.create;URL.revokeObjectURL=previous.revoke;globalThis.setTimeout=previous.timer;}
});
