import { parseDiscoveryPageRequest, DISCOVERY_LIMITS } from '../../packages/agent/turn-discovery-input.ts';
import { TURN_LIMITS } from '../../packages/agent/turn-limits.ts';

export function turnDiscoveryQuery(input, dialect) {
  const request = parseDiscoveryPageRequest(input);
  if (!['sqlite', 'postgres'].includes(dialect)) throw new Error('Invalid discovery dialect.');
  const pg = dialect === 'postgres', params = [];
  const parameter = value => { params.push(value); return pg ? `$${params.length}` : '?'; };
  const binary = value => `${value} COLLATE ${pg ? '"C"' : 'BINARY'}`;
  const size = value => pg ? `octet_length(${value})` : `length(CAST(${value} AS BLOB))`;
  const bounded = (value, bytes, name) => `CASE WHEN ${size(value)} <= ${bytes} THEN ${pg ? value : `CAST(${value} AS BLOB)`} ELSE NULL END AS ${name}`;
  const owner = `${binary('p.owner')} ${pg ? 'IS NOT DISTINCT FROM' : 'IS'} ${parameter(request.owner)}`;
  let after = '';
  if (request.cursor) after = ` AND (${binary('p.id')} > ${parameter(request.cursor.projectId)} OR
    (${binary('p.id')} = ${parameter(request.cursor.projectId)} AND ${binary('t.id')} > ${parameter(request.cursor.turnId)}))`;
  const sql = `SELECT
    ${bounded('p.id', 64, 'project_id')},
    ${bounded('p.owner', DISCOVERY_LIMITS.identifierBytes, 'owner')},
    ${bounded('t.id', DISCOVERY_LIMITS.identifierBytes, 'turn_id')},
    ${bounded('t.generation', DISCOVERY_LIMITS.identifierBytes, 'generation')},
    ${bounded('h.payload', TURN_LIMITS.headerBytes, 'header_payload')},
    ${bounded('t.payload', TURN_LIMITS.recordBytes, 'turn_payload')}
    FROM v2_projects p JOIN v2_agent_turns t ON ${binary('t.project_id')}=${binary('p.id')}
    LEFT JOIN v2_agent_conversations h ON ${binary('h.project_id')}=${binary('p.id')}
    WHERE ${owner}${after}
    ORDER BY ${binary('p.id')}, ${binary('t.id')} LIMIT ${parameter(request.limit + 1)}`;
  return { sql, params };
}
