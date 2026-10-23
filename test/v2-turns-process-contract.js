import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec=promisify(execFile);
import { mkdtemp, writeFile, access, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { fixture, proposed, decision, submission, rows, clockBackend } from './v2-turns-contract.js';
import { createTurnService } from '../packages/agent/turns.ts';
export async function worker(t,e,command) {
  const dir=await mkdtemp(path.join(os.tmpdir(),'forge-chat-worker-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'command.json');await writeFile(file,JSON.stringify({binding:e.binding,...command}));
  const child=spawn(process.execPath,['test/v2-turns-worker.js',file],{env:{...process.env,...e.env},stdio:['ignore','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
  const timer=setTimeout(()=>child.kill('SIGKILL'),20000);let out='',err='';
  child.stdout.on('data',c=>{out+=c;});child.stderr.on('data',c=>{err+=c;});
  return new Promise((resolve,reject)=>{
    child.on('error',reject);child.on('close',(code,signal)=>{clearTimeout(timer);
      if(signal)return reject(new Error(`worker ${signal}: ${err}`));
      if(code!==0 && code!==91)return reject(new Error(`worker ${code}: ${err}`));
      resolve({code,value:out.trim()?JSON.parse(out):null});
    });
  });
}
export async function gate(t) {
  const dir=await mkdtemp(path.join(os.tmpdir(),'forge-chat-gate-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const ready=path.join(dir,'ready'),go=path.join(dir,'go');
  return {ready,go,wait:async()=>{for(let i=0;i<1000;i++){try{await access(ready);return;}catch{}await sleep(10);}throw new Error('ready timeout');},release:()=>writeFile(go,'go')};
}
export async function race(t,e,a,b) {
  const first=await gate(t),second=await gate(t);
  const jobs=[worker(t,e,{...a,ready:first.ready,go:first.go}),worker(t,e,{...b,ready:second.ready,go:second.go})];
  await Promise.all([first.wait(),second.wait()]);
  await Promise.all([first.release(),second.release()]);return Promise.all(jobs);
}
export function turnProcessContract(label,setup) {
  const check=(name,body)=>test(`${label} process: ${name}`,{timeout:30000},body);
  check('local CLI exposes the same generation-bound submit, read, decision and clear contracts',async t=>{
    const e=await fixture(t,setup),dir=await mkdtemp(path.join(os.tmpdir(),'forge-chat-cli-'));t.after(()=>rm(dir,{recursive:true,force:true}));
    async function command(action,input) {
      const args=['src/agent/turn-cli.js',action,'--project',e.binding.id,'--owner',e.binding.owner];
      if(input){const file=path.join(dir,`${action}.json`);await writeFile(file,JSON.stringify(input));args.push('--input',file);}
      const r=await exec(process.execPath,args,{env:{...process.env,...e.env},timeout:15000});return JSON.parse(r.stdout);
    }
    const initial=await command('read'),sub=await command('submit',submission(e,initial));
    const prepared=await e.service.prepare(e.binding,{generation:sub.generation,revision:sub.turn.revision,turnId:sub.turn.id,workerId:'host'},e.provider);
    const queued=await command('decide',decision(prepared,prepared.turn));assert.equal(queued.turn.run.status,'queued');
    assert.equal((await command('export')).turns[0].request,'Review this wording.');
    const state=await command('read');assert.equal((await command('clear',{generation:state.generation,revision:state.revision})).ok,true);
    assert.equal((await command('read')).total,0);
  });
  check('approve/approve across independent processes links exactly one canonical run',async t=>{
    const e=await fixture(t,setup),p=await proposed(e),input=decision(p,p.turn);
    const [a,b]=await race(t,e,{action:'decide',input},{action:'decide',input});
    assert.equal(a.value.ok,true);assert.equal(b.value.ok,true);assert.equal(a.value.turn.run.id,b.value.turn.run.id);
    assert.equal((await rows(e)).runs.length,2);
  });
  check('reject/approve across independent processes has one terminal winner',async t=>{
    const e=await fixture(t,setup),p=await proposed(e),input=decision(p,p.turn);
    const results=await race(t,e,{action:'decide',input},{action:'decide',input:{...input,decision:'reject',decisionKey:'reject'}});
    assert.equal(results.filter(r=>r.value.ok).length,1);assert.equal(results.find(r=>!r.value.ok).value.code,'conflicting-decision');
    const approved=results.find(r=>r.value.ok).value.turn.state==='approved';assert.equal((await rows(e)).runs.length,approved?2:1);
  });
  for(const moment of ['approve-before','approve-after'])check(`${moment} crash leaves neither decision/run or exactly one recoverable pair`,async t=>{
    const e=await fixture(t,setup),p=await proposed(e),input=decision(p,p.turn);
    assert.equal((await worker(t,e,{action:'decide',input,fault:moment})).code,91);
    const stored=await rows(e),committed=moment.endsWith('after');
    assert.equal(stored.runs.length,committed?2:1);assert.equal(JSON.parse(stored.proposals[0].payload).decision,committed?'approve':null);
    const retry=await e.service.decide(e.binding,input);assert.equal(retry.ok,true);assert.equal((await rows(e)).runs.length,2);
  });
  for(const moment of ['reserve-after','dispatch-after','receipt-after','reserve-after-read'])check(`${moment} crash observes conservative recovery and accounting`,async t=>{
    const e=await fixture(t,setup),sub=await e.service.submit(e.binding,submission(e,e.state)),input={generation:sub.generation,revision:sub.turn.revision,turnId:sub.turn.id,workerId:'crash-host'};
    assert.equal((await worker(t,e,{action:'prepare',input,fault:moment})).code,91);
    const c=clockBackend(e.store);c.clock.offset=31000;const recovered=createTurnService(c.backend),state=await recovered.read(e.binding);
    const dispatched=moment!=='reserve-after';assert.equal(state.turns[0].state,dispatched?'needs-user-action':'submitted');
    assert.equal(state.accounting.knownAttempts,['receipt-after','reserve-after-read'].includes(moment)?1:0);
    assert.equal(state.accounting.reservedOutputTokens,moment==='reserve-after-read'?4096:2048);
    if(!dispatched) {
      // Claim with the recovered DB clock, then use its now-fresh lease. The
      // provider request still has a positive immutable preparation window.
      const done=await recovered.prepare(e.binding,{...input,revision:state.turns[0].revision,workerId:'new-host'},e.provider);
      assert.equal(done.ok,true);assert.equal(done.turn.state,'awaiting-decision');
      assert.equal((await recovered.read(e.binding)).accounting.reservedOutputTokens,4096);
    } else assert.equal((await recovered.prepare(e.binding,{...input,revision:state.turns[0].revision,workerId:'new-host'},e.provider)).code,'needs-user-action');
    assert.equal(e.seen.length,dispatched?0:1);
  });
  for(const moment of ['publication-before','publication-after'])check(`${moment} crash never reruns a dispatched provider conversation`,async t=>{
    const e=await fixture(t,setup),sub=await e.service.submit(e.binding,submission(e,e.state)),input={generation:sub.generation,revision:sub.turn.revision,turnId:sub.turn.id,workerId:'crash-host'};
    assert.equal((await worker(t,e,{action:'prepare',input,fault:moment})).code,91);
    const c=clockBackend(e.store);c.clock.offset=31000;const recovered=createTurnService(c.backend),state=await recovered.read(e.binding);
    assert.equal(state.turns[0].state,moment.endsWith('after')?'awaiting-decision':'needs-user-action');
    assert.equal(state.accounting.knownAttempts,1);assert.equal((await rows(e)).proposals.length,moment.endsWith('after')?1:0);
    assert.equal((await recovered.prepare(e.binding,{...input,revision:state.turns[0].revision,workerId:'new-host'},e.provider)).code,'needs-user-action');
    assert.equal(e.seen.length,0);
  });
  check('clear in another process fences pending publication and settles late receipt once',async t=>{
    const e=await fixture(t,setup),sub=await e.service.submit(e.binding,submission(e,e.state)),barrier=await gate(t);
    const preparing=worker(t,e,{action:'prepare',input:{generation:sub.generation,revision:sub.turn.revision,turnId:sub.turn.id,workerId:'late-host'},ready:barrier.ready,go:barrier.go});
    await barrier.wait();const state=await e.service.read(e.binding);
    const cleared=await worker(t,e,{action:'clear',input:{generation:state.generation,revision:state.revision}});assert.equal(cleared.value.ok,true);
    await barrier.release();assert.equal((await preparing).value.code,'lease-lost');
    const after=await e.service.read(e.binding);assert.equal(after.turns.length,0);assert.equal(after.accounting.knownAttempts,1);
    assert.equal((await rows(e)).attempts.length,0);assert.deepEqual((await e.store.getProject(e.binding)).doc,e.doc);
  });
  check('cancel/commit serialization reports committed winner without duplicate edits',async t=>{
    const e=await fixture(t,setup),p=await proposed(e),q=await e.service.decide(e.binding,decision(p,p.turn));
    const state=await e.service.read(e.binding);
    const [cancelled,worked]=await race(t,e,{action:'cancel',input:{generation:state.generation,revision:state.revision,turnId:q.turn.id}},
      {action:'work',input:{runId:q.turn.run.id}});
    assert.equal(cancelled.value.ok,true);assert.ok(worked.value);
    const saved=(await e.store.getProject(e.binding)).doc,run=(await e.runtime.inspect(e.binding,q.turn.run.id));
    assert.ok([0,1].includes(saved.revision));assert.equal(run.receipts.length,saved.revision);
    assert.ok(['cancelled','succeeded'].includes(run.run.status));
  });
}
