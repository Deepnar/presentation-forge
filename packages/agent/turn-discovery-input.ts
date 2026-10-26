import { cloneJson } from '../tools/json.ts';

export const DISCOVERY_LIMITS = Object.freeze({ rows: 50, inputBytes: 2048,
  responseBytes: 131072, rawChars: 2 * 1024 * 1024, identifierBytes: 512 });
export type DiscoveryBinding = { owner: string | null };
export type DiscoveryCursor = { projectId: string; turnId: string };
export type DiscoveryInput = { limit: number; cursor: DiscoveryCursor | null };
export type DiscoveryPageRequest = DiscoveryBinding & DiscoveryInput;

export function invalidDiscovery(): never {
  throw Object.assign(new Error('Invalid turn discovery input.'), { code: 'invalid-document' });
}
export function discoveryRecord(input: unknown, keys: string[]) {
  let value;
  try { value = cloneJson(input, DISCOVERY_LIMITS.inputBytes); } catch { return invalidDiscovery(); }
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',') ||
    new TextEncoder().encode(JSON.stringify(value)).length > DISCOVERY_LIMITS.inputBytes) invalidDiscovery();
  return value as Record<string, unknown>;
}
export function discoveryIdentifier(value: unknown, maximum = 128): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum &&
    !value.includes('\0') && new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
      .decode(new TextEncoder().encode(value)) === value;
}
export function discoveryProjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
}
export function parseDiscoveryBinding(input: unknown): DiscoveryBinding {
  const value = discoveryRecord(input, ['owner']);
  if (value.owner !== null && !discoveryIdentifier(value.owner)) invalidDiscovery();
  return { owner: value.owner as string | null };
}
export function parseTurnDiscoveryInput(input: unknown): DiscoveryInput {
  const value = discoveryRecord(input, ['limit', 'cursor']);
  if (!Number.isSafeInteger(value.limit) || Number(value.limit) < 1 ||
    Number(value.limit) > DISCOVERY_LIMITS.rows) invalidDiscovery();
  let cursor: DiscoveryCursor | null = null;
  if (value.cursor !== null) {
    const position = discoveryRecord(value.cursor, ['projectId', 'turnId']);
    if (!discoveryProjectId(position.projectId) || !discoveryIdentifier(position.turnId)) invalidDiscovery();
    cursor = { projectId: position.projectId, turnId: position.turnId };
  }
  return { limit: Number(value.limit), cursor };
}
export function parseDiscoveryPageRequest(input: unknown): DiscoveryPageRequest {
  const value = discoveryRecord(input, ['owner', 'limit', 'cursor']);
  return { ...parseDiscoveryBinding({ owner: value.owner }),
    ...parseTurnDiscoveryInput({ limit: value.limit, cursor: value.cursor }) };
}
