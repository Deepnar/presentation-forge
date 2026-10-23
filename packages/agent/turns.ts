import type { Binding, RuntimeBackend, RuntimeTransaction } from './runtime.ts';
import { checkBinding, queueRun, inspectRun, cancelRun } from './run-transaction.ts';
import { parsePlan, planDigest, invalidRun, type RunPlan } from './run-state.ts';
import { createProviderRunner } from './provider-run.ts';
import { providerProfile, type ModelProvider, type ProviderExchange } from './provider.ts';
import { cloneJson } from '../tools/json.ts';
import { TURN_LIMITS as L, bytes, characters, parseTurnSubmission, identityDigest, type TurnRecord, type TurnAttempt } from './turn-state.ts';
import { loadState, saveState, reconcile, touch, updateTurn, endTurn, addCounter, settle, admitted, usage,
  unresolved, activeTurn, refuse, turnView, type State, type StoredTurn, type StoredProposal } from './turn-store.ts';

const identifier = (v: unknown): v is string => typeof v==='string' && v.trim().length>0 && v.length<=128;
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v)>=0;
function request(input: unknown, keys: string[]) {
  const value = JSON.parse(JSON.stringify(cloneJson(input,2048))) as Record<string,unknown>;
  if (!value || Array.isArray(value) || Object.keys(value).sort().join(',')!==keys.sort().join(',')) invalidRun();
  return value;
}
function generation(s: State, r: {generation?:unknown;revision?:unknown}) {
  if (!identifier(r.generation) || !integer(r.revision)) return refuse('invalid-request');
  if (r.generation!==s.header.generation) return refuse('stale-generation');
  return null;
}
const revision = (s: State, r: {generation?:unknown;revision?:unknown}) => r.revision!==s.header.revision ? refuse('stale-conversation') : null;
const hostFailure = (code: string): never => { throw Object.assign(new Error('Durable turn was fenced.'), {code:'invalid-document',turnCode:code}); };

