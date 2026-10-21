/* DO NOT EDIT — generated from packages/agent/search-request.schema.json by tools/v2-types.mjs.
 * JSON Schema is the source of truth; AJV owns runtime validation. */

/**
 * Bounded semantic web search. Project identity and backend configuration are trusted host inputs, never query arguments.
 */
export interface SearchRequest {
  query: string;
  limit?: number;
  perHost?: number;
  language?: string;
  timeRange?: "day" | "month" | "year";
}
