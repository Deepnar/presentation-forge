import { useEffect, useRef, useState } from 'react';
import { createAssistantApi } from '../lib/v2assistant.js';
import { createAssistantController } from '../lib/assistantController.js';
import { projectSessionKey } from '../lib/v2project.js';
import { ConfirmModal } from './ui.jsx';
const button = 'rounded border border-line px-2 py-1 text-[12px] hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40';
const active = turn => ['submitted', 'preparing'].includes(turn.state) || turn.state === 'approved' && ['queued', 'running'].includes(turn.run?.status);
const messages = {
  'session-changed': 'Your session changed. Reopen this project after signing in.',
  'pending-data': 'Apply or cancel the chart/table draft in Inspector first.',
  'pending-title': 'Finish or cancel the project title edit first.',
  'save-blocked': 'The presentation could not be saved. Your message and edits are kept.',
  'stale-project': 'The saved presentation changed. Reject this outdated proposal and send a fresh request; it cannot be rebound.',
  'stale-conversation': 'The conversation changed. Review its saved status before trying again.',
  'stale-generation': 'The chat was cleared or replaced. Refresh saved status.',
  'read-only': 'Open the presentation in edit mode to send or approve changes.',
  'scope-limit': 'The scope is too large. Select at most 32 objects, with at most 256 editable targets.',
  'invalid-scope': 'The selected slide or objects changed. Review the scope and try again.',
  'invalid-message': 'Enter a message of at most 16,000 characters.',
  'host-disabled': 'Assistant processing is disabled on this host. The message may already be saved.',
  'host-busy': 'The host is busy. Retry processing this saved request later.',
  'wake-cooldown': 'Processing is cooling down. Retry this saved request shortly.',
  'wake-capacity': 'Host capacity is full. Retry this saved request later.',
};
function status(turn) { return turn.state === 'approved' ? `Approved · ${turn.run?.status ?? 'pending'}${turn.run?.code ? ` · ${turn.run.code}` : ''}` : turn.state.replaceAll('-', ' '); }
function ProposedContent({ edit }) {
  if (edit.kind === 'text') return <p className="whitespace-pre-wrap">{edit.text}</p>;
  const rows = edit.kind === 'chart' ? (edit.categories ?? []).map((category, index) =>
    [category, ...(edit.series ?? []).map(series => series.values[index])]) : edit.rows ?? [];
  return <div className="max-h-44 max-w-full overflow-auto"><table className="border-collapse text-left text-[11.5px]">
    {edit.kind === 'chart' && <thead><tr>{['Category', ...(edit.series ?? []).map(series => series.name)].map((label, i) => <th key={i} className="border border-line px-1.5 py-1">{label}</th>)}</tr></thead>}
    <tbody>{rows.map((row, i) => <tr key={i}>{row.map((value, j) => <td key={j} className="border border-line px-1.5 py-1">{String(value)}</td>)}</tr>)}</tbody>
  </table></div>;
}
export default function AssistantPanel({ projectId, active: shown, writable, blockReason, intent, preview, bridge, register, onInspector, onHistory }) {
  const [state, setState] = useState(null), [scope, setScope] = useState('slide'), [confirmClear, setConfirmClear] = useState(false);
  const [newMessages, setNewMessages] = useState(false);
  const controller = useRef(null), timeline = useRef(null), nearBottom = useRef(true), composer = useRef(null);
  const latest = useRef({ bridge, intent, scope, writable }); latest.current = { bridge, intent, scope, writable, shown };
  useEffect(() => {
    const token = projectSessionKey();
    const api = createAssistantApi({ projectId, token });
    const c = createAssistantController({ api,
      bridge: { settle: options => latest.current.bridge.settle(options), syncSaved: options => latest.current.bridge.syncSaved(options) },
      onChange: setState });
    controller.current = c;
    const unregister = register(c);
    void c.start();
    const session = () => { c.checkSession(); };
    const visibility = () => c.setVisible(!document.hidden && latest.current.shown);
    const interval = setInterval(session, 1000);
    window.addEventListener('storage', session); window.addEventListener('focus', session);
    document.addEventListener('visibilitychange', visibility);
    return () => { unregister(); c.dispose(); controller.current = null; clearInterval(interval);
      window.removeEventListener('storage', session); window.removeEventListener('focus', session); document.removeEventListener('visibilitychange', visibility); };
  }, [projectId, register]);
  useEffect(() => { controller.current?.setVisible(shown && !document.hidden); }, [shown]);
  const turns = [...(state?.older ?? []), ...(state?.page?.turns ?? [])];
  const last = turns.at(-1), signature = `${last?.id ?? ''}:${last?.state ?? ''}:${last?.reply ?? ''}:${last?.run?.status ?? ''}`;
  useEffect(() => {
    const node = timeline.current;
    if (node && nearBottom.current) { node.scrollTop = node.scrollHeight; setNewMessages(false); }
    else if (node) setNewMessages(true);
  }, [signature]);
  if (!state) return null;
  const sessionMissing = !projectSessionKey();
  const scopeInfo = preview(scope);
  const blocked = !writable || !state.available || state.status !== 'ready' || Boolean(state.busy) || Boolean(blockReason) || Boolean(scopeInfo.error);
  async function send(event) {
    event?.preventDefault(); if (blocked) return;
    await controller.current?.send({ ...intent(), scopeMode: scope });
  }
  async function download() {
    const value = await controller.current?.export(); if (!value) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `${projectId}.conversation.json`; a.click(); URL.revokeObjectURL(url);
  }
  return (
    <div data-assistant-panel className="flex h-full min-h-0 flex-col gap-2 text-[12.5px]" onKeyDown={event => {
      if (event.key !== 'Escape') event.stopPropagation();
    }}>
      <div className="flex flex-none flex-wrap items-center justify-between gap-1">
        <strong>Assistant</strong>
        <div className="flex gap-1">
          <button className={button} disabled={!state.page || Boolean(state.busy)} onClick={download}>Export chat</button>
          <button className={button} disabled={!state.page || Boolean(state.busy)} onClick={() => setConfirmClear({ generation: state.page.generation, revision: state.page.revision })}>Clear chat</button>
        </div>
      </div>
      <p role="status" aria-live="polite" data-assistant-status className="flex-none text-fg-muted">
        {sessionMissing ? 'Sign in to use Assistant.' : state.status === 'expired' ? messages['session-changed'] : state.status === 'loading' ? 'Loading saved conversation…' : !state.available ? 'Assistant processing is disabled on this host. Saved conversation remains available.' : state.busy === 'wake' ? 'Request saved · requesting processing…' : state.busy ? 'Saving request…' : state.notice ?? 'Edits require your approval.'}
      </p>
      {state.error && <div role="alert" data-assistant-error className="flex-none break-words text-danger">
        {messages[state.error] ?? `Assistant request could not finish (${state.error}). Saved state is authoritative.`}
        <div className="mt-1 flex flex-wrap gap-1">
          <button className={button} onClick={() => controller.current?.refresh()}>Refresh status</button>
          {state.error === 'pending-data' && <button className={button} onClick={onInspector}>Open Inspector</button>}
        </div>
      </div>}
      {state.pendingSaved && <div role="status" className="flex-none rounded border border-line p-2">
        Assistant changes are saved. Your current edits are kept.
        <button className={button + ' mt-1'} onClick={() => controller.current?.reloadSaved()}>Load saved changes</button>
      </div>}
      <div ref={timeline} data-assistant-timeline aria-label="Saved conversation" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto break-words rounded border border-line p-2" onScroll={event => {
        const n = event.currentTarget; nearBottom.current = n.scrollHeight - n.scrollTop - n.clientHeight < 48;
        if (nearBottom.current) setNewMessages(false);
      }}>
        {state.offset > 0 && <button className={button} onClick={() => controller.current?.older()}>Load older messages</button>}
        {!turns.length && <p className="text-fg-muted">Ask a question or describe a change to this slide.</p>}
        {turns.map(turn => <article key={turn.id} data-assistant-turn={turn.id} className="mb-3 border-b border-line pb-2 last:mb-0 last:border-0">
          <strong>You</strong><p className="whitespace-pre-wrap">{turn.request}</p>
          {turn.reply && <><strong className="mt-2 block">Assistant</strong><p className="whitespace-pre-wrap">{turn.reply}</p></>}
          <p className="mt-1 text-fg-muted" data-turn-status={turn.state}>{status(turn)}{turn.code ? ` · ${turn.code}` : ''}</p>
          {turn.proposal && <details open={turn.state === 'awaiting-decision'} className="mt-2">
            <summary>Proposed changes</summary>
            <ul className="mt-1 space-y-2">{(turn.proposal.edits ?? []).map((edit, index) => <li key={index}>
              <span className="font-semibold">{bridge.describe(edit)}</span>
              <ProposedContent edit={edit} />
            </li>)}</ul>
            {turn.state === 'awaiting-decision' && <div className="mt-2">
              <p className="mb-1 text-[11.5px] text-fg-muted">Loading saved AI changes clears session undo. Restore earlier content through Version history.</p>
              <div className="flex gap-1">
                <button className={button} disabled={blocked} onClick={() => controller.current?.decide(turn, 'approve', { generation: state.page.generation, revision: state.page.revision })}>Approve</button>
                <button className={button} disabled={Boolean(state.busy)} onClick={() => controller.current?.decide(turn, 'reject', { generation: state.page.generation, revision: state.page.revision })}>Reject</button>
              </div>
            </div>}
          </details>}
          {active(turn) && <div className="mt-2 flex flex-wrap gap-1">
            <button className={button} disabled={Boolean(state.busy) && state.busy !== 'wake'} onClick={() => controller.current?.cancel(turn)}>Cancel processing</button>
            {!state.busy && (state.error || state.notice?.startsWith('Observation paused')) && <button className={button} disabled={!state.available || !writable} onClick={() => controller.current?.retry(turn)}>Retry processing</button>}
          </div>}
          {turn.run?.status === 'succeeded' && <button className={button + ' mt-1'} onClick={onHistory}>Version history</button>}
        </article>)}
      </div>
      {newMessages && <button className={button} onClick={() => { nearBottom.current = true; timeline.current.scrollTop = timeline.current.scrollHeight; setNewMessages(false); }}>New saved messages ↓</button>}
      <form className="flex flex-none flex-col gap-2" onSubmit={send}>
        <label>Scope
          <select aria-label="Assistant scope" value={scope} disabled={Boolean(state.busy)} onChange={event => setScope(event.target.value)} className="ml-2 max-w-full rounded border border-line bg-field px-1 py-1">
            <option value="slide">Current slide</option><option value="selection">Selected objects</option>
          </select>
        </label>
        <p className="text-[11.5px] text-fg-muted">{scope === 'selection' ? 'Edits target selected objects; semantic reads may include the current saved slide.' : 'Uses the current saved slide.'} Earlier chat is saved for reference and is not automatically sent.</p>
        {(blockReason || scopeInfo.error) && <p role="status" className="text-amber">{messages[blockReason ?? scopeInfo.error] ?? 'Review the saved scope before sending.'} {blockReason === 'pending-data' && <button type="button" className={button} onClick={onInspector}>Open Inspector</button>}</p>}
        {!scopeInfo.error && scopeInfo.mode === 'inspect' && <p className="text-fg-muted">No editable content in this scope — questions only.</p>}
        <label htmlFor={`assistant-message-${projectId}`}>Message</label>
        <textarea id={`assistant-message-${projectId}`} ref={composer} value={state.draft} disabled={Boolean(state.busy) || state.status === 'expired'} rows={3}
          className="min-h-20 w-full resize-y rounded border border-line bg-field p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          onChange={event => controller.current?.setDraft(event.target.value)} onKeyDown={event => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing && !event.isComposing) { event.preventDefault(); void send(); }
          }} />
        {!writable && <p className="text-fg-muted">Read-only — open edit mode to send or approve.</p>}
        <button type="submit" className={button} disabled={blocked || !state.draft.trim()}>Send</button>
      </form>
      {confirmClear && <ConfirmModal title="Clear saved chat?" body="Saved messages and proposals will be removed and pending work cancelled. The presentation and version history stay intact." confirmLabel="Clear chat" danger
        onCancel={() => setConfirmClear(false)} onConfirm={async () => { setConfirmClear(false); await controller.current?.clear(confirmClear); }} />}
    </div>
  );
}
