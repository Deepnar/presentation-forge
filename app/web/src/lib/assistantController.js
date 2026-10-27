import { assistantFailure, assistantSubmission } from './v2assistant.js';
const active = turn => ['submitted', 'preparing'].includes(turn.state) ||
  turn.state === 'approved' && ['queued', 'running'].includes(turn.run?.status);
const pollable = page => page?.turns.some(active);
const validPage = page => page && typeof page.generation === 'string' && Number.isSafeInteger(page.revision) &&
  Number.isSafeInteger(page.total) && page.total >= 0 && page.total <= 128 && Array.isArray(page.turns) && page.turns.length <= 20;

// UI lifetime owns reads and hints, never durable turn execution or approval.
export function createAssistantController({ api, bridge, onChange, now = () => performance.now(),
  timer = setTimeout, untimer = clearTimeout, uuid = () => crypto.randomUUID() }) {
  let state = { status: 'loading', available: false, page: null, older: [], offset: 0,
    busy: null, draft: '', error: null, notice: null, pendingSaved: false };
  let disposed = false, fenced = false, visible = true, action = 0, readEpoch = 0, readAbort, mutationAbort, wakeAbort;
  let pollTimer, retryTimer, retryResolve, pollStart = null, readFailures = 0, reading = null;
  let pendingSubmit = null, pendingDecision = null;
  const observed = new Set();
  const current = () => { if (disposed || fenced) return false; try { api.check(); return true; } catch { expire(); return false; } };
  function publish(patch) { if (disposed) return; state = { ...state, ...patch }; onChange(state); }
  function stopTimers() { untimer(pollTimer); untimer(retryTimer); pollTimer = retryTimer = null; retryResolve?.(); retryResolve = null; }
  function expire() {
    fenced = true; stopTimers(); readAbort?.abort(); mutationAbort?.abort(); wakeAbort?.abort(); action++; readEpoch++;
    pendingSubmit = pendingDecision = null; observed.clear();
    publish({ status: 'expired', page: null, older: [], available: false, draft: '', busy: null, error: 'session-changed', pendingSaved: false });
  }
  function problem(error) {
    if (!current()) return;
    if (['session-changed', 'unauthorized', 'owner-ineligible', 'not-found'].includes(error?.code) || [401, 403, 404].includes(error?.status)) { expire(); return; }
    publish({ error: error?.code ?? 'network-error' });
  }
  function planPoll() {
    untimer(pollTimer); pollTimer = null;
    if (!current() || !visible || !pollable(state.page)) return;
    if (pollStart === null) pollStart = now();
    const elapsed = now() - pollStart;
    if (elapsed >= 130000 || readFailures >= 3) { publish({ notice: 'Observation paused. Refresh saved status or retry processing explicitly.' }); return; }
    pollTimer = timer(() => { pollTimer = null; void refresh(); }, elapsed < 20000 ? 2000 : 5000);
  }
  function page(value) { if (!validPage(value)) throw assistantFailure('invalid-response'); return value; }
  async function syncSaved(turn, requested = false) {
    if (!current()) return;
    try {
      const result = await bridge.syncSaved({ turn, requested, token: api.token, current });
      if (current()) publish({ pendingSaved: result?.deferred === true,
        ...(result?.loaded ? { notice: 'Saved Assistant changes loaded. Session undo was cleared; use Version history to restore.' } : {}) });
    } catch (error) { problem(error); }
  }
  async function refresh({ reset = false } = {}) {
    if (!current() || reading) return reading;
    if (reset) { pollStart = now(); readFailures = 0; }
    const epoch = ++readEpoch; readAbort = new AbortController();
    const task = (async () => {
      try {
        let value = page(await api.read(0, readAbort.signal)), offset = Math.max(0, value.total - 20);
        if (offset) {
          const tail = page(await api.read(offset, readAbort.signal));
          if (value.generation !== tail.generation || value.total !== tail.total) throw assistantFailure('stale-conversation');
          value = tail;
        }
        if (!current() || epoch !== readEpoch) return;
        readFailures = 0;
        const sameGeneration = state.page?.generation === value.generation;
        const visible = new Set(value.turns.map(t => t.id));
        publish({ status: 'ready', page: value, offset: sameGeneration ? Math.min(state.offset, offset) : offset,
          older: sameGeneration ? state.older.filter(t => !visible.has(t.id)) : [] });
        const completed = value.turns.filter(t => t.run?.status === 'succeeded').at(-1);
        if (completed && !observed.has(completed.run.id)) { observed.add(completed.run.id); await syncSaved(completed); }
      } catch (error) { if (current() && epoch === readEpoch && error?.name !== 'AbortError') { readFailures++; problem(error); } }
      finally { if (epoch === readEpoch) { reading = null; planPoll(); } }
    })();
    reading = task; await task; if (reading === task) reading = null;
  }
  async function latest(signal) {
    const value = page(await api.read(0, signal)); if (!current()) throw assistantFailure('session-changed'); return value;
  }
  function begin(kind, supersede = false) {
    if (!current() || state.busy && !(supersede && state.busy === 'wake')) return null;
    if (supersede) { wakeAbort?.abort(); untimer(retryTimer); retryResolve?.(); retryResolve = null; }
    readEpoch++; readAbort?.abort(); reading = null; untimer(pollTimer);
    mutationAbort = new AbortController(); const epoch = ++action;
    publish({ busy: kind, error: null, notice: null }); return { epoch, signal: mutationAbort.signal, check: () => current() && action === epoch };
  }
  async function finish(ctx) { if (!ctx?.check()) return; publish({ busy: null }); await refresh({ reset: true }); }
  async function wake(lookup, ctx) {
    if (!ctx.check()) return;
    publish({ busy: 'wake' }); wakeAbort = new AbortController();
    for (let attempt = 0; attempt < 2 && ctx.check(); attempt++) {
      try {
        await api.wake(lookup, wakeAbort.signal);
        if (ctx.check()) publish({ notice: 'Processing requested. Saved status confirms the outcome.' });
        return;
      } catch (error) {
        if (!ctx.check()) return;
        if (attempt === 0 && ['wake-cooldown', 'host-busy', 'wake-capacity'].includes(error.code) && error.retryAfter) {
          await new Promise(resolve => { retryResolve = resolve; retryTimer = timer(resolve, error.retryAfter * 1000); });
          retryResolve = null; retryTimer = null; continue;
        }
        throw error;
      }
    }
  }
  const controller = {
    snapshot: () => state,
    checkSession: current,
    setDraft: draft => { if (current() && !state.busy) publish({ draft }); },
    hasDraft: () => Boolean(state.draft.trim()),
    discardDraft: () => { pendingSubmit = null; if (current()) publish({ draft: '' }); },
    async start() {
      if (!current()) return;
      try { const result = await api.availability(); if (!current()) return; publish({ available: result.enabled === true }); await refresh({ reset: true }); }
      catch (error) { problem(error); if (current()) publish({ status: 'error' }); }
    },
    refresh: () => refresh({ reset: true }),
    setVisible(value) { visible = value; untimer(pollTimer); if (!visible) { readAbort?.abort(); readEpoch++; reading = null; } else if (current()) void refresh({ reset: true }); },
    async older() {
      if (!current() || !state.page || !state.offset || state.busy || reading) return;
      const generation = state.page.generation, revision = state.page.revision, offset = Math.max(0, state.offset - 20), epoch = ++readEpoch;
      readAbort = new AbortController(); untimer(pollTimer);
      const task = (async () => {
        try {
          const value = page(await api.read(offset, readAbort.signal));
          if (!current() || epoch !== readEpoch) return;
          if (value.generation !== generation || value.revision !== revision) { publish({ notice: 'Conversation changed; refresh saved status.' }); return; }
          const existing = new Set([...state.older, ...state.page.turns].map(t => t.id));
          publish({ older: [...value.turns.filter(t => !existing.has(t.id)), ...state.older], offset });
        } catch (error) { if (epoch === readEpoch && error?.name !== 'AbortError') problem(error); }
        finally { if (epoch === readEpoch) { reading = null; planPoll(); } }
      })();
      reading = task; await task; if (reading === task) reading = null;
    },
    async send(intent) {
      if (!state.available) return;
      const ctx = begin('send'); if (!ctx) return;
      const request = state.draft;
      try {
        if (!pendingSubmit || pendingSubmit.request !== request) {
          const snapshot = await bridge.settle({ ...structuredClone(intent), token: api.token, current: ctx.check });
          if (!ctx.check()) return;
          const conversation = await latest(ctx.signal); if (!ctx.check()) return;
          pendingSubmit = assistantSubmission(snapshot, conversation, request, uuid());
        }
        const body = pendingSubmit;
        const submitted = await api.submit(body, ctx.signal); if (!ctx.check()) return;
        if (!submitted.turn?.id || submitted.generation !== body.generation) throw assistantFailure('invalid-response');
        pendingSubmit = null; publish({ draft: '', page: { ...state.page, generation: submitted.generation,
          revision: submitted.revision, turns: [...(state.page?.turns ?? []).filter(t => t.id !== submitted.turn.id), submitted.turn].slice(-20), total: Math.max(state.page?.total ?? 0, (state.page?.total ?? 0) + (state.page?.turns.some(t => t.id === submitted.turn.id) ? 0 : 1)) } });
        await wake({ generation: submitted.generation, turnId: submitted.turn.id }, ctx);
      } catch (error) { if (ctx.check()) { if (error.status >= 400 && error.status < 500) pendingSubmit = null; problem(error); } }
      finally { await finish(ctx); }
    },
    async decide(turn, decision, stamp) {
      if (decision === 'approve' && !state.available) return;
      if (!turn?.proposal || !state.page || !['approve', 'reject'].includes(decision)) return;
      if (stamp && (stamp.generation !== state.page.generation || stamp.revision !== state.page.revision)) { problem(assistantFailure('stale-conversation')); return; }
      const ctx = begin('decide'); if (!ctx) return;
      const captured = { generation: state.page.generation, revision: state.page.revision,
        proposalId: turn.proposal.id, proposalRevision: turn.proposal.revision, projectRevision: turn.projectRevision,
        decision, decisionKey: uuid() };
      try {
        if (decision === 'approve') {
          const snapshot = await bridge.settle({ proposalRevision: turn.projectRevision, token: api.token, current: ctx.check });
          if (!ctx.check()) return;
          if (snapshot.revision !== turn.projectRevision) throw assistantFailure('stale-project');
        }
        if (pendingDecision && pendingDecision.proposalId === captured.proposalId && pendingDecision.decision === decision) Object.assign(captured, pendingDecision);
        pendingDecision = captured;
        const result = await api.decide(captured, ctx.signal); if (!ctx.check()) return; pendingDecision = null;
        if (decision === 'approve') await wake({ generation: result.generation, turnId: turn.id }, ctx);
      } catch (error) { if (ctx.check()) problem(error); }
      finally { await finish(ctx); }
    },
    async cancel(turn) {
      const ctx = begin('cancel', true); if (!ctx) return;
      const generation = state.page?.generation;
      try {
        const value = await latest(ctx.signal); if (!ctx.check()) return;
        if (value.generation !== generation) throw assistantFailure('stale-generation');
        await api.cancel({ generation: value.generation, revision: value.revision, turnId: turn.id }, ctx.signal);
      } catch (error) { if (ctx.check()) problem(error); }
      finally { await finish(ctx); }
    },
    async clear(stamp) {
      const ctx = begin('clear'); if (!ctx || !state.page) return;
      const body = stamp ? { ...stamp } : { generation: state.page.generation, revision: state.page.revision };
      try { await api.clear(body, ctx.signal); if (ctx.check()) { observed.clear(); pendingSubmit = pendingDecision = null; publish({ older: [], pendingSaved: false }); } }
      catch (error) { if (ctx.check()) problem(error); }
      finally { await finish(ctx); }
    },
    async retry(turn) {
      if (!state.available) return;
      const ctx = begin('wake'); if (!ctx || !state.page) return;
      const generation = state.page.generation;
      try {
        await bridge.settle({ proposalRevision: turn.state === 'approved' ? turn.projectRevision : undefined, token: api.token, current: ctx.check });
        await wake({ generation, turnId: turn.id }, ctx);
      } catch (error) { if (ctx.check()) problem(error); }
      finally { await finish(ctx); }
    },
    reloadSaved: () => syncSaved(null, true),
    async export() { if (!current()) return null; try { const value = await api.export(); return current() ? value : null; } catch (error) { problem(error); return null; } },
    dispose() { disposed = true; action++; readEpoch++; stopTimers(); readAbort?.abort(); mutationAbort?.abort(); wakeAbort?.abort(); pendingSubmit = pendingDecision = null; observed.clear(); },
  };
  onChange(state); return Object.freeze(controller);
}
