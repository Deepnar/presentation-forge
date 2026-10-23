import type { Binding, RuntimeTransaction } from './runtime.ts';
import { inspectRun, load as loadRun } from './run-transaction.ts';
import { parsePlan, planDigest, invalidRun, type RunPlan } from './run-state.ts';
import { bytes, characters, TURN_LIMITS as L, parseHeader, parseTurn, parseProposal, parseAttempt, parseTurnSubmission,
  type TurnHeader, type TurnRecord, type TurnProposal, type TurnAttempt, type TurnSubmission } from './turn-state.ts';
export type TurnBody = { input: TurnSubmission; reply: string | null };
export type StoredTurn = { meta: TurnRecord; body: TurnBody };
export type StoredProposal = { meta: TurnProposal; plan: RunPlan | null };
export type State = { header: TurnHeader; turns: StoredTurn[]; proposals: StoredProposal[]; attempts: TurnAttempt[] };
export const unresolved = (a: TurnAttempt) => a.state === 'reserved' || a.state === 'dispatched';
export const activeTurn = (t: TurnRecord) => ['submitted','preparing','awaiting-decision'].includes(t.state);
export const refuse = (code: string) => ({ ok: false as const, code });
export function touch(s: State, now: number) {
  if (!Number.isSafeInteger(s.header.revision+1)) invalidRun();
  s.header.revision++; s.header.updatedAt = now;
}
export function updateTurn(t: TurnRecord, now: number) {
  if (!Number.isSafeInteger(t.revision+1)) invalidRun();
  t.revision++; t.updatedAt = now;
}
export function endTurn(t: TurnRecord, state: TurnRecord['state'], code: string | null, now: number) {
  t.state = state; t.code = code; t.lease = null; t.reservedPrivateBytes = 0; t.reservedMetadataBytes = 0;
  updateTurn(t, now);
}
export function addCounter(s: State, key: keyof TurnHeader['accounting'], value: number) {
  const n = s.header.accounting[key] + value;
  if (!Number.isSafeInteger(n) || n < 0) invalidRun();
  s.header.accounting[key] = n;
}
export function settle(s: State, a: TurnAttempt, usage: TurnAttempt['usage']) {
  if (!unresolved(a)) return false;
  if (a.state === 'reserved') { a.state = 'not-dispatched'; return true; }
  a.usage = usage;
  if (usage === null) { a.state = 'unknown'; addCounter(s,'unknownAttempts',1); }
  else {
    a.state = 'known'; addCounter(s,'knownAttempts',1);
    addCounter(s,'knownInputTokens',usage.inputTokens); addCounter(s,'knownOutputTokens',usage.outputTokens);
    addCounter(s,'knownCacheReadTokens',usage.cacheReadInputTokens); addCounter(s,'knownCacheWriteTokens',usage.cacheWriteInputTokens);
  }
  return true;
}
export function usage(s: State) {
  const privateBytes = s.turns.reduce((n,t)=>n+bytes(t.body)+t.meta.reservedPrivateBytes,0) +
    s.proposals.reduce((n,p)=>n+bytes(p.plan),0);
  const metadataBytes = bytes(s.header) + s.turns.reduce((n,t)=>n+bytes(t.meta)+t.meta.reservedMetadataBytes,0) +
    s.proposals.reduce((n,p)=>n+bytes(p.meta),0) + s.attempts.reduce((n,a)=>n+bytes(a),0);
  return { privateBytes, metadataBytes };
}
export function admitted(s: State) {
  const u = usage(s), generation = s.header.generation;
  return u.privateBytes <= L.privateBytes && u.metadataBytes <= L.metadataBytes && s.turns.length <= L.turns &&
    s.proposals.length <= L.proposals && s.attempts.filter(a=>a.generation===generation).length<=L.attempts &&
    s.attempts.filter(unresolved).length<=L.settlements;
}
function json(text: unknown, limit: number): unknown {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > limit) invalidRun();
  try { return JSON.parse(text); } catch { return invalidRun(); }
}
export async function loadState(tx: RuntimeTransaction, binding: Binding): Promise<State> {
  const rows = await tx.query('SELECT payload FROM v2_agent_conversations WHERE project_id=?',[binding.id]);
  let header: TurnHeader;
  if (rows.length) header = parseHeader(json(rows[0].payload,L.headerBytes));
  else {
    const now = await tx.now();
    header = { version: 1, generation: crypto.randomUUID(), revision: 0, createdAt: now, updatedAt: now,
      accounting: { reservedOutputTokens:0, knownInputTokens:0, knownOutputTokens:0, knownCacheReadTokens:0,
        knownCacheWriteTokens:0, knownAttempts:0, unknownAttempts:0 } };
    await tx.query('INSERT INTO v2_agent_conversations (project_id,payload) VALUES (?,?)',[binding.id,JSON.stringify(header)]);
  }
  // LIMIT detects corrupt/excess rows without materializing an unbounded export.
  const turns = await tx.query('SELECT id,generation,request_key,payload,private_payload FROM v2_agent_turns WHERE project_id=? ORDER BY id LIMIT 129',[binding.id]);
  const proposals = await tx.query('SELECT id,turn_id,payload,private_payload FROM v2_agent_proposals WHERE project_id=? ORDER BY id LIMIT 129',[binding.id]);
  const attempts = await tx.query('SELECT id,payload FROM v2_agent_attempts WHERE project_id=? ORDER BY id LIMIT 1153',[binding.id]);
  if (turns.length>L.turns || proposals.length>L.proposals || attempts.length>L.attempts+L.settlements) invalidRun();
  const s: State = { header, turns:[], proposals:[], attempts:[] };
  for (const row of turns) {
    const meta = parseTurn(json(row.payload,L.recordBytes));
    const raw = json(row.private_payload,L.turnBodyBytes) as TurnBody;
    if (!raw || Object.keys(raw).sort().join(',')!=='input,reply' || raw.reply !== null &&
        (typeof raw.reply!=='string' || characters(raw.reply)>L.replyChars)) invalidRun();
    const input = parseTurnSubmission(raw.input);
    if (row.id!==meta.id || row.generation!==meta.generation || row.request_key!==meta.requestKey ||
        meta.generation!==header.generation || input.generation!==meta.generation || input.requestKey!==meta.requestKey ||
        input.projectRevision!==meta.projectRevision) invalidRun();
    const { generation:_g,revision:_r,...identity } = input;
    const { identityDigest } = await import('./turn-state.ts');
    if (await identityDigest(identity)!==meta.identity) invalidRun();
    s.turns.push({meta,body:{input,reply:raw.reply}});
  }
  for (const row of proposals) {
    const meta = parseProposal(json(row.payload,L.recordBytes));
    const raw = json(row.private_payload,L.planBytes);
    const plan = raw===null ? null : parsePlan(raw);
    const t = s.turns.find(t=>t.meta.id===meta.turnId);
    if (!t || row.id!==meta.id || row.turn_id!==meta.turnId || t.meta.proposalId!==meta.id ||
        meta.generation!==header.generation || meta.projectRevision!==t.meta.projectRevision ||
        meta.runId!==t.meta.runId || meta.expiresAt!==Math.min(meta.publishedAt+900000,t.meta.planDeadline-120000) || plan && (await planDigest(plan)!==meta.digest || plan.requestId!==t.meta.id ||
          plan.projectRevision!==meta.projectRevision || plan.deadlineAt!==t.meta.planDeadline ||
          JSON.stringify(plan.scope)!==JSON.stringify(t.body.input.scope)) ||
        (t.meta.state==='awaiting-decision') !== (plan!==null)) invalidRun();
    const canonical=plan ?? (meta.runId ? (await loadRun(tx,binding,meta.runId)).plan : null);
    if(canonical && (await planDigest(canonical)!==meta.digest || canonical.requestId!==t.meta.id ||
      canonical.projectRevision!==meta.projectRevision || canonical.deadlineAt!==t.meta.planDeadline ||
      canonical.steps.length!==1 || canonical.steps[0].tool!=='edit_content' ||
      canonical.steps[0].args.edits.length!==meta.editCount))invalidRun();
    s.proposals.push({meta,plan});
  }
  if (s.turns.some(t=>t.meta.proposalId && !s.proposals.some(p=>p.meta.id===t.meta.proposalId))) invalidRun();
  for (const row of attempts) {
    const a = parseAttempt(json(row.payload,L.attemptBytes));
    const t = s.turns.find(t=>t.meta.id===a.turnId);
    if (row.id!==a.id || a.generation!==header.generation && !unresolved(a) ||
        a.generation===header.generation && (!t || a.fence>t.meta.fence || a.settleBy>t.meta.prepDeadline)) invalidRun();
    s.attempts.push(a);
  }
  for(const t of s.turns) {
    const attempts=s.attempts.filter(a=>a.turnId===t.meta.id);
    if(attempts.length>t.body.input.limits.maxExchanges ||
      attempts.reduce((n,a)=>n+a.reservedOutputTokens,0)>t.body.input.limits.maxOutputTokensTotal ||
      attempts.some(a=>a.fence<1 || ['dispatched','known','unknown'].includes(a.state) && !t.meta.everDispatched))invalidRun();
    for(const fence of new Set(attempts.map(a=>a.fence))) {
      const steps=attempts.filter(a=>a.fence===fence).map(a=>a.step).sort((a,b)=>a-b);
      if(steps.some((step,i)=>step!==i))invalidRun();
    }
  }
  if(s.header.accounting.reservedOutputTokens<s.attempts.reduce((n,a)=>n+a.reservedOutputTokens,0) ||
    s.header.accounting.knownAttempts<s.attempts.filter(a=>a.state==='known').length ||
    s.header.accounting.unknownAttempts<s.attempts.filter(a=>a.state==='unknown').length)invalidRun();
  if (s.turns.filter(t=>activeTurn(t.meta)).length>1 || !admitted(s)) invalidRun();
  return s;
}
export async function saveState(tx: RuntimeTransaction, binding: Binding, s: State) {
  if (!admitted(s)) invalidRun();
  parseHeader(s.header);
  await tx.query('UPDATE v2_agent_conversations SET payload=? WHERE project_id=?',[JSON.stringify(s.header),binding.id]);
  for (const t of s.turns) {
    parseTurn(t.meta);
    if(bytes(t.body)>L.turnBodyBytes)invalidRun();
    await tx.query('INSERT INTO v2_agent_turns (id,project_id,generation,request_key,payload,private_payload) VALUES (?,?,?,?,?,?) ON CONFLICT (id) DO UPDATE SET payload=excluded.payload,private_payload=excluded.private_payload',
      [t.meta.id,binding.id,t.meta.generation,t.meta.requestKey,JSON.stringify(t.meta),JSON.stringify(t.body)]);
  }
  for (const p of s.proposals) {
    parseProposal(p.meta);
    await tx.query('INSERT INTO v2_agent_proposals (id,project_id,turn_id,payload,private_payload) VALUES (?,?,?,?,?) ON CONFLICT (id) DO UPDATE SET payload=excluded.payload,private_payload=excluded.private_payload',
      [p.meta.id,binding.id,p.meta.turnId,JSON.stringify(p.meta),JSON.stringify(p.plan)]);
  }
  for (const a of s.attempts) {
    parseAttempt(a);
    await tx.query('INSERT INTO v2_agent_attempts (id,project_id,payload) VALUES (?,?,?) ON CONFLICT (id) DO UPDATE SET payload=excluded.payload',
      [a.id,binding.id,JSON.stringify(a)]);
  }
}
export async function reconcile(tx: RuntimeTransaction, binding: Binding, s: State, now: number) {
  let changed = false;
  for (const a of s.attempts) {
    if (unresolved(a) && now>=a.settleBy) { settle(s,a,null); changed=true; }
  }
  const compact = s.attempts.filter(a=>a.generation!==s.header.generation && !unresolved(a));
  for (const a of compact) await tx.query('DELETE FROM v2_agent_attempts WHERE id=? AND project_id=?',[a.id,binding.id]);
  s.attempts = s.attempts.filter(a=>!compact.includes(a));
  for (const t of s.turns) {
    const m=t.meta;
    if ((m.state==='submitted' || m.state==='preparing') && now>=m.prepDeadline) {
      endTurn(m,m.everDispatched?'needs-user-action':'expired',m.everDispatched?'continuation-lost':'deadline',now); changed=true;
    } else if (m.state==='preparing' && m.lease!.until<=now) {
      for(const a of s.attempts)if(a.turnId===m.id && a.state==='reserved')settle(s,a,null);
      m.lease=null; m.state=m.everDispatched?'needs-user-action':'submitted';
      if(m.everDispatched) endTurn(m,'needs-user-action','continuation-lost',now); else updateTurn(m,now);
      changed=true;
    }
    const p=s.proposals.find(p=>p.meta.id===m.proposalId);
    if (m.state==='awaiting-decision' && p && now>=p.meta.expiresAt) {
      p.plan=null; p.meta.revision++; endTurn(m,'expired','approval-expired',now); changed=true;
    }
  }
  if (changed) touch(s,now);
}
export async function turnView(tx: RuntimeTransaction, binding: Binding, s: State, t: StoredTurn) {
  const p=s.proposals.find(p=>p.meta.id===t.meta.proposalId);
  const run=t.meta.runId ? await inspectRun(tx,binding,t.meta.runId) : null;
  return { id:t.meta.id, revision:t.meta.revision, projectRevision:t.meta.projectRevision, state:t.meta.state,
    code:t.meta.code, request:t.body.input.request, reply:t.body.reply, createdAt:t.meta.createdAt, updatedAt:t.meta.updatedAt,
    proposal:p ? {...p.meta, edits:p.plan?.steps.flatMap(step=>step.tool==='edit_content'?step.args.edits:[]) ?? []} : null, run };
}
