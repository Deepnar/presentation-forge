import { cloneJson } from '../../packages/tools/json.ts';
import { parsedWebSource, canonicalWebSource, sameWebMeaning } from '../../packages/tools/web-source.ts';

import { SOURCE_LIMITS, sql, catalog, expected, bodies, refuse, sourceRefusalCode } from './source-read.js';
export { SOURCE_LIMITS } from './source-read.js';
const MAX = Number.MAX_SAFE_INTEGER, sourceId = /^src_[0-9a-f]{64}$/, projectId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const utf8 = value => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value));
const integer = (value, max = MAX) => Number.isSafeInteger(value) && value >= 0 && value <= max;
function frozen(value) { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; }
function copy(input, max = SOURCE_LIMITS.dtoBytes) {
  try { const value = cloneJson(input, max); if (utf8(value) > max) refuse('invalid-request'); return value; }
  catch { return refuse('invalid-request'); }
}
function keys(value, required, optional = []) {
  return value && typeof value === 'object' && !Array.isArray(value) && required.every(k => Object.hasOwn(value, k)) &&
    Object.keys(value).every(k => [...required, ...optional].includes(k));
}
function trusted(input) {
  const value = copy(input, 1024);
  if (!keys(value, ['id','owner']) || typeof value.id !== 'string' || !projectId.test(value.id) ||
    value.owner !== null && (typeof value.owner !== 'string' || !value.owner.trim() || value.owner.length > 128)) refuse('invalid-request');
  return frozen(value);
}
function parse(operation, input, binding) {
  const r = copy(input), pair = ['generation','revision'];
  const required = { inspect: [], register: ['projectRevision',...pair,'sources'], resolve: ['generation','ids'], list: pair, clear: pair }[operation];
  if (!keys(r, required, operation === 'list' ? ['limit','cursor'] : [])) refuse('invalid-request');
  for (const k of required.filter(k => ['generation','revision','projectRevision'].includes(k))) if (!integer(r[k])) refuse('invalid-request');
  if (operation === 'register') {
    if (!Array.isArray(r.sources) || !r.sources.length || r.sources.length > SOURCE_LIMITS.batch) refuse('invalid-request');
    r.sources = r.sources.map(source => {
      const s = parsedWebSource(source, binding.id);
      if (!s) refuse('invalid-request');
      const canonical = canonicalWebSource(s);
      if (utf8(canonical) > SOURCE_LIMITS.sourceBytes) refuse('invalid-request');
      return canonical;
    });
    if (new Set(r.sources.map(s => s.id)).size !== r.sources.length) refuse('invalid-request');
  }
  if (operation === 'resolve' && (!Array.isArray(r.ids) || !r.ids.length || r.ids.length > SOURCE_LIMITS.batch ||
    r.ids.some(id => typeof id !== 'string' || !sourceId.test(id)) || new Set(r.ids).size !== r.ids.length)) refuse('invalid-request');
  if (operation === 'list') {
    if (!Object.hasOwn(r, 'limit')) r.limit = SOURCE_LIMITS.batch;
    if (!integer(r.limit, SOURCE_LIMITS.batch) || r.limit === 0) refuse('invalid-request');
    if (r.cursor !== undefined && r.cursor !== null) {
      const c = r.cursor;
      if (utf8(c) > SOURCE_LIMITS.cursorBytes || !keys(c, ['projectId',...pair,'afterSourceId']) ||
        c.projectId !== binding.id || c.generation !== r.generation || c.revision !== r.revision ||
        typeof c.afterSourceId !== 'string' || !sourceId.test(c.afterSourceId)) refuse('invalid-request');
    }
  }
  return frozen(r);
}
async function saveCatalog(tx, c) {
  await tx.query(`INSERT INTO v2_project_source_catalog(project_id,generation,revision,count,bytes,policy_version)
    VALUES(?,?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET generation=excluded.generation,
    revision=excluded.revision,count=excluded.count,bytes=excluded.bytes,policy_version=excluded.policy_version`,
  [c.projectId,c.generation,c.revision,c.count,c.bytes,c.policyVersion]);
}
function next(value) { if (value === MAX) refuse('invalid-state'); return value + 1; }
const messages = {
  'invalid-request': 'Provide a bounded source request with current project and catalog identity.',
  'not-found': 'This project is not available.',
  'stale-project': 'The saved project changed; read its current revision.',
  'stale-catalog': 'The source catalog changed; read its current snapshot.',
  'invalid-state': 'The retained source catalog is invalid; no result was published.',
  'capacity-exceeded': 'The source catalog capacity would be exceeded.',
  'result-too-large': 'The complete source result exceeds its output limit.',
  'storage-unavailable': 'Source storage is unavailable.',
};
export function createSourceRegistry(backend) {
  const transact = backend.withSourceTransaction.bind(backend);
  async function operate(operation, identity, input = {}) {
    try {
      const binding = trusted(identity), request = parse(operation,input,binding);
      return await transact(binding, async tx => {
        const c = await catalog(tx,binding,operation === 'clear'); let result;
        if (operation === 'inspect') result = { ok: true, catalog: c };
        if (operation === 'register') {
          if (tx.doc.revision !== request.projectRevision) refuse('stale-project');
          expected(c,request);
          const found = await bodies(tx,binding,request.sources.map(s => s.id)), fresh = [];
          for (const source of request.sources) {
            const old = found.get(source.id);
            if (old && !sameWebMeaning(old,source)) refuse('invalid-state');
            if (!old) fresh.push(source);
          }
          const bytes = fresh.reduce((n,s) => n + utf8(s),0);
          if (c.count + fresh.length > SOURCE_LIMITS.count || c.bytes + bytes > SOURCE_LIMITS.bytes) refuse('capacity-exceeded');
          if (fresh.length) {
            c.revision = next(c.revision); c.count += fresh.length; c.bytes += bytes;
            for (const source of fresh) await tx.query('INSERT INTO v2_project_sources(project_id,source_id,payload,payload_bytes) VALUES(?,?,?,?)', [binding.id,source.id,JSON.stringify(source),utf8(source)]);
            await saveCatalog(tx,c);
          }
          result = { ok: true, status: fresh.length ? 'registered' : 'noop', catalog: c,
            sources: request.sources.map(s => found.get(s.id) ?? s) };
        }
        if (operation === 'resolve') {
          expected(c,request,false);
          const found = await bodies(tx,binding,request.ids);
          result = { ok: true, catalog: c, results: request.ids.map(id => found.has(id) ? { id, status: 'found', source: found.get(id) } : { id, status: 'missing' }) };
        }
        if (operation === 'list') {
          expected(c,request);
          const q = sql(tx), after = request.cursor?.afterSourceId;
          const rows = await tx.query(`SELECT ${q.text('source_id',68,'source_id')} FROM v2_project_sources
            WHERE project_id=?${after ? ` AND ${q.binary('source_id')}>?` : ''}
            ORDER BY ${q.binary('source_id')} LIMIT ?`, [binding.id,...(after ? [after] : []),request.limit + 1]);
          const ids = rows.map(row => q.decode(row.source_id));
          if (ids.some(id => !sourceId.test(id)) || new Set(ids).size !== ids.length) refuse('invalid-state');
          const selected = ids.slice(0,request.limit), found = await bodies(tx,binding,selected);
          if (found.size !== selected.length) refuse('invalid-state');
          result = { ok: true, catalog: c, sources: selected.map(id => found.get(id)), cursor: ids.length > request.limit ?
            { projectId: binding.id, generation: c.generation, revision: c.revision, afterSourceId: selected.at(-1) } : null };
        }
        if (operation === 'clear') {
          expected(c,request); c.generation = next(c.generation); c.revision = next(c.revision); c.count = c.bytes = 0;
          await tx.query('DELETE FROM v2_project_sources WHERE project_id=?',[binding.id]); await saveCatalog(tx,c);
          result = { ok: true, status: 'cleared', catalog: c };
        }
        if (utf8(result) > SOURCE_LIMITS.dtoBytes) refuse('result-too-large');
        return frozen(result);
      });
    } catch (error) {
      const code = sourceRefusalCode(error) ?? (error?.code === 'not-found' ? 'not-found' : 'storage-unavailable');
      return frozen({ ok: false, code, message: messages[code] });
    }
  }
  return Object.freeze(Object.fromEntries(['inspect','register','resolve','list','clear'].map(name => [name,(binding,input) => operate(name,binding,input)])));
}
