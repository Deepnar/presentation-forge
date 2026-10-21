import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Ajv } from 'ajv';
import { parseHTML } from 'linkedom';
import { cloneJson } from '../tools/json.ts';
import type { SourceRef } from '../model/source.generated.ts';
import type { SearchRequest } from './search-request.generated.ts';

const ajv = new Ajv({ strict: false });
const validateRequest = ajv.compile<SearchRequest>(JSON.parse(await readFile(new URL('./search-request.schema.json', import.meta.url), 'utf8')));
const validateSource = ajv.compile<SourceRef>(JSON.parse(await readFile(new URL('../model/source.schema.json', import.meta.url), 'utf8')));
export type SearchBinding = { projectId: string };
export type SearchCode = 'invalid-request' | 'invalid-response' | 'search-denied' | 'rate-limited' | 'search-unavailable' | 'timeout' | 'cancelled' | 'response-too-large' | 'result-too-large';
export type SearchFailure = { ok: false; code: SearchCode; message: string };
export type SearchWarning = 'invalid-results' | 'partial-results' | 'results-truncated';
export type SearchSuccess = { ok: true; providerId: string; sources: SourceRef[]; warnings: SearchWarning[] };
export type SearchResult = SearchSuccess | SearchFailure;
export interface SearchProvider {
  readonly id: string;
  search(binding: SearchBinding, request: SearchRequest, options?: { signal?: AbortSignal }): Promise<SearchResult>;
}
export const searchFailure = (code: SearchCode): SearchFailure => Object.freeze({ ok: false, code, message: {
  'invalid-request': 'Provide a bounded search query and trusted project binding.',
  'invalid-response': 'The search backend returned an invalid response.',
  'search-denied': 'The search backend refused access to its JSON search API.',
  'rate-limited': 'The search backend rate limit was reached; no retry was made.',
  'search-unavailable': 'The search request could not complete.',
  timeout: 'The bounded search request timed out.',
  cancelled: 'The search request was cancelled.',
  'response-too-large': 'The search response exceeded its byte limit.',
  'result-too-large': 'Search sources exceed the output budget. Request fewer results.',
}[code] });
export function searchRequest(input: unknown): SearchRequest | null {
  try {
    const copy = cloneJson(input, 4096);
    if (!validateRequest(copy)) return null;
    const request = copy as SearchRequest;
    if (/[\x00-\x1f\x7f]/u.test(request.query)) return null;
    return { ...request, query: request.query.trim() };
  } catch { return null; }
}
export function searchBinding(input: unknown): SearchBinding | null {
  try {
    const copy = cloneJson(input, 1024) as SearchBinding;
    return copy && Object.keys(copy).join(',') === 'projectId' && typeof copy.projectId === 'string' &&
      copy.projectId.length <= 128 && copy.projectId.trim().length > 0 && !/[\x00-\x1f]/u.test(copy.projectId) ? copy : null;
  } catch { return null; }
}
function plainText(value: unknown, max: number): string | null {
  if (typeof value !== 'string' || value.length > 20000) return null;
  // Snippets are untrusted markup; parsing never executes scripts or fetches pages.
  const { document } = parseHTML(`<html><body>${value}</body></html>`);
  for (const node of document.querySelectorAll('script,style,template,iframe,object,form')) node.remove();
  return (document.body.textContent ?? '').toWellFormed().replace(/[\x00-\x1f\x7f\s]+/gu, ' ').trim().slice(0, max).toWellFormed();
}
function citationUrl(input: unknown): URL | null {
  if (typeof input !== 'string' || input.length > 2000 || /[\x00-\x20\x7f]/u.test(input)) return null;
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) return null;
    url.hash = '';
    return url.href.length <= 2000 ? url : null;
  } catch { return null; }
}

export function normalizeWebResults(providerId: string, binding: unknown, input: unknown, raw: unknown,
  options: { maxOutputChars?: number; retrievedAt?: string } = {}): SearchResult {
  try {
    const bound = searchBinding(binding), request = searchRequest(input);
    const limits = cloneJson(options, 1024) as { maxOutputChars?: number; retrievedAt?: string };
    if (!limits || Array.isArray(limits) || Object.keys(limits).some(k => !['maxOutputChars', 'retrievedAt'].includes(k))) return searchFailure('invalid-request');
    const max = limits.maxOutputChars ?? 32000, retrievedAt = limits.retrievedAt ?? new Date().toISOString();
    if (!bound || !request || typeof providerId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/u.test(providerId) || !Number.isSafeInteger(max) || max < 1024 || max > 65536 ||
        typeof retrievedAt !== 'string' || retrievedAt.length > 64 || !Number.isFinite(Date.parse(retrievedAt))) return searchFailure('invalid-request');
    const data = cloneJson(raw, 1048576) as { results: unknown[]; unresponsive_engines?: unknown[] };
    if (!data || !Array.isArray(data.results) || data.results.length > 1000 ||
        data.unresponsive_engines !== undefined && !Array.isArray(data.unresponsive_engines)) return searchFailure('invalid-response');
    const sources: SourceRef[] = [], seen = new Set<string>(), hosts = new Map<string, number>();
    let invalid = false, truncated = false;
    for (const rawRow of data.results) {
      if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) { invalid = true; continue; }
      const row = rawRow as Record<string, unknown>, url = citationUrl(row.url);
      const title = plainText(row.title, 500), excerpt = row.content === undefined ? '' : plainText(row.content, 2000);
      const publishedAt = row.publishedDate === undefined || row.publishedDate === null ? '' : plainText(row.publishedDate, 64);
      if (!url || !title || excerpt === null || publishedAt === null) { invalid = true; continue; }
      const host = url.hostname.replace(/^www\./u, '').replace(/\.$/u, ''), count = hosts.get(host) ?? 0;
      if (seen.has(url.href) || count >= (request.perHost ?? 2)) continue;
      seen.add(url.href); hosts.set(host, count + 1);
      if (sources.length >= (request.limit ?? 8)) { truncated = true; continue; }
      // Retrieval/provenance metadata cannot change the meaning of an existing citation.
      const identity = JSON.stringify(['forge-web-source-v1', bound.projectId, url.href, title, excerpt, publishedAt]);
      const source: SourceRef = { id: `src_${createHash('sha256').update(identity).digest('hex')}`,
        projectId: bound.projectId, kind: 'web', title, url: url.href, excerpt, searchProvider: providerId, retrievedAt,
        ...(publishedAt ? { publishedAt } : {}) };
      if (!validateSource(source)) return searchFailure('invalid-response');
      sources.push(Object.freeze(source));
    }
    const warnings: SearchWarning[] = [...(invalid ? ['invalid-results' as const] : []),
      ...(data.unresponsive_engines?.length ? ['partial-results' as const] : []), ...(truncated ? ['results-truncated' as const] : [])];
    const result: SearchSuccess = { ok: true, providerId, sources, warnings };
    if (JSON.stringify(result).length > max) return searchFailure('result-too-large');
    Object.freeze(sources); Object.freeze(warnings); return Object.freeze(result);
  } catch { return searchFailure('invalid-response'); }
}
