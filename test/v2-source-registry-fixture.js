import { canonicalWebSource } from '../packages/tools/web-source.ts';
import { webSourceId } from '../packages/model/source-identity.ts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
export function source(projectId = 'project', n = 0, extra = {}) {
  const s = { projectId, kind: 'web', url: `https://example.org/${n}`, title: `Evidence ${n}`, excerpt: 'Measured evidence.',
    searchProvider: 'fixture-search', retrievedAt: '2026-10-28T00:00:00Z', ...extra };
  return canonicalWebSource({ id: webSourceId(s), ...s });
}
export async function child(store, binding, env, operation, ids=[]) {
  const module = new URL(`../src/projects/${store}.js`,import.meta.url).href;
  const registry = new URL('../src/projects/sources.js',import.meta.url).href;
  const code=`import * as store from ${JSON.stringify(module)};import {createSourceRegistry} from ${JSON.stringify(registry)};
    const binding=JSON.parse(process.env.FORGE_SOURCE_TEST_BINDING);
    const result=${operation==='delete'?'await store.deleteProject(binding)':'await createSourceRegistry(store).resolve(binding,{generation:0,ids:JSON.parse(process.env.FORGE_SOURCE_TEST_IDS)})'};
    console.log(JSON.stringify(result));await store.closeProjectStore();`;
  const result=await promisify(execFile)(process.execPath,['--input-type=module','-e',code],{env:{...process.env,...env,FORGE_SOURCE_TEST_BINDING:JSON.stringify(binding),FORGE_SOURCE_TEST_IDS:JSON.stringify(ids)},timeout:10000});
  return JSON.parse(result.stdout.trim());
}
