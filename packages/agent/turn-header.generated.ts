/* DO NOT EDIT — generated from packages/agent/turn-header.schema.json by tools/v2-types.mjs.
 * JSON Schema is the source of truth; AJV owns runtime validation. */

export interface TurnHeader {
  version: 1;
  generation: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  accounting: {
    reservedOutputTokens: number;
    knownInputTokens: number;
    knownOutputTokens: number;
    knownCacheReadTokens: number;
    knownCacheWriteTokens: number;
    knownAttempts: number;
    unknownAttempts: number;
  };
}
