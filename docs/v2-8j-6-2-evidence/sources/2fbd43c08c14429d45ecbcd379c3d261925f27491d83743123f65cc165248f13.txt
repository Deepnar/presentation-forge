import type { SlideScene } from './scene.generated.ts';

export type Citation = NonNullable<SlideScene['citations']>[number];
export type CitationTarget = Citation['target'];
export const CITATION_LIMITS = Object.freeze({ perScene: 128, perProject: 512, recordBytes: 2048, bytes: 1048576 });
const encoder = new TextEncoder();

export function citationTuple(c: Citation): string {
  return JSON.stringify([c.target.kind, c.target.slideId, 'elementId' in c.target ? c.target.elementId : null,
    c.source.projectId, c.source.id, c.source.generation, c.locator ? [c.locator.startByte, c.locator.endByte] : null]);
}

// Shape validation runs first. These cross-record rules also cover raw scene ingress.
export function citationMetadataError(scenes: readonly SlideScene[], projectId?: string): string | null {
  const ids = new Set<string>();
  let count = 0, bytes = 0;
  for (const scene of scenes) {
    const tuples = new Set<string>();
    if ((scene.citations?.length ?? 0) > CITATION_LIMITS.perScene) return 'Too many scene citations.';
    for (const c of scene.citations ?? []) {
      if (++count > CITATION_LIMITS.perProject) return 'Too many project citations.';
      if (ids.has(c.id)) return 'Duplicate citation identifier.';
      ids.add(c.id);
      const tuple = citationTuple(c);
      if (tuples.has(tuple)) return 'Duplicate scene citation association.';
      tuples.add(tuple);
      if (projectId !== undefined && c.source.projectId !== projectId) return 'Foreign citation project binding.';
      if (c.target.slideId.length > 200 || ('elementId' in c.target && c.target.elementId.length > 200)) return 'Citation target identifier is too long.';
      if (c.locator && c.locator.startByte >= c.locator.endByte) return 'Invalid citation range.';
      const n = encoder.encode(JSON.stringify(c)).byteLength;
      if (n > CITATION_LIMITS.recordBytes || (bytes += n) > CITATION_LIMITS.bytes) return 'Citation metadata is too large.';
    }
  }
  return null;
}

// Full-scene JSON may use another key order; a semantic no-op preserves its bytes.
export function sameCitationValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
  return ak.length === bk.length && ak.every((key, i) => key === bk[i] &&
    sameCitationValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

export function hasCitations(scenes: readonly SlideScene[]): boolean {
  return scenes.some(s => (s?.citations?.length ?? 0) > 0);
}

// Predictable labels preserve duplicate-command replay; they are never capabilities.
export function remintCitationId(id: string, taken: Set<string>): string {
  let value = BigInt('0x' + id.slice(4));
  for (let i = 0; i <= CITATION_LIMITS.perProject; i++) {
    value = (value + 1n) % (1n << 128n);
    const next = 'cit_' + value.toString(16).padStart(32, '0');
    if (!taken.has(next)) { taken.add(next); return next; }
  }
  throw new Error('Citation identifier capacity exhausted.');
}
