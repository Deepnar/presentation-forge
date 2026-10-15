import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiList, apiExport } from '../app/web/src/lib/v2project.js';

for (const [status, code] of [[401, 'auth-required'], [403, 'projects-disabled'], [503, 'store-misconfigured']]) {
  test(`project listing retains ${status} metadata for dashboard recovery`, async () => {
    await assert.rejects(apiList(async () => ({ ok: false, status, json: async () => ({ ok: false, error: 'Unavailable', code }) })),
      error => error.status === status && error.code === code && error.message === 'Unavailable');
  });
}
test('non-JSON project failure retains status and a useful fallback message', async () => {
  await assert.rejects(apiList(async () => ({ ok: false, status: 502, json: async () => { throw new SyntaxError('not JSON'); } })),
    error => error.status === 502 && error.code === null && error.message.includes('502'));
});
test('successful project listing returns summaries without changing the contract', async () => {
  const projects = [{ id: 'p-test', title: 'A' }];
  assert.equal(await apiList(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, projects }) })), projects);
});

test('project export uses the bearer identity without broadening cookie scope', async t => {
  const previous=globalThis.localStorage;
  globalThis.localStorage={getItem:key=>key==='forge.token'?'fixture-session':null};
  t.after(()=>{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;});
  const blob=new Blob(['native pptx']);
  const result=await apiExport('p-test',async(url,opts)=>{
    assert.equal(url,'/api/v2/projects/p-test/export.pptx');
    assert.equal(opts.headers.Authorization,'Bearer fixture-session');
    return {ok:true,blob:async()=>blob};
  });
  assert.equal(result,blob);
});
test('project export surfaces a rejected download instead of saving an error body', async()=>{
  await assert.rejects(apiExport('p-test',async()=>({ok:false,status:401,json:async()=>({error:'Sign in required'})})),/Sign in required/);
});
