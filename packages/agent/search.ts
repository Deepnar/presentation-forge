import type { SourceRef } from '../tools/executor.ts';
import type { SearchRequest } from './search-request.generated.ts';

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
