import { cloneJson } from '../../packages/tools/json.ts';
import { validateProjectDocument, validProjectId } from '../../packages/projects/document.js';
import { indexCitationTargets } from '../../packages/model/citation-targets.ts';
import { citationContentDigests } from '../../packages/model/citation-content.ts';
import { isSystemChrome } from '../../packages/model/scene-constants.ts';
import { createCitationNotesRenderer, renderPptx } from '../../packages/renderer-pptx/render.ts';
import { SOURCE_NOTES_NOTICE } from '../../packages/renderer-pptx/source-notes.ts';
import { SOURCE_LIMITS, catalog, expected, bodies, refuse, sourceRefusalCode } from './source-read.js';
import { snippetRangeStatus } from './snippet-locator.js';

const integer = v => Number.isSafeInteger(v) && v >= 0;
const exact = (v, fields) => v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).length === fields.length && fields.every(k => Object.hasOwn(v,k));
function freeze(v) { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }
const messages = Object.freeze({
  'invalid-request':'Provide the saved project snapshot and explicit source-notes consent.',
  'not-found':'This project is not available.',
  'stale-project':'The saved project changed; inspect it again before exporting.',
  'stale-catalog':'The retained sources changed; inspect them again before exporting.',
  'consent-required':'Exporting retained source titles and full URLs requires --include-source-notes.',
  'invalid-state':'Saved project or source state is invalid; no export was produced.',
  'target-unavailable':'A cited target is missing, ambiguous or outside its slide.',
  'target-hidden':'A cited scope is hidden or contains hidden content.',
  'target-chrome':'A cited target belongs to protected system furniture.',
  'content-changed':'Cited content changed after its source was attached.',
  'source-unavailable':'A cited source is not retained in the current catalog.',
  'locator-invalid':'A saved source range is invalid or unsupported.',
  'target-budget-exceeded':'Citation target traversal or content exceeds its limit.',
  'notes-unsafe':'Complete source notes could not be safely mapped to native objects.',
  'notes-capacity':'Complete source notes exceed the export limit.',
  'export-unsafe':'This saved scene cannot be safely exported to native PowerPoint.',
  'storage-unavailable':'Project export is unavailable.',
});
function capture(identity, input, operation) {
  let binding, request;
  try { binding=cloneJson(identity,2048); request=input === undefined ? undefined : cloneJson(input,2048); }
  catch { refuse('invalid-request'); }
  if (!exact(binding,['id','owner']) || !validProjectId(binding.id) ||
    !(binding.owner === null || typeof binding.owner === 'string' && binding.owner.length > 0 && binding.owner.length <= 320)) refuse('invalid-request');
  if (operation === 'inspect') { if (input !== undefined) refuse('invalid-request'); }
  else {
    const fields=['projectRevision','sourceGeneration','sourceRevision',...(operation === 'render' ? ['disclosure'] : [])];
    if (!exact(request,fields) || !['projectRevision','sourceGeneration','sourceRevision'].every(k=>integer(request[k])) ||
      operation === 'render' && request.disclosure !== 'source-title-url-v1') refuse('invalid-request');
  }
  return {binding:freeze(binding),request:freeze(request)};
}
function visible(row) {
  let targetFound=!row.element, inherited;
  const stack=row.scene.elements.map(element=>({element,hidden:false,chrome:false}));
  while(stack.length) {
    const f=stack.pop(), e=f.element, hidden=f.hidden || e.hidden === true, chrome=f.chrome || isSystemChrome(e);
    if(e === row.element) { targetFound=true; inherited={hidden,chrome}; }
    for(const element of e.group?.children ?? [])stack.push({element,hidden,chrome});
  }
  if(!targetFound)refuse('target-unavailable');
  if(inherited?.chrome)refuse('target-chrome');
  if(inherited?.hidden)refuse('target-hidden');
  // Chrome never belongs to the anchored citation scope, but still renders.
  const scope=row.element ? [row.element] : row.scene.elements;
  const pending=[...scope];
  while(pending.length) {
    const e=pending.pop();if(isSystemChrome(e))continue;
    if(e.hidden === true)refuse('target-hidden');
    pending.push(...(e.group?.children ?? []));
  }
}
const revisionSnapshot = (binding,doc,c) => ({projectId:binding.id,projectRevision:doc.revision,sourceGeneration:c.generation,sourceRevision:c.revision});

