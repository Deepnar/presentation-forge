import { cloneJson } from '../../packages/tools/json.ts';
import { createDocument } from '../../packages/model/engine.ts';
import { observed,observeSavedTargets,citationObservations } from './citation-observations.js';
import { SOURCE_LIMITS, catalog, expected, bodies, refuse, sourceRefusalCode } from './source-read.js';
import { validSnippetLocator, snippetLocatorStatus } from './snippet-locator.js';

const integer = v => Number.isSafeInteger(v) && v >= 0;
const id = v => typeof v === 'string' && v.length > 0 && v.length <= 200;
const citationId = v => typeof v === 'string' && /^cit_[0-9a-f]{32}$/.test(v);
const sourceId = v => typeof v === 'string' && /^src_[0-9a-f]{64}$/.test(v);
const bytes = v => Buffer.byteLength(JSON.stringify(v));
function keys(v, required, optional = []) {
  return v && typeof v === 'object' && !Array.isArray(v) && required.every(k => Object.hasOwn(v,k)) &&
    Object.keys(v).every(k => [...required,...optional].includes(k));
}
function frozen(v) { if (v && typeof v === 'object') { Object.values(v).forEach(frozen); Object.freeze(v); } return v; }
function copy(v, maximum = SOURCE_LIMITS.dtoBytes) {
  try { const out = cloneJson(v,maximum); if (bytes(out) > maximum) refuse('invalid-request'); return out; }
  catch { return refuse('invalid-request'); }
}
function validTarget(v) {
  return v && ['slide','element'].includes(v.kind) &&
    keys(v,v.kind === 'slide' ? ['kind','slideId'] : ['kind','slideId','elementId']) &&
    id(v.slideId) && (v.kind === 'slide' || id(v.elementId));
}
function capture(operation, identity, input) {
  const binding = copy(identity,1024), request = copy(input);
  if (!keys(binding,['id','owner']) || typeof binding.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(binding.id) ||
    binding.owner !== null && (typeof binding.owner !== 'string' || !binding.owner.trim() || binding.owner.length > 128)) refuse('invalid-request');
  const field = operation === 'attach' ? 'changes' : 'citationIds';
  const required = ['projectRevision',field,...(operation === 'remove' ? [] : ['sourceGeneration','sourceRevision'])];
  if (!keys(request,required) || !integer(request.projectRevision) || operation !== 'remove' &&
    (!integer(request.sourceGeneration) || !integer(request.sourceRevision))) refuse('invalid-request');
  const rows = request[field];
  if (!Array.isArray(rows) || !rows.length || rows.length > SOURCE_LIMITS.batch) refuse('invalid-request');
  if (operation === 'attach') {
    for (const c of rows) if (!keys(c,['mode','id','target','sourceId'],['locator']) ||
      !['add','replace'].includes(c.mode) || !citationId(c.id) || !validTarget(c.target) || !sourceId(c.sourceId) ||
      Object.hasOwn(c,'locator') && !validSnippetLocator(c.locator)) refuse('invalid-request');
  } else if (!rows.every(citationId)) refuse('invalid-request');
  const ids = operation === 'attach' ? rows.map(c => c.id) : rows;
  if (new Set(ids).size !== ids.length) refuse('invalid-request');
  return { binding: frozen(binding), request: frozen(request) };
}

const messages = Object.freeze({
  'invalid-request': 'Provide a bounded citation request with current snapshot identity.',
  'not-found': 'This project is not available.',
  'stale-project': 'The saved project changed; read its current revision.',
  'stale-catalog': 'The source catalog changed; read its current snapshot.',
  'invalid-state': 'Saved citation state is invalid; no result was published.',
  'citation-missing': 'A requested citation is not available in this project.',
  'citation-conflict': 'Citation identifiers or associations conflict with saved metadata.',
  'target-unavailable': 'An attachment target is missing, ambiguous or outside its scene.',
  'target-protected': 'An attachment target is hidden, locked or protected.',
  'source-unavailable': 'An attachment source is not retained in the current catalog.',
  'locator-unmatched': 'The requested quote does not exactly match a supported retained snippet range.',
  'target-budget-exceeded': 'Citation targets exceed the traversal or content projection limit.',
  'engine-refused': 'The command engine refused citation changes; no change was committed.',
  'result-too-large': 'The complete citation result exceeds its output limit.',
  'storage-unavailable': 'Citation storage is unavailable.',
});
function savedCitations(doc) {
  return new Map(doc.scenes.flatMap(scene => (scene.citations ?? []).map(citation => [citation.id,{scene,citation}])));
}
function output(value) {
  const s = value.snapshot;
  if (!s || !keys(s,['projectId','projectRevision'],['sourceGeneration','sourceRevision']) ||
    typeof s.projectId !== 'string' || !integer(s.projectRevision) ||
    Object.hasOwn(s,'sourceGeneration') !== Object.hasOwn(s,'sourceRevision') ||
    Object.hasOwn(s,'sourceGeneration') && (!integer(s.sourceGeneration) || !integer(s.sourceRevision))) refuse('invalid-state');
  if (Object.hasOwn(value,'citations')) {
    if (!keys(value,['ok','snapshot','citations']) || value.ok !== true || !Array.isArray(value.citations) ||
      value.citations.length < 1 || value.citations.length > SOURCE_LIMITS.batch || value.citations.some(r =>
        !keys(r,['id','target','content','source','locator','claimSupport']) || !citationId(r.id) ||
        !['present','missing','ambiguous','scope-mismatch'].includes(r.target) ||
        !['current','changed','unavailable'].includes(r.content) || !['retained','missing','stale-generation'].includes(r.source) ||
        !['not-requested','range-valid','invalid','unavailable','unsupported-excerpt'].includes(r.locator) || r.claimSupport !== 'not-assessed')) refuse('invalid-state');
  } else if (!keys(value,['ok','snapshot','changed','citationIds']) || value.ok !== true || typeof value.changed !== 'boolean' ||
    !Array.isArray(value.citationIds) || !value.citationIds.length || value.citationIds.length > SOURCE_LIMITS.batch || !value.citationIds.every(citationId)) refuse('invalid-state');
  if (bytes(value) > SOURCE_LIMITS.dtoBytes) refuse('result-too-large');
  return frozen(value);
}
function snapshot(binding, revision, c) {
  return { projectId: binding.id, projectRevision: revision, ...(c ? { sourceGeneration: c.generation, sourceRevision: c.revision } : {}) };
}

