import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../../../test/v2-tool-fixture.js';
import { record } from '../../../test/v2-citations-fixture.js';
import { source } from '../../../test/v2-source-registry-fixture.js';
import { pureFixture, binding, request } from '../../../test/v2-citation-export-fixture.js';
import { createProjectCitationExporter } from '../../../src/projects/citation-export.js';

for (const furniture of [false, true]) {
  test('slide-level citation refuses ' + (furniture ? 'chrome/decor-only' : 'empty') + ' authored native scope', { timeout: 10000 }, async () => {
    const scene = structuredClone(seed()[0]);
    scene.elements = furniture ? [{ id: 'chrome-only', kind: 'shape', x: 0, y: 0, w: 1, h: 1, z: 0,
      provenance: 'compiler', locked: true, shape: { fill: '123456' } }] : [];
    if (furniture) scene.background.decor = [{ shape: 'rect', x: 0, y: 0, w: 1, h: 1, fill: 'ABCDEF' }];
    const retained = source();
    const f = await pureFixture({ scenes: [scene], sources: [retained], citations: [record(1, {
      target: { kind: 'slide', slideId: scene.id }, source: { projectId: 'project', id: retained.id, generation: 0 },
    })] });
    const before = structuredClone(f.doc);
    const result = await createProjectCitationExporter(f.backend).render(binding, request());
    assert.equal(result.ok, false, 'A current anchor and retained source must not qualify a slide without any emitted authored primitive.');
    assert.equal(result.code, 'notes-unsafe');
    assert.equal(Object.hasOwn(result, 'bytes'), false);
    assert.deepEqual(f.doc, before);
  });
}
