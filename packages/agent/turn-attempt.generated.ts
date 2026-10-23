/* DO NOT EDIT — generated from packages/agent/turn-attempt.schema.json by tools/v2-types.mjs.
 * JSON Schema is the source of truth; AJV owns runtime validation. */

export interface TurnAttempt {
  version: 1;
  id: string;
  turnId: string;
  generation: string;
  fence: number;
  step: number;
  reservedOutputTokens: number;
  state: "reserved" | "dispatched" | "known" | "unknown" | "not-dispatched";
  providerId: string;
  family: "openai-compatible" | "anthropic";
  model: string;
  configurationDigest: string;
  instructionsVersion: "forge-context-v1";
  catalogVersion: "semantic-tools-v1";
  createdAt: number;
  settleBy: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheWriteInputTokens: number;
  } | null;
}
