import { parsedWebSource, canonicalWebSource } from '../../packages/tools/web-source.ts';

export const SOURCE_LIMITS = Object.freeze({ batch: 24, sourceBytes: 16384, count: 512, bytes: 4194304, dtoBytes: 393216, cursorBytes: 512 });
const MAX = Number.MAX_SAFE_INTEGER, sourceId = /^src_[0-9a-f]{64}$/;
const utf8 = value => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value));
const integer = (value, max = MAX) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const marker = Symbol('source-registry');
export function refuse(code) { throw { [marker]: true, code }; }
export function sourceRefusalCode(error) { return error?.[marker] ? error.code : null; }

export function sql(tx) {
  if (!['sqlite','postgres'].includes(tx.dialect)) refuse('storage-unavailable');
  const pg = tx.dialect === 'postgres';
  const size = col => pg ? `octet_length(${col})` : `length(CAST(${col} AS BLOB))`;
  const text = (col, limit, alias) => `CASE WHEN ${pg ? '' : `typeof(${col})='text' AND `}${size(col)}<=${limit} THEN ${pg ? col : `CAST(${col} AS BLOB)`} ELSE NULL END AS ${alias}`;
  const number = (col, alias = col, maximum = MAX) => `CASE WHEN ${pg ? '' : `typeof(${col})='integer' AND `}${col} BETWEEN 0 AND ${maximum} THEN CAST(${col} AS TEXT) ELSE NULL END AS ${alias}`;
  const binary = col => `${col} COLLATE ${pg ? '"C"' : 'BINARY'}`;
  const actual = `CASE WHEN ${pg ? '' : "typeof(payload)='text' AND "}${size('payload')}<=${SOURCE_LIMITS.sourceBytes} THEN CAST(${size('payload')} AS TEXT) ELSE NULL END AS actual_bytes`;
  return { text, number, binary, actual, decode(value) {
    try {
      if (pg) { if (typeof value !== 'string') refuse('invalid-state'); return value; }
      if (!(value instanceof Uint8Array)) refuse('invalid-state');
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(value);
    } catch { return refuse('invalid-state'); }
  } };
}
function number(value, max = MAX) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,15})$/.test(value) || !integer(Number(value), max)) refuse('invalid-state');
  return Number(value);
}
export async function catalog(tx, binding, syntaxOnly = false) {
  const q = sql(tx), rows = await tx.query(`SELECT ${q.text('project_id',64,'project_id')},
    ${['generation','revision','count','bytes','policy_version'].map(k => q.number(k)).join(',')}
    FROM v2_project_source_catalog WHERE project_id=? LIMIT 1`, [binding.id]);
  let c = { projectId: binding.id, generation: 0, revision: 0, count: 0, bytes: 0, policyVersion: 1 };
  if (rows.length) {
    const row = rows[0]; if (q.decode(row.project_id) !== binding.id) refuse('invalid-state');
    c = { ...c, generation: number(row.generation), revision: number(row.revision), count: number(row.count,SOURCE_LIMITS.count),
      bytes: number(row.bytes,SOURCE_LIMITS.bytes), policyVersion: number(row.policy_version,1) };
    if (c.policyVersion !== 1) refuse('invalid-state');
  }
  // Clear deliberately needs no source decoding to remove corrupt private bodies.
  if (syntaxOnly && rows.length) return c;
  const metadata = await tx.query(`SELECT ${q.text('source_id',68,'source_id')},${q.text('project_id',64,'project_id')},
    ${q.number('payload_bytes')},${q.actual} FROM v2_project_sources
    WHERE project_id=? ORDER BY ${q.binary('source_id')} LIMIT ${SOURCE_LIMITS.count + 1}`, [binding.id]);
  if (!rows.length && metadata.length || metadata.length > SOURCE_LIMITS.count) refuse('invalid-state');
  let bytes = 0; const ids = new Set();
  for (const row of metadata) {
    const id = q.decode(row.source_id);
    if (!sourceId.test(id) || ids.has(id) || q.decode(row.project_id) !== binding.id) refuse('invalid-state');
    ids.add(id); const actual = number(row.actual_bytes,SOURCE_LIMITS.sourceBytes);
    if (number(row.payload_bytes,SOURCE_LIMITS.sourceBytes) !== actual) refuse('invalid-state');
    bytes += actual;
  }
  if (metadata.length !== c.count || bytes !== c.bytes) refuse('invalid-state');
  return c;
}
export function expected(c, r, revision = true) {
  if (c.generation !== r.generation || revision && c.revision !== r.revision) refuse('stale-catalog');
}
export async function bodies(tx, binding, ids) {
  if (!ids.length) return new Map();
  const q = sql(tx), rows = await tx.query(`SELECT ${q.text('project_id',64,'project_id')},${q.text('source_id',68,'source_id')},
    ${q.text('payload',SOURCE_LIMITS.sourceBytes,'payload')},${q.number('payload_bytes')},${q.actual}
    FROM v2_project_sources WHERE project_id=? AND source_id IN (${ids.map(() => '?').join(',')}) LIMIT ${SOURCE_LIMITS.batch}`, [binding.id,...ids]);
  const found = new Map();
  for (const row of rows) {
    const id = q.decode(row.source_id), text = q.decode(row.payload);
    if (q.decode(row.project_id) !== binding.id || !ids.includes(id) || found.has(id) || utf8(text) !== number(row.actual_bytes,SOURCE_LIMITS.sourceBytes) || utf8(text) !== number(row.payload_bytes,SOURCE_LIMITS.sourceBytes)) refuse('invalid-state');
    let source; try { source = parsedWebSource(JSON.parse(text),binding.id); } catch { refuse('invalid-state'); }
    if (!source || source.id !== id || JSON.stringify(canonicalWebSource(source)) !== text) refuse('invalid-state');
    found.set(id,source);
  }
  return found;
}
