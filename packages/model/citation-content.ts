import type { SceneElement } from './scene.generated.ts';
import type { CitationTargetObservation } from './citation-targets.ts';
import { isSystemChrome } from './scene-constants.ts';

type Projection = string | number | boolean | null | Projection[];
const encoder = new TextEncoder();

function projectElement(e: SceneElement): Projection {
  switch (e.kind) {
    case 'text': return ['text', e.paragraphs ? e.paragraphs.map(p => [p.bullet ?? false, p.runs.map(r => r.text).join('')]) : null];
    case 'chart': return ['chart', e.chart ? [e.chart.chartKind, e.chart.categories, e.chart.series.map(s => [s.name, s.values])] : null];
    case 'table': return ['table', e.table ? [e.table.header ?? null, e.table.rows] : null];
    case 'image': return ['image', e.image ? [e.image.src, e.image.alt ?? null] : null];
    case 'group': return ['group', e.group ? e.group.children.filter(c => !isSystemChrome(c)).map(projectElement) : null];
    default: return [e.kind];
  }
}

// Targets must first pass the shared iterative tree budget; no fetching or repair.
export async function citationContentDigests(observations: readonly CitationTargetObservation[]): Promise<(string | null)[]> {
  let bytes = 0;
  const inputs = observations.map(o => {
    if (o.status !== 'present' || !o.scene) return null;
    const projection: Projection = o.element ? projectElement(o.element) : ['slide', o.scene.elements.filter(e => !isSystemChrome(e)).map(projectElement)];
    const input = encoder.encode(JSON.stringify(['forge-citation-content-v1', projection]));
    if ((bytes += input.byteLength) > 393216) throw Object.assign(new Error('Citation projection limit exceeded.'), { code: 'target-budget-exceeded' });
    return input;
  });
  const result: (string | null)[] = [];
  for (const input of inputs) result.push(input === null ? null : Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', input))).map(n => n.toString(16).padStart(2, '0')).join(''));
  return result;
}
