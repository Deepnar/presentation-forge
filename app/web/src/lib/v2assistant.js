import { projectSessionKey } from './v2project.js';

export const assistantFailure = (code, status = 0, retryAfter = null) =>
  Object.assign(new Error(code), { code, status, retryAfter });
export function assistantScope(scenes, slideId, selectedIds, mode = 'slide') {
  const slide = scenes.find(s => s.id === slideId);
  if (!slide || !['slide', 'selection'].includes(mode)) throw assistantFailure('invalid-scope');
  const selected = [...new Set(selectedIds)];
  if (selected.length > 32 || mode === 'selection' && !selected.length) throw assistantFailure('scope-limit');
  const flat = [];
  function visit(elements, protectedParent = false) {
    for (const element of elements) {
      const protectedHere = protectedParent || element.locked === true || element.hidden === true;
      flat.push({ element, protectedHere }); visit(element.group?.children ?? [], protectedHere);
    }
  }
  visit(slide.elements);
  if (selected.some(id => !flat.some(r => r.element.id === id))) throw assistantFailure('invalid-scope');
  const editableTargets = flat.filter(({ element, protectedHere }) => !protectedHere &&
    ['text', 'chart', 'table'].includes(element.kind) && (mode === 'slide' || selected.includes(element.id)))
    .map(({ element }) => ({ slideId, elementId: element.id }));
  if (editableTargets.length > 256) throw assistantFailure('scope-limit');
  return { mode: editableTargets.length ? 'edit' : 'inspect', readableSlides: [slideId], editableTargets,
    selection: selected.map(elementId => ({ slideId, elementId })) };
}
export function assistantSubmission(snapshot, conversation, request, requestKey) {
  if (!request.trim() || [...request].length > 16000) throw assistantFailure('invalid-message');
  return { generation: conversation.generation, revision: conversation.revision, requestKey,
    projectRevision: snapshot.revision, scope: snapshot.scope, request,
    reads: snapshot.scopeMode === 'selection' ? [{ tool: 'get_selected_elements', args: {} }] :
      [{ tool: 'get_slide', args: { slideId: snapshot.slideId, offset: 0, limit: 20 } }],
    contextChars: 48000, maxOutputTokens: 2048,
    limits: { maxExchanges: 4, maxToolCalls: 16, maxOutputTokensTotal: 8192 } };
}
export function createAssistantApi({ projectId, token, current = projectSessionKey, fetchFn = fetch }) {
  const check = () => { if (!token || current() !== token) throw assistantFailure('session-changed'); };
  async function call(suffix = '', body, signal) {
    check();
    const response = await fetchFn(`/api/v2/projects/${encodeURIComponent(projectId)}/conversation${suffix}`, {
      method: body === undefined ? 'GET' : 'POST', signal, cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    check();
    let text = '', bytes = 0;
    if (response.body?.getReader) {
      const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
      try {
        while (true) {
          const item = await reader.read(); if (item.done) break;
          bytes += item.value.byteLength;
          if (bytes > 16 * 1024 * 1024) { await reader.cancel(); throw assistantFailure('response-too-large'); }
          text += decoder.decode(item.value, { stream: true });
        }
        text += decoder.decode();
      } finally { reader.releaseLock(); }
    } else text = await response.text();
    check();
    if (new TextEncoder().encode(text).length > 16 * 1024 * 1024) throw assistantFailure("response-too-large");
    let value; try { value = JSON.parse(text); } catch { throw assistantFailure('invalid-response'); }
    if (!response.ok || value?.ok !== true) {
      const raw = response.headers.get('Retry-After');
      throw assistantFailure(typeof value?.code === 'string' ? value.code : 'request-failed', response.status,
        /^[1-5]$/.test(raw ?? '') ? Number(raw) : null);
    }
    return value;
  }
  return Object.freeze({ check, token, projectId,
    availability: signal => call('/availability', undefined, signal),
    read: (offset = 0, signal) => call(`?offset=${offset}&limit=20`, undefined, signal),
    submit: (body, signal) => call('/turns', body, signal),
    decide: (body, signal) => call('/decisions', body, signal),
    cancel: (body, signal) => call('/cancel', body, signal),
    clear: (body, signal) => call('/clear', body, signal),
    wake: (body, signal) => call('/wake', body, signal),
    export: signal => call('/export', undefined, signal),
  });
}
