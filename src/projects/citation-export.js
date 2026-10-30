import { qualifyCitationSnapshot } from './citation-qualification.js';
import { cloneJson } from '../../packages/tools/json.ts';
import { validProjectId } from '../../packages/projects/document.js';
import { createCitationNotesRenderer, renderPptx } from '../../packages/renderer-pptx/render.ts';
import { SOURCE_NOTES_NOTICE } from '../../packages/renderer-pptx/source-notes.ts';
import { refuse, sourceRefusalCode } from './source-read.js';

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

export function createProjectCitationExporter(backend) {
  const read=backend.withCitationReadTransaction.bind(backend);
  async function qualify(context) {
    const {binding,request,operation}=context;
    return read(binding,async tx=>{
      const {doc,metadata,references}=await qualifyCitationSnapshot(tx,binding,request,operation);
      context.metadata=freeze(metadata);
      if(operation==='inspect')return context.metadata;
      return freeze(structuredClone({scenes:doc.scenes,title:doc.title,...(operation==='render'?{references}:{})}));
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
