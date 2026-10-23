/* DO NOT EDIT — generated from packages/agent/turn-record.schema.json by tools/v2-types.mjs.
 * JSON Schema is the source of truth; AJV owns runtime validation. */

export interface TurnRecord {
  version: 1;
  id: string;
  generation: string;
  requestKey: string;
  identity: string;
  projectRevision: number;
  state:
    | "submitted"
    | "preparing"
    | "awaiting-decision"
    | "complete"
    | "refused"
    | "needs-user-action"
    | "cancelled"
    | "expired"
    | "approved"
    | "rejected";
  code: string | null;
  revision: number;
  fence: number;
  lease: {
    workerId: string;
    until: number;
  } | null;
  everDispatched: boolean;
  createdAt: number;
  updatedAt: number;
  prepDeadline: number;
  planDeadline: number;
  proposalId: string | null;
  runId: string | null;
  reservedPrivateBytes: number;
  reservedMetadataBytes: number;
}
