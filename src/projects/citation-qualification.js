import { validateProjectDocument } from '../../packages/projects/document.js';
import { indexCitationTargets } from '../../packages/model/citation-targets.ts';
import { citationContentDigests } from '../../packages/model/citation-content.ts';
import { isSystemChrome } from '../../packages/model/scene-constants.ts';
import { snippetRangeStatus } from './snippet-locator.js';
import { SOURCE_LIMITS,catalog,expected,bodies,refuse } from './source-read.js';

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


// Callers supply one canonical owner-qualified transaction, never composed public reads.
export async function qualifyCitationSnapshot(tx,binding,request,operation='render') {
      const doc=tx.doc;
      if(doc.id !== binding.id || !(await validateProjectDocument(doc)).ok)refuse('invalid-state');
      if(request && doc.revision !== request.projectRevision)refuse('stale-project');
      const c=await catalog(tx,binding);
      if(request)expected(c,{generation:request.sourceGeneration,revision:request.sourceRevision});
      const citations=doc.scenes.flatMap((scene,sceneIndex)=>(scene.citations ?? []).map((citation,citationIndex)=>({scene,sceneIndex,citation,citationIndex})));
      const metadata={ok:true,snapshot:revisionSnapshot(binding,doc,c),citationCount:citations.length};
      if(operation === 'inspect')return {doc,c,metadata};
      if(operation === 'uncited') {
        if(citations.length)refuse('consent-required');
        return {doc,c,metadata,references:[],sourceIds:[]};
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
      return {doc,c,metadata,references,rows,sourceIds:citations.map(r=>r.citation.source.id)};
}
