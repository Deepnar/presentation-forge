import { cloneJson } from '../tools/json.ts';
import { parseHeader, parseTurn } from './turn-state.ts';
import { TURN_LIMITS } from './turn-limits.ts';
import { DISCOVERY_LIMITS, discoveryIdentifier, discoveryProjectId, invalidDiscovery,
  parseDiscoveryBinding, parseTurnDiscoveryInput, type DiscoveryPageRequest,
  type DiscoveryCursor } from './turn-discovery-input.ts';
export { DISCOVERY_LIMITS, parseDiscoveryBinding, parseTurnDiscoveryInput } from './turn-discovery-input.ts';

export interface TurnDiscoveryBackend {
  readTurnMetadataPage(input: DiscoveryPageRequest): Promise<Record<string, unknown>[]>;
}
const fields = ['generation', 'header_payload', 'owner', 'project_id', 'turn_id', 'turn_payload'];
const allowedErrors = new Set(['invalid-document', 'invalid-id', 'store-misconfigured', 'storage-unavailable']);
function payload(value: unknown, limit: number): unknown {
  if (typeof value !== 'string' || new TextEncoder().encode(value).length > limit) invalidDiscovery();
  try { return JSON.parse(value); } catch { return invalidDiscovery(); }
}
function compareText(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}
function compare(a: DiscoveryCursor, b: DiscoveryCursor) {
  return compareText(a.projectId, b.projectId) || compareText(a.turnId, b.turnId);
}

// Discovery confers no claim or approval; every consumer must re-enter I2.
export function createTurnDiscovery(backend: TurnDiscoveryBackend) {
  if (!backend || typeof backend.readTurnMetadataPage !== 'function') invalidDiscovery();
  const read = backend.readTurnMetadataPage.bind(backend);
  return Object.freeze({
    async discover(binding: unknown, input: unknown) {
      try {
        const trusted = parseDiscoveryBinding(binding), page = parseTurnDiscoveryInput(input);
        const raw = await read({ ...trusted, ...page });
        let rows;
        try { rows = cloneJson(raw, DISCOVERY_LIMITS.rawChars); }
        catch { return invalidDiscovery(); }
        if (!Array.isArray(rows) || rows.length > page.limit + 1) invalidDiscovery();
        const candidates = [];
        let previous = page.cursor, last: DiscoveryCursor | null = null;
        for (const [index, value] of rows.entries()) {
          if (!value || typeof value !== 'object' || Array.isArray(value) ||
            Object.keys(value).sort().join(',') !== fields.join(',')) invalidDiscovery();
          const row = value as Record<string, unknown>;
          if (row.owner !== trusted.owner || !discoveryProjectId(row.project_id) ||
            !discoveryIdentifier(row.turn_id) || !discoveryIdentifier(row.generation)) invalidDiscovery();
          const header = parseHeader(payload(row.header_payload, TURN_LIMITS.headerBytes));
          const turn = parseTurn(payload(row.turn_payload, TURN_LIMITS.recordBytes));
          if (!discoveryIdentifier(header.generation) || !discoveryIdentifier(turn.generation) ||
            !discoveryIdentifier(turn.id) || row.turn_id !== turn.id ||
            row.generation !== turn.generation || header.generation !== turn.generation) invalidDiscovery();
          const position = { projectId: row.project_id, turnId: row.turn_id };
          if (previous && compare(position, previous) <= 0) invalidDiscovery();
          previous = position;
          if (index === page.limit) continue;
          last = position;
          if (['submitted', 'preparing', 'approved'].includes(turn.state)) candidates.push({
            projectId: row.project_id, generation: turn.generation, turnId: turn.id,
            turnRevision: turn.revision, state: turn.state,
            preparationDeadline: turn.prepDeadline, leaseUntil: turn.lease?.until ?? null,
          });
        }
        const result = { ok: true as const, items: candidates,
          scannedRows: Math.min(rows.length, page.limit), hasMore: rows.length > page.limit,
          nextCursor: rows.length > page.limit ? last : null };
        if (new TextEncoder().encode(JSON.stringify(result)).length > DISCOVERY_LIMITS.responseBytes) invalidDiscovery();
        return result;
      } catch (error) {
        const code = (error as { code?: string })?.code;
        throw Object.assign(new Error('Turn discovery operation failed.'), {
          code: code && allowedErrors.has(code) ? code : 'discovery-failed',
        });
      }
    },
  });
}
