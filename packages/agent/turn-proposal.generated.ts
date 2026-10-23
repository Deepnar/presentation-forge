/* DO NOT EDIT — generated from packages/agent/turn-proposal.schema.json by tools/v2-types.mjs.
 * JSON Schema is the source of truth; AJV owns runtime validation. */

export interface TurnProposal {
  version: 1;
  id: string;
  turnId: string;
  generation: string;
  revision: number;
  projectRevision: number;
  digest: string;
  expiresAt: number;
  editCount: number;
  decision: ("approve" | "reject" | "cancel") | null;
  decisionKey: string | null;
  runId: string | null;
  publishedAt: number;
  decisionDigest: string | null;
}
