import { indexCitationTargets } from '../../packages/model/citation-targets.ts';
import { citationContentDigests } from '../../packages/model/citation-content.ts';
import { refuse } from './source-read.js';
import { snippetRangeStatus } from './snippet-locator.js';
export async function observed(scenes,targets){
 try{const rows=indexCitationTargets(scenes,targets,true);return {rows,digests:await citationContentDigests(rows)};}
 catch(error){if(error?.code==='target-budget-exceeded')refuse('target-budget-exceeded');throw error;}
}
export async function observeSavedTargets(scenes,selected){
 const scoped=selected.filter(({scene,citation:r})=>r.target.slideId===scene.id);
 const {rows,digests}=await observed(scenes,scoped.map(r=>r.citation.target));
 return new Map(scoped.map((r,i)=>[r.citation.id,{row:rows[i],digest:digests[i]}]));
}
export function citationObservations(selected,c,retained,observations){
 return selected.map(({citation:r})=>{
  const observation=observations.get(r.id),target=observation?.row.status??'scope-mismatch';
  const source=r.source.generation!==c.generation?'stale-generation':retained.has(r.source.id)?'retained':'missing';
  const locator=r.locator?(source!=='retained'?'unavailable':snippetRangeStatus(r.locator,retained.get(r.source.id).excerpt)):'not-requested';
  return {id:r.id,target,content:target!=='present'?'unavailable':observation.digest===r.anchor.digest?'current':'changed',source,locator,claimSupport:'not-assessed'};
 });
}