export function createProjectCitations(backend) {
  const write = backend.withCitationTransaction.bind(backend);
  const read = backend.withCitationReadTransaction.bind(backend);
  async function run(operation, identity, input) {
    try {
      const { binding, request } = capture(operation,identity,input);
      return await (operation === 'inspect' ? read : write)(binding,async tx => {
        if (tx.doc.id !== binding.id || !integer(tx.doc.revision) || !Array.isArray(tx.doc.scenes)) refuse('invalid-state');
        if (tx.doc.revision !== request.projectRevision) refuse('stale-project');
        const saved = savedCitations(tx.doc);
        const ids = operation === 'attach' ? request.changes.map(c => c.id) : request.citationIds;
        if (operation !== 'attach' && ids.some(id => !saved.has(id))) refuse('citation-missing');
        let c;
        if (operation !== 'remove') {
          c = await catalog(tx,binding);
          expected(c,{generation:request.sourceGeneration,revision:request.sourceRevision});
        }
        if (operation === 'inspect') {
          const selected = ids.map(id => saved.get(id));
          const observations = await observeSavedTargets(tx.doc.scenes,selected);
          const retained = await bodies(tx,binding,[...new Set(selected.filter(r => r.citation.source.generation === c.generation).map(r => r.citation.source.id))]);
          return output({ok:true,snapshot:snapshot(binding,tx.doc.revision,c),citations:citationObservations(selected,c,retained,observations)});
        }
        const ops = [];
        if (operation === 'attach') {
          for (const change of request.changes) if ((change.mode === 'add') === saved.has(change.id)) refuse('citation-conflict');
          const {rows,digests} = await observed(tx.doc.scenes,request.changes.map(r => r.target));
          if (rows.some(r => r.status !== 'present')) refuse('target-unavailable');
          if (rows.some(r => r.blocked)) refuse('target-protected');
          const retained = await bodies(tx,binding,[...new Set(request.changes.map(r => r.sourceId))]);
          for (const [i,change] of request.changes.entries()) {
            const source = retained.get(change.sourceId);
            if (!source) refuse('source-unavailable');
            if (change.locator && snippetLocatorStatus(change.locator,source.excerpt) !== 'matched') refuse('locator-unmatched');
            const citation = {version:1,id:change.id,target:change.target,
              source:{projectId:binding.id,id:change.sourceId,generation:c.generation},
              anchor:{kind:'content-sha256-v1',digest:digests[i]},
              ...(change.locator ? {locator:{kind:change.locator.kind,startByte:change.locator.startByte,endByte:change.locator.endByte}} : {})};
            const previous = saved.get(change.id), moved = previous && previous.scene.id !== change.target.slideId;
            if (moved) ops.push({slideId:previous.scene.id,op:{type:'citation.remove',id:change.id}});
            ops.push({slideId:change.target.slideId,op:{type:'citation.put',mode:moved ? 'add' : change.mode,citation}});
          }
        } else for (const id of ids) ops.push({slideId:saved.get(id).scene.id,op:{type:'citation.remove',id}});
        const engine = await createDocument(tx.doc.scenes), envelopeId = 'citation-'+operation+'-'+tx.doc.revision;
        const result = await engine.applyBatch({id:envelopeId,actor:'human',baseRevision:0,ops});
        if (!result.ok) refuse('engine-refused');
        const changed = result.noop !== true;
        const revision = changed ? await tx.saveScenes(engine.snapshot().scenes,{actor:'human',envelopeIds:[envelopeId],
          summary:operation === 'attach' ? 'Update citation metadata' : 'Remove citation metadata',saveOrigin:'manual'}) : tx.doc.revision;
        return output({ok:true,snapshot:snapshot(binding,revision,c),changed,citationIds:ids});
      });
    } catch (error) {
      const privateCode = sourceRefusalCode(error);
      const code = privateCode && Object.hasOwn(messages,privateCode) ? privateCode :
        error?.code === 'not-found' ? 'not-found' : error?.code === 'invalid-document' ? 'invalid-state' : 'storage-unavailable';
      return frozen({ok:false,code,message:messages[code]});
    }
  }
  return Object.freeze({ attach:(binding,input)=>run('attach',binding,input), remove:(binding,input)=>run('remove',binding,input), inspect:(binding,input)=>run('inspect',binding,input) });
}
