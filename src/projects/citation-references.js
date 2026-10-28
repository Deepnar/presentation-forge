import { cloneJson } from '../../packages/tools/json.ts';
import { SOURCE_LIMITS, catalog, expected, bodies, refuse, sourceRefusalCode } from './source-read.js';
import { validSnippetLocator, snippetLocatorStatus } from './snippet-locator.js';

const integer = value => Number.isSafeInteger(value) && value >= 0;
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 200;
const utf8 = value => Buffer.byteLength(JSON.stringify(value));
function frozen(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}
function keys(value, required, optional = []) {
  return value && typeof value === 'object' && !Array.isArray(value) && required.every(k => Object.hasOwn(value,k)) &&
    Object.keys(value).every(k => [...required,...optional].includes(k));
}
function copy(value, maximum = SOURCE_LIMITS.dtoBytes) {
  try {
    const result = cloneJson(value,maximum);
    if (utf8(result) > maximum) refuse('invalid-request');
    return result;
  } catch { return refuse('invalid-request'); }
}
function capture(identity, input) {
  const binding = copy(identity,1024), request = copy(input);
  if (!keys(binding,['id','owner']) || typeof binding.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(binding.id) ||
    binding.owner !== null && (typeof binding.owner !== 'string' || !binding.owner.trim() || binding.owner.length > 128)) refuse('invalid-request');
  if (!keys(request,['projectRevision','sourceGeneration','sourceRevision','references']) ||
    !['projectRevision','sourceGeneration','sourceRevision'].every(k => integer(request[k])) ||
    !Array.isArray(request.references) || !request.references.length || request.references.length > SOURCE_LIMITS.batch) refuse('invalid-request');
  const seen = new Set();
  for (const ref of request.references) {
    if (!keys(ref,['target','sourceId'],['locator']) || typeof ref.sourceId !== 'string' || !/^src_[0-9a-f]{64}$/.test(ref.sourceId)) refuse('invalid-request');
    const target = ref.target;
    if (!target || !['slide','element'].includes(target.kind) ||
      !keys(target,target.kind === 'slide' ? ['kind','slideId'] : ['kind','slideId','elementId']) ||
      !id(target.slideId) || target.kind === 'element' && !id(target.elementId)) refuse('invalid-request');
    if (Object.hasOwn(ref,'locator') && !validSnippetLocator(ref.locator)) refuse('invalid-request');
    const tuple = JSON.stringify([target.kind,target.slideId,target.elementId ?? null,ref.sourceId,
      ref.locator ? [ref.locator.startByte,ref.locator.endByte,ref.locator.quote] : null]);
    if (seen.has(tuple)) refuse('invalid-request');
    seen.add(tuple);
  }
  return { binding: frozen(binding), request: frozen(request) };
}

function targets(doc, references) {
  const slides = new Map(), counts = new Map(), wanted = new Map();
  for (const scene of doc.scenes) {
    counts.set(scene.id,(counts.get(scene.id) ?? 0) + 1);
    slides.set(scene.id,scene);
  }
  for (const { target } of references) if (target.kind === 'element') {
    if (!wanted.has(target.slideId)) wanted.set(target.slideId,new Map());
    wanted.get(target.slideId).set(target.elementId,0);
  }
  let visited = 0;
  for (const [slideId, ids] of wanted) {
    if (counts.get(slideId) !== 1) continue;
    const stack = [{ elements: slides.get(slideId).elements, index: 0, depth: 0 }];
    while (stack.length) {
      const frame = stack.at(-1);
      if (frame.index === frame.elements.length) { stack.pop(); continue; }
      if (++visited > 10000 || frame.depth > 128) refuse('target-budget-exceeded');
      const el = frame.elements[frame.index++];
      if (ids.has(el.id)) ids.set(el.id,Math.min(2,ids.get(el.id) + 1));
      if (el.group?.children?.length) stack.push({ elements: el.group.children, index: 0, depth: frame.depth + 1 });
    }
  }
  return references.map(({ target }) => {
    const n = counts.get(target.slideId) ?? 0;
    if (n !== 1) return n ? 'ambiguous' : 'missing';
    const matches = target.kind === 'slide' ? 1 : wanted.get(target.slideId).get(target.elementId);
    return matches > 1 ? 'ambiguous' : matches === 1 ? 'present' : 'missing';
  });
}

function validResult(value, count) {
  const target = ['present','missing','ambiguous'], source = ['retained','missing'];
  const locator = ['not-requested','matched','mismatch','invalid','unavailable','unsupported-excerpt'];
  return keys(value,['ok','snapshot','references']) && value.ok === true &&
    keys(value.snapshot,['projectId','projectRevision','sourceGeneration','sourceRevision']) &&
    typeof value.snapshot.projectId === 'string' && ['projectRevision','sourceGeneration','sourceRevision'].every(k => integer(value.snapshot[k])) &&
    Array.isArray(value.references) && value.references.length === count && value.references.every((ref,index) =>
      keys(ref,['index','target','source','locator','claimSupport']) && ref.index === index && target.includes(ref.target) &&
      source.includes(ref.source) && locator.includes(ref.locator) && ref.claimSupport === 'not-assessed');
}
const messages = Object.freeze({
  'invalid-request': 'Provide a bounded citation reference request with current project and catalog identity.',
  'not-found': 'This project is not available.',
  'stale-project': 'The saved project changed; read its current revision.',
  'stale-catalog': 'The source catalog changed; read its current snapshot.',
  'invalid-state': 'The saved citation reference state is invalid; no result was published.',
  'target-budget-exceeded': 'The saved targets exceed the citation traversal limit.',
  'result-too-large': 'The complete citation result exceeds its output limit.',
  'storage-unavailable': 'Citation reference storage is unavailable.',
});

export function createCitationReferenceChecker(backend) {
  const transact = backend.withCitationReadTransaction.bind(backend);
  return Object.freeze({ async check(identity, input) {
    try {
      const { binding, request } = capture(identity,input);
      return await transact(binding,async tx => {
        if (tx.doc.id !== binding.id || !integer(tx.doc.revision) || !Array.isArray(tx.doc.scenes) ||
          !tx.doc.scenes.length || tx.doc.scenes.length > 120) refuse('invalid-state');
        if (tx.doc.revision !== request.projectRevision) refuse('stale-project');
        const c = await catalog(tx,binding);
        expected(c,{ generation: request.sourceGeneration, revision: request.sourceRevision });
        const observed = targets(tx.doc,request.references);
        const ids = [...new Set(request.references.map(ref => ref.sourceId))];
        const retained = await bodies(tx,binding,ids);
        const result = { ok: true, snapshot: { projectId: binding.id, projectRevision: tx.doc.revision,
          sourceGeneration: c.generation, sourceRevision: c.revision }, references: request.references.map((ref,index) => ({
          index, target: observed[index], source: retained.has(ref.sourceId) ? 'retained' : 'missing',
          locator: snippetLocatorStatus(ref.locator,retained.get(ref.sourceId)?.excerpt), claimSupport: 'not-assessed',
        })) };
        if (!validResult(result,request.references.length)) refuse('invalid-state');
        if (utf8(result) > SOURCE_LIMITS.dtoBytes) refuse('result-too-large');
        return frozen(result);
      });
    } catch (error) {
      const privateCode = sourceRefusalCode(error);
      const code = privateCode && Object.hasOwn(messages,privateCode) ? privateCode :
        error?.code === 'not-found' ? 'not-found' : error?.code === 'invalid-document' ? 'invalid-state' : 'storage-unavailable';
      return frozen({ ok: false, code, message: messages[code] });
    }
  } });
}
