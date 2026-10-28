import type { SlideScene, SceneElement } from './scene.generated.ts';
import type { CitationTarget } from './citations.ts';
import { isSystemChrome } from './scene-constants.ts';

export interface CitationTargetObservation {
  status: 'present' | 'missing' | 'ambiguous';
  scene?: SlideScene;
  element?: SceneElement;
  blocked: boolean;
}
function overflow(): never {
  throw Object.assign(new Error('Citation traversal limit exceeded.'), { code: 'target-budget-exceeded' });
}

// J3 observes slide existence alone; J4 also needs the slide tree for its anchor.
export function indexCitationTargets(scenes: readonly SlideScene[], targets: readonly CitationTarget[], includeSlideTrees = false): CitationTargetObservation[] {
  const slides = new Map<string, SlideScene>(), counts = new Map<string, number>();
  const wanted = new Set(targets.filter(t => includeSlideTrees || t.kind === 'element').map(t => t.slideId));
  const indexes = new Map<string, Map<string, { count: number; element: SceneElement; blocked: boolean }>>();
  for (const scene of scenes) { slides.set(scene.id, scene); counts.set(scene.id, (counts.get(scene.id) ?? 0) + 1); }
  let visited = 0;
  for (const slideId of wanted) {
    if (counts.get(slideId) !== 1) continue;
    const scene = slides.get(slideId)!;
    const index = new Map<string, { count: number; element: SceneElement; blocked: boolean }>();
    const rows: { element: SceneElement; blocked: boolean }[] = [];
    const scopes = new WeakMap<SceneElement, boolean>();
    const stack = [{ elements: scene.elements, at: 0, depth: 0, blocked: false }];
    while (stack.length) {
      const frame = stack.at(-1)!;
      if (frame.at === frame.elements.length) { stack.pop(); continue; }
      if (++visited > 10000 || frame.depth > 128) overflow();
      const element = frame.elements[frame.at++];
      const row = { element, blocked: frame.blocked || element.locked === true || element.hidden === true || isSystemChrome(element) };
      rows.push(row);
      const prior = index.get(element.id);
      index.set(element.id, { ...row, count: Math.min(2, (prior?.count ?? 0) + 1) });
      if (element.group?.children?.length) stack.push({ elements: element.group.children, at: 0, depth: frame.depth + 1, blocked: row.blocked });
    }
    for (const row of rows.reverse()) {
      const blocked = row.blocked || (row.element.kind === 'group' && (row.element.group?.children ?? []).some(c => scopes.get(c)));
      scopes.set(row.element, blocked);
      if (index.get(row.element.id)?.count === 1) index.get(row.element.id)!.blocked = blocked;
    }
    indexes.set(slideId, index);
  }
  return targets.map(target => {
    const n = counts.get(target.slideId) ?? 0;
    if (n !== 1) return { status: n ? 'ambiguous' : 'missing', blocked: false };
    const scene = slides.get(target.slideId)!;
    if (target.kind === 'slide') return { status: 'present', scene, blocked: false };
    const row = indexes.get(target.slideId)?.get(target.elementId);
    return !row ? { status: 'missing', blocked: false } : row.count !== 1 ? { status: 'ambiguous', blocked: false } :
      { status: 'present', scene, element: row.element, blocked: row.blocked };
  });
}