export function createProjectCitationExporter(backend) {
  const read=backend.withCitationReadTransaction.bind(backend);
  async function qualify(context) {
    const {binding,request,operation}=context;
    return read(binding,async tx=>{
      const doc=tx.doc;
      if(doc.id !== binding.id || !(await validateProjectDocument(doc)).ok)refuse('invalid-state');
      if(request && doc.revision !== request.projectRevision)refuse('stale-project');
      const c=await catalog(tx,binding);
      if(request)expected(c,{generation:request.sourceGeneration,revision:request.sourceRevision});
      const citations=doc.scenes.flatMap((scene,sceneIndex)=>(scene.citations ?? []).map((citation,citationIndex)=>({scene,sceneIndex,citation,citationIndex})));
      context.metadata=freeze({ok:true,snapshot:revisionSnapshot(binding,doc,c),citationCount:citations.length});
      if(operation === 'inspect')return context.metadata;
      if(operation === 'uncited') {
        if(citations.length)refuse('consent-required');
        return freeze(structuredClone({scenes:doc.scenes,title:doc.title}));
      }
      if(citations.some(r=>r.citation.target.slideId !== r.scene.id))refuse('target-unavailable');
      const rows=indexCitationTargets(doc.scenes,citations.map(r=>r.citation.target),true);
      if(rows.some(r=>r.status !== 'present'))refuse('target-unavailable');
      rows.forEach(visible);
      const digests=await citationContentDigests(rows);
      if(citations.some((r,i)=>r.citation.anchor.digest !== digests[i]))refuse('content-changed');
      if(citations.some(r=>r.citation.source.generation !== c.generation))refuse('stale-catalog');
      const ids=[...new Set(citations.map(r=>r.citation.source.id))],retained=new Map();
      for(let i=0;i<ids.length;i+=SOURCE_LIMITS.batch) {
        const page=await bodies(tx,binding,ids.slice(i,i+SOURCE_LIMITS.batch));
        for(const [id,source] of page)retained.set(id,source);
      }
      const references=citations.map(({citation:r,sceneIndex,citationIndex})=>{
        const source=retained.get(r.source.id);
        if(!source)refuse('source-unavailable');
        if(r.locator && snippetRangeStatus(r.locator,source.excerpt) !== 'range-valid')refuse('locator-invalid');
        return {sceneIndex,citationIndex,title:source.title,url:source.url};
      });
      return freeze(structuredClone({scenes:doc.scenes,title:doc.title,references}));
    });
  }
  const native=createCitationNotesRenderer(qualify);
  async function run(operation,identity,input) {
    try {
      // The full request is copied before the first asynchronous boundary.
      const context={...capture(identity,input,operation),operation};
      if(operation === 'inspect')return await qualify(context);
      let bytes;
      if(operation === 'uncited') { const snapshot=await qualify(context);bytes=await renderPptx(snapshot.scenes,{title:snapshot.title}); }
      else bytes=await native(context);
      return { ...context.metadata, bytes, ...(operation === 'render' ? {notice:SOURCE_NOTES_NOTICE} : {}) };
    } catch(error) {
      const privateCode=sourceRefusalCode(error);
      const code=privateCode && Object.hasOwn(messages,privateCode) ? privateCode :
        ['not-found','target-budget-exceeded','notes-unsafe','notes-capacity'].includes(error?.code) ? error.code :
        error?.name === 'ExportUnsafeError' ? 'export-unsafe' : error?.code === 'invalid-document' ? 'invalid-state' : 'storage-unavailable';
      return freeze({ok:false,code,message:messages[code]});
    }
  }
  return Object.freeze({inspect:(binding)=>run('inspect',binding),render:(binding,input)=>run('render',binding,input),
    renderUncited:(binding,input)=>run('uncited',binding,input)});
}
