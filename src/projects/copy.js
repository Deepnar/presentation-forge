import { buildProjectDocument, validateProjectDocument, validProjectId, MAX_PROJECT_JSON_CHARS } from '../../packages/projects/document.js';
import { canonicalWebSource, parsedWebSource } from '../../packages/tools/web-source.ts';
import { webSourceId } from '../../packages/model/source-identity.ts';
import { SOURCE_LIMITS, catalog, bodies, refuse, sourceRefusalCode } from './source-read.js';

export const COPY_INPUT_BYTES = 8 * 1024 * 1024;
const utf8 = value => Buffer.byteLength(JSON.stringify(value));
const frozen = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
};
const keys = (value, required, optional = []) => value && typeof value === 'object' && !Array.isArray(value) &&
  required.every(k => Object.hasOwn(value,k)) && Object.keys(value).every(k => [...required,...optional].includes(k));

// Projects need a larger traversal budget than tool DTOs, with the same accessor fence.
function captureJson(input, chars = MAX_PROJECT_JSON_CHARS) {
  let nodes = 0, length = 0;
  const seen = new Set();
  function visit(value, depth) {
    if (++nodes > 1000000 || depth > 128) refuse('invalid-request');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') { length += value.length; if (length > chars) refuse('capacity-exceeded'); return value; }
    if (!value || typeof value !== 'object' || seen.has(value)) refuse('invalid-request');
    const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== (array ? Array.prototype : Object.prototype)) refuse('invalid-request');
    seen.add(value);
    const out = array ? [] : Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || ['__proto__','constructor','prototype'].includes(key) ||
        array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) refuse('invalid-request');
      const descriptor = Object.getOwnPropertyDescriptor(value,key);
      if (!descriptor.enumerable || !Object.hasOwn(descriptor,'value')) refuse('invalid-request');
      length += key.length; if (length > chars) refuse('capacity-exceeded');
      out[key] = visit(descriptor.value,depth + 1);
    }
    if (array && Object.keys(out).length !== value.length) refuse('invalid-request');
    seen.delete(value);
    return out;
  }
  const result = visit(input,0), json = JSON.stringify(result);
  if (json.length > chars || Buffer.byteLength(json) > COPY_INPUT_BYTES) refuse('capacity-exceeded');
  return frozen(result);
}

const messages = Object.freeze({
  'invalid-request': 'Provide a valid bounded live project snapshot.',
  'not-found': 'This project is not available.',
  'source-unavailable': 'A referenced source is no longer available. The project was not copied.',
  'stale-catalog': 'A referenced source belongs to an earlier source generation. The project was not copied.',
  'invalid-state': 'The saved project or retained source catalog is invalid. The project was not copied.',
  'capacity-exceeded': 'The project or its retained sources exceed copy limits.',
  'storage-unavailable': 'Copy could not be confirmed. Check the workspace before trying again.',
  'copy-outcome-unknown': 'Copy may have completed. Check the workspace before trying again.',
});

export function createProjectCopier(backend) {
  return Object.freeze({ async copy(identity, input) {
    try {
      const binding = captureJson(identity,1024), request = captureJson(input);
      if (!keys(binding,['id','owner']) || !validProjectId(binding.id) ||
        binding.owner !== null && (typeof binding.owner !== 'string' || !binding.owner.trim() || binding.owner.length > 128) ||
        !keys(request,['title','scenes'],['theme']) || typeof request.title !== 'string' || !request.title.trim() || request.title.length > 200 ||
        !Array.isArray(request.scenes) || !request.scenes.length || request.scenes.length > 120) refuse('invalid-request');
      const live = { ...buildProjectDocument({ ...request, title: request.title.trim(), origin: { kind: 'mixed' } }), id: binding.id };
      if (!(await validateProjectDocument(live)).ok) refuse('invalid-request');
      return await backend.withCopyTransaction(binding, async tx => {
        const c = await catalog(tx,binding), ids = new Set();
        for (const scene of live.scenes) for (const citation of scene.citations ?? []) {
          if (citation.source.generation !== c.generation) refuse('stale-catalog');
          ids.add(citation.source.id);
        }
        if (ids.size > SOURCE_LIMITS.count) refuse('capacity-exceeded');
        const selected = [...ids].sort(), found = new Map();
        for (let i = 0; i < selected.length; i += SOURCE_LIMITS.batch) {
          for (const [id,source] of await bodies(tx,binding,selected.slice(i,i + SOURCE_LIMITS.batch))) found.set(id,source);
        }
        if (found.size !== ids.size) refuse('source-unavailable');
        const project = buildProjectDocument({ ...request, title: request.title.trim(), origin: { kind: 'mixed' } });
        const copied = new Map(); let bytes = 0;
        for (const [id,source] of found) {
          const rebound = { ...source, projectId: project.id };
          rebound.id = webSourceId(rebound);
          const canonical = canonicalWebSource(rebound), size = utf8(canonical);
          if (!parsedWebSource(canonical,project.id) || size > SOURCE_LIMITS.sourceBytes) refuse('capacity-exceeded');
          copied.set(id,canonical); bytes += size;
        }
        if (bytes > SOURCE_LIMITS.bytes) refuse('capacity-exceeded');
        for (const scene of project.scenes) for (const citation of scene.citations ?? [])
          citation.source = { projectId: project.id, id: copied.get(citation.source.id).id, generation: 0 };
        if (!(await validateProjectDocument(project)).ok) refuse('invalid-request');
        const result = { ok: true, project, copiedSources: copied.size, sourceSnapshot: {
          projectId: binding.id, projectRevision: tx.doc.revision, sourceGeneration: c.generation, sourceRevision: c.revision,
        } };
        if (utf8(result) > COPY_INPUT_BYTES) refuse('capacity-exceeded');
        await tx.insertCopy(project);
        if (copied.size) {
          await tx.query('INSERT INTO v2_project_source_catalog(project_id,generation,revision,count,bytes,policy_version) VALUES(?,?,?,?,?,?)',
            [project.id,0,1,copied.size,bytes,1]);
          for (const source of copied.values()) await tx.query('INSERT INTO v2_project_sources(project_id,source_id,payload,payload_bytes) VALUES(?,?,?,?)',
            [project.id,source.id,JSON.stringify(source),utf8(source)]);
        }
        return frozen(result);
      });
    } catch (error) {
      const code = sourceRefusalCode(error) ?? (['not-found','copy-outcome-unknown'].includes(error?.code) ? error.code :
        error?.code === 'invalid-document' ? 'invalid-state' : 'storage-unavailable');
      return frozen({ ok: false, code, message: messages[code] ?? messages['storage-unavailable'] });
    }
  } });
}