// All authority is supplied by the host binding. Every operation, including
// read/export, re-enters the existing owner-checked project transaction.
export function createTurnService(backend: RuntimeBackend) {
  async function transaction<T>(binding: Binding, job: (tx: RuntimeTransaction,s: State,now: number)=>Promise<T>) {
    const trusted=checkBinding(binding);
    return backend.withRuntimeTransaction(trusted,async tx=>{
      const s=await loadState(tx,trusted), now=await tx.now();
      await reconcile(tx,trusted,s,now);
      const value=await job(tx,s,now);
      await saveState(tx,trusted,s);
      return value;
    });
  }
  const stamp = (s: State) => ({generation:s.header.generation,revision:s.header.revision});
  const result = async (tx: RuntimeTransaction,binding: Binding,s: State,t: StoredTurn) =>
    ({ok:true as const,...stamp(s),turn:await turnView(tx,binding,s,t)});
  function owns(s: State,t: StoredTurn | undefined,g: string,fence: number,worker: string,now: number): t is StoredTurn {
    return !!t && s.header.generation===g && t.meta.state==='preparing' && t.meta.fence===fence &&
      t.meta.lease?.workerId===worker && t.meta.lease.until>now && t.meta.prepDeadline>now;
  }
  async function guard(tx: RuntimeTransaction,t: StoredTurn) {
    const now=await tx.now();
    if (now>=t.meta.prepDeadline || !t.meta.lease || now>=t.meta.lease.until) hostFailure('deadline');
  }
  return Object.freeze({
    async read(binding: Binding, input: unknown = {offset:0,limit:20}) {
      const r=request(input,['offset','limit']);
      if (!integer(r.offset) || !integer(r.limit) || r.limit<1 || r.limit>20 || r.offset>L.turns) invalidRun();
      const offset=r.offset,limit=r.limit;
      return transaction(binding,async(tx,s)=>({ok:true as const,...stamp(s),policyVersion:1,
        accounting:{...s.header.accounting}, storage:usage(s),total:s.turns.length,
        turns:await Promise.all([...s.turns].sort((a,b)=>a.meta.createdAt-b.meta.createdAt || a.meta.id.localeCompare(b.meta.id))
          .slice(offset,offset+limit).map(t=>turnView(tx,binding,s,t)))}));
    },
    async export(binding: Binding) {
      return transaction(binding,async(tx,s)=>({ok:true as const,version:1,...stamp(s),policyVersion:1,
        accounting:{...s.header.accounting},turns:await Promise.all([...s.turns]
          .sort((a,b)=>a.meta.createdAt-b.meta.createdAt || a.meta.id.localeCompare(b.meta.id))
          .map(t=>turnView(tx,binding,s,t)))}));
    },
    async submit(binding: Binding,input: unknown) {
      const r=parseTurnSubmission(input), {generation:g,revision:_r,...identity}=r;
      const digest=await identityDigest(identity);
      return transaction(binding,async(tx,s,now)=>{
        const old=generation(s,r); if(old) return old;
        const existing=s.turns.find(t=>t.meta.requestKey===r.requestKey);
        if(existing) return existing.meta.identity===digest ? result(tx,binding,s,existing) : refuse('conflicting-request');
        const stale=revision(s,r);if(stale)return stale;
        if(s.turns.some(t=>activeTurn(t.meta)))return refuse('busy');
        if(r.projectRevision!==tx.doc.revision)return refuse('stale-project');
        const slides=new Set(tx.doc.scenes.map(s=>s.id));
        if(r.scope.readableSlides.some(id=>!slides.has(id)) || [...r.scope.editableTargets,...r.scope.selection]
          .some(t=>!r.scope.readableSlides.includes(t.slideId)))return refuse('invalid-request');
        const meta:TurnRecord={version:1,id:crypto.randomUUID(),generation:g,requestKey:r.requestKey,identity:digest,
          projectRevision:r.projectRevision,state:'submitted',code:null,revision:0,fence:0,lease:null,everDispatched:false,
          createdAt:now,updatedAt:now,prepDeadline:now+120000,planDeadline:now+1200000,proposalId:null,runId:null,
          reservedPrivateBytes:L.finalPrivateReservation,reservedMetadataBytes:L.finalMetadataReservation};
        const t={meta,body:{input:r,reply:null}};
        s.turns.push(t);
        if(!admitted(s)){s.turns.pop();return refuse('storage-limit');}
        touch(s,now);
        return result(tx,binding,s,t);
      });
    },
    async clear(binding: Binding,input: unknown) {
      const r=request(input,['generation','revision']);
      return transaction(binding,async(tx,s,now)=>{
        const old=generation(s,r) ?? revision(s,r);if(old)return old;
        const runs=[];
        for(const t of s.turns)if(t.meta.runId)runs.push(await cancelRun(tx,binding,t.meta.runId));
        // Existing unsettled slots already reserve their capacity. Clear allocates
        // no tombstone and preserves conservative accounting exactly once.
        for(const a of s.attempts) {
          if(a.state==='reserved')settle(s,a,null);
          if(!unresolved(a))await tx.query('DELETE FROM v2_agent_attempts WHERE id=? AND project_id=?',[a.id,binding.id]);
        }
        s.attempts=s.attempts.filter(unresolved);
        await tx.query('DELETE FROM v2_agent_proposals WHERE project_id=?',[binding.id]);
        await tx.query('DELETE FROM v2_agent_turns WHERE project_id=?',[binding.id]);
        s.turns=[];s.proposals=[];s.header.generation=crypto.randomUUID();touch(s,now);
        return {ok:true as const,...stamp(s),runs};
      });
    },
    async cancel(binding: Binding,input: unknown) {
      const r=request(input,['generation','revision','turnId']);
      if(!identifier(r.turnId))invalidRun();
      return transaction(binding,async(tx,s,now)=>{
        const old=generation(s,r);if(old)return old;
        const t=s.turns.find(t=>t.meta.id===r.turnId);if(!t)return refuse('not-found');
        if(t.meta.state==='cancelled')return result(tx,binding,s,t);
        const stale=revision(s,r);if(stale)return stale;
        if(t.meta.runId)await cancelRun(tx,binding,t.meta.runId);
        const p=s.proposals.find(p=>p.meta.id===t.meta.proposalId);
        if(p && p.meta.decision===null){p.plan=null;p.meta.decision='cancel';p.meta.decisionKey=t.meta.id;p.meta.decisionDigest=await identityDigest(r);p.meta.revision++;}
        endTurn(t.meta,'cancelled','cancelled',now);touch(s,now);
        return result(tx,binding,s,t);
      });
    },
    async decide(binding: Binding,input: unknown) {
      const r=request(input,['generation','revision','proposalId','proposalRevision','projectRevision','decision','decisionKey']);
      if(!identifier(r.proposalId) || !identifier(r.decisionKey) || !integer(r.proposalRevision) ||
        !integer(r.projectRevision) || !['approve','reject'].includes(String(r.decision)))invalidRun();
      const decisionDigest=await identityDigest(r);
      return transaction(binding,async(tx,s,now)=>{
        const old=generation(s,r);if(old)return old;
        const p=s.proposals.find(p=>p.meta.id===r.proposalId);if(!p)return refuse('not-found');
        const t=s.turns.find(t=>t.meta.id===p.meta.turnId)!;
        // Committed replay precedes fresh revision/expiry checks. The linked run
        // may have advanced the project itself since the original approval.
        if(p.meta.decision!==null){
          if(p.meta.decision===r.decision && p.meta.decisionKey===r.decisionKey && p.meta.decisionDigest===decisionDigest)return result(tx,binding,s,t);
          return refuse('conflicting-decision');
        }
        const stale=revision(s,r);if(stale)return stale;
        if(t.meta.state!=='awaiting-decision' || !p.plan || now>=p.meta.expiresAt)return refuse('proposal-unavailable');
        if(p.meta.revision!==r.proposalRevision)return refuse('stale-proposal');
        if(r.projectRevision!==tx.doc.revision || p.meta.projectRevision!==tx.doc.revision)return refuse('stale-project');
        if(await planDigest(p.plan)!==p.meta.digest)invalidRun();
        const plan=p.plan;
        const guards:(()=>Promise<void>)[]=[];
        const inner={...tx,beforeCommit:(g:()=>Promise<void>)=>{guards.push(g);}};
        if(r.decision==='approve') {
          const run=await queueRun(inner,checkBinding(binding),plan,p.meta.digest);
          p.meta.runId=run.id;t.meta.runId=run.id;
        }
        p.meta.decision=r.decision as 'approve'|'reject';p.meta.decisionKey=r.decisionKey as string;p.meta.decisionDigest=decisionDigest;p.meta.revision++;
        p.plan=null;endTurn(t.meta,r.decision==='approve'?'approved':'rejected',null,now);touch(s,now);
        tx.beforeCommit(async()=>{
          for(const g of guards)await g();
          const at=await tx.now();
          if(at>=p.meta.expiresAt || at>=plan.deadlineAt)hostFailure('approval-expired');
        });
        return result(tx,binding,s,t);
      });
    },
    async prepare(binding: Binding,input: unknown,provider: ModelProvider,options: {signal?:AbortSignal}={}) {
      const r=request(input,['generation','revision','turnId','workerId']);
      if(!identifier(r.generation) || !integer(r.revision) || !identifier(r.turnId) || !identifier(r.workerId))invalidRun();
      const g=r.generation,worker=r.workerId,turnId=r.turnId;
      const profile=providerProfile(provider.profile),configurationDigest=await identityDigest(profile);
      const claimed=await transaction(binding,async(tx,s,now)=>{
        if(g!==s.header.generation)return refuse('stale-generation');
        const t=s.turns.find(t=>t.meta.id===turnId);if(!t)return refuse('not-found');
        if(t.meta.state!=='submitted')return refuse(t.meta.state==='preparing'?'busy':'needs-user-action');
        if(t.meta.revision!==r.revision)return refuse('stale-turn');
        if(tx.doc.revision!==t.meta.projectRevision){endTurn(t.meta,'refused','stale-project',now);touch(s,now);return refuse('stale-project');}
        if(options.signal?.aborted){endTurn(t.meta,'cancelled','cancelled',now);touch(s,now);return refuse('cancelled');}
        if(t.meta.everDispatched){endTurn(t.meta,'needs-user-action','continuation-lost',now);touch(s,now);return refuse('needs-user-action');}
        t.meta.fence++;t.meta.state='preparing';t.meta.lease={workerId:worker,until:Math.min(now+30000,t.meta.prepDeadline)};
        updateTurn(t.meta,now);touch(s,now);
        tx.beforeCommit(()=>guard(tx,t));
        return {ok:true as const,meta:structuredClone(t.meta),input:structuredClone(t.body.input)};
      });
      if(!claimed.ok)return claimed;
      const fence=claimed.meta.fence;
      async function cancelOutcome(tx:RuntimeTransaction,s:State,now:number) {
        const t=s.turns.find(t=>t.meta.id===turnId);
        if(!t || s.header.generation!==g || t.meta.fence!==fence)return refuse('lease-lost');
        if(t.meta.state==='cancelled')return result(tx,binding,s,t);
        if(!['submitted','preparing','needs-user-action','expired'].includes(t.meta.state))return refuse('lease-lost');
        endTurn(t.meta,'cancelled','cancelled',now);touch(s,now);
        return result(tx,binding,s,t);
      }

      let plan:RunPlan|null=null,hostCode:string|null=null;
      const deny=(code:string):never=>{hostCode=code;return hostFailure(code);};
      const renew=()=>transaction(binding,async(tx,s,now)=>{
        const t=s.turns.find(t=>t.meta.id===turnId);
        if(!owns(s,t,g,fence,worker,now))return false;
        t.meta.lease!.until=Math.min(now+30000,t.meta.prepDeadline);updateTurn(t.meta,now);touch(s,now);
        tx.beforeCommit(()=>guard(tx,t));return true;
      });
      const timer=setInterval(()=>{void renew().catch(()=>{});},10000);
      const runner=createProviderRunner(backend,provider,{
        planDeadlineAt:claimed.meta.planDeadline,
        reserve: async event=>{
          const reserved=await transaction(binding,async(tx,s,now)=>{
            const t=s.turns.find(t=>t.meta.id===turnId);
            if(!owns(s,t,g,fence,worker,now))return refuse('lease-lost');
            const previous=s.attempts.filter(a=>a.turnId===turnId);
            if(previous.filter(a=>a.fence===fence).length!==event.step || previous.some(unresolved) || previous.length>=claimed.input.limits.maxExchanges ||
              previous.reduce((n,a)=>n+a.reservedOutputTokens,0)+event.outputTokens>claimed.input.limits.maxOutputTokensTotal)
              return refuse('attempt-refused');
            if(s.attempts.filter(unresolved).length>=L.settlements)return refuse('settlement-limit');
            // Leave room for maximum validated usage in every outstanding slot.
            if(Object.values(s.header.accounting).some(n=>n>Number.MAX_SAFE_INTEGER-(L.settlements+1)*100000000))return refuse('accounting-limit');
            const a:TurnAttempt={version:1,id:crypto.randomUUID(),turnId,generation:g,fence,step:event.step,
              reservedOutputTokens:event.outputTokens,state:'reserved',providerId:profile.id,family:profile.family,model:profile.model,
              configurationDigest,instructionsVersion:'forge-context-v1',catalogVersion:'semantic-tools-v1',
              createdAt:now,settleBy:Math.min(now+120000,t.meta.prepDeadline),usage:null};
            s.attempts.push(a);
            if(!admitted(s)){s.attempts.pop();return refuse('storage-limit');}
            addCounter(s,'reservedOutputTokens',event.outputTokens);touch(s,now);tx.beforeCommit(()=>guard(tx,t));
            return {ok:true as const,id:a.id};
          });
          if(!reserved.ok)return deny(reserved.code);return reserved.id;
        },
        dispatch: async id=>{
          const dispatched=await transaction(binding,async(tx,s,now)=>{
            const t=s.turns.find(t=>t.meta.id===turnId),a=s.attempts.find(a=>a.id===id);
            if(!owns(s,t,g,fence,worker,now) || !a || a.state!=='reserved' || a.fence!==fence)return false;
            a.state='dispatched';t.meta.everDispatched=true;updateTurn(t.meta,now);touch(s,now);
            tx.beforeCommit(()=>guard(tx,t));return true;
          });
          if(!dispatched)deny('lease-lost');
        },
        receipt: async(id,usage)=>{
          await transaction(binding,async(tx,s,now)=>{
            const a=s.attempts.find(a=>a.id===id);
            if(!a || a.turnId!==turnId || a.fence!==fence || a.generation!==g || a.state!=='dispatched' || now>=a.settleBy)return;
            const clean=usage===null?null:{inputTokens:usage.inputTokens,outputTokens:usage.outputTokens,
              cacheReadInputTokens:usage.cacheReadInputTokens??0,cacheWriteInputTokens:usage.cacheWriteInputTokens??0};
            if(settle(s,a,clean)) {
              touch(s,now);
              if(a.generation!==s.header.generation) {
                await tx.query('DELETE FROM v2_agent_attempts WHERE id=? AND project_id=?',[a.id,binding.id]);
                s.attempts=s.attempts.filter(other=>other!==a);
              }
            }
          });
        },
        proposal: async canonical=>{plan=parsePlan(canonical);},
      });
      try {
        const {generation:_g,revision:_rev,requestKey:_key,...base}=claimed.input;
        const output=await runner.converse(binding,{...base,requestId:turnId,deadlineAt:claimed.meta.prepDeadline},options);
        return await transaction(binding,async(tx,s,now)=>{
          const t=s.turns.find(t=>t.meta.id===turnId);
          if(options.signal?.aborted)return cancelOutcome(tx,s,now);
          if(!owns(s,t,g,fence,worker,now))return refuse('lease-lost');
          const until=t.meta.lease!.until,deadline=t.meta.prepDeadline;
          tx.beforeCommit(async()=>{
            if(options.signal?.aborted)hostFailure('cancelled');
            if(await tx.now()>=Math.min(until,deadline))hostFailure('deadline');
          });
          if(tx.doc.revision!==t.meta.projectRevision){endTurn(t.meta,'refused','stale-project',now);touch(s,now);return result(tx,binding,s,t);}
          const reply=output.ok?output.summary.text:null;
          if(reply!==null && characters(reply)>L.replyChars){endTurn(t.meta,'refused','result-too-large',now);touch(s,now);return result(tx,binding,s,t);}
          if(options.signal?.aborted){endTurn(t.meta,'cancelled','cancelled',now);touch(s,now);return result(tx,binding,s,t);}
          if(!output.ok){endTurn(t.meta,'refused',hostCode??output.code,now);touch(s,now);return result(tx,binding,s,t);}
          t.body.reply=reply;
          if(output.outcome==='edit-proposal') {
            if(!plan)invalidRun();
            const canonical=parsePlan(plan),expiresAt=Math.min(now+900000,canonical.deadlineAt-120000);
            if(bytes(canonical)>L.planBytes || canonical.requestId!==turnId || canonical.deadlineAt!==t.meta.planDeadline || expiresAt<=now) {
              t.body.reply=null;endTurn(t.meta,'refused','proposal-unavailable',now);touch(s,now);return result(tx,binding,s,t);
            }
            const p:StoredProposal={meta:{version:1,id:crypto.randomUUID(),turnId,generation:g,revision:0,
              projectRevision:t.meta.projectRevision,digest:await planDigest(canonical),expiresAt,editCount:output.editCount,
              publishedAt:now,decision:null,decisionKey:null,decisionDigest:null,runId:null},plan:canonical};
            t.meta.proposalId=p.meta.id;t.meta.state='awaiting-decision';t.meta.lease=null;
            t.meta.reservedPrivateBytes=0;t.meta.reservedMetadataBytes=0;updateTurn(t.meta,now);s.proposals.push(p);
          } else endTurn(t.meta,'complete',null,now);
          if(!admitted(s))invalidRun();
          touch(s,now);
          return result(tx,binding,s,t);
        });
      } catch(error) {
        // A publication abort rolls back its visible result, then records the
        // matching turn's cancellation separately so recovery cannot retry it.
        if((error as {turnCode?:string})?.turnCode==='cancelled')
          return transaction(binding,cancelOutcome);
        throw error;
      } finally {clearInterval(timer);}
    },
  });
}
