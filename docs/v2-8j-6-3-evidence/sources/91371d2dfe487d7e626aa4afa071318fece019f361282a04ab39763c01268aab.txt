import { createHash } from 'node:crypto';
import { cloneJson } from '../../packages/tools/json.ts';
import { validateProjectDocument,validProjectId } from '../../packages/projects/document.js';
import { VIEW_LIMITS,safeInteger,exactKeys,targetId,validViewCursor,validCitationView } from '../../packages/projects/citation-view-contract.js';
import { indexCitationTargets } from '../../packages/model/citation-targets.ts';
import { catalog,bodies,refuse,sourceRefusalCode } from './source-read.js';
import { observeSavedTargets,citationObservations } from './citation-observations.js';
export const VIEW_MESSAGES=Object.freeze({'invalid-request':'Provide a bounded saved-reference request.','not-found':'This project is not available.','stale-project':'The saved project changed. Reopen it before reading sources.','stale-catalog':'Retained sources changed. Refresh sources explicitly.','invalid-state':'Saved reference state cannot be read safely.','target-budget-exceeded':'Saved references exceed the inspection limit.','result-too-large':'The complete reference page exceeds its limit.','storage-unavailable':'Saved references are unavailable.'});
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
function capture(identity,input){
 let binding,request;try{binding=cloneJson(identity,1024);request=cloneJson(input,8192);}catch{refuse('invalid-request');}
 if(!exactKeys(binding,['id','owner'])||!validProjectId(binding.id)||binding.owner!==null&&(typeof binding.owner!=='string'||!binding.owner.trim()||binding.owner.length>128)||!exactKeys(request,['projectRevision','slideId'],['elementId','cursor'])||!safeInteger(request.projectRevision)||!targetId(request.slideId)||Object.hasOwn(request,'elementId')&&!targetId(request.elementId)||Object.hasOwn(request,'cursor')&&!validViewCursor(request.cursor))refuse('invalid-request');
 return {binding:freeze(binding),request:freeze(request)};
}
function decodeCursor(value){try{const bytes=Buffer.from(value,'base64url');if(bytes.toString('base64url')!==value)refuse('invalid-request');const c=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!exactKeys(c,['v','p','g','r','h','o'])||c.v!==1||!['p','g','r','o'].every(k=>safeInteger(c[k]))||c.o<24||c.o>128||c.o%24!==0||typeof c.h!=='string'||!/^[0-9a-f]{64}$/.test(c.h))refuse('invalid-request');return c;}catch{refuse('invalid-request');}}
export function createCitationView(backend){
 return Object.freeze({async read(identity,input){try{
  const {binding,request}=capture(identity,input),cursor=request.cursor?decodeCursor(request.cursor):null;
  const hash=createHash('sha256').update(JSON.stringify([binding.id,request.projectRevision,request.slideId,request.elementId??null])).digest('hex');
  if(cursor&&(cursor.p!==request.projectRevision||cursor.h!==hash))refuse('invalid-request');
  return await backend.withCitationReadTransaction(binding,async tx=>{
   const doc=tx.doc;if(doc.id!==binding.id||!(await validateProjectDocument(doc)).ok)refuse('invalid-state');
   if(doc.revision!==request.projectRevision)refuse('stale-project');
   const c=await catalog(tx,binding);if(cursor&&(cursor.g!==c.generation||cursor.r!==c.revision))refuse('stale-catalog');
   const scene=doc.scenes.find(s=>s.id===request.slideId);
   const target=scene?indexCitationTargets(doc.scenes,[request.elementId?{kind:'element',slideId:request.slideId,elementId:request.elementId}:{kind:'slide',slideId:request.slideId}],true)[0]:null;
   const present=target?.status==='present',all=scene?(scene.citations??[]).filter(r=>!request.elementId||(r.target.kind==='element'&&r.target.elementId===request.elementId)):[];
   const rows=all.map(citation=>({scene,citation})),offset=cursor?.o??0;
   if(cursor&&(!present||offset>=rows.length))refuse('invalid-request');
   const selected=present?rows.slice(offset,offset+VIEW_LIMITS.page):[];
   const observations=await observeSavedTargets(doc.scenes,selected);
   const retained=await bodies(tx,binding,[...new Set(selected.filter(({citation:r})=>r.source.generation===c.generation).map(({citation:r})=>r.source.id))]);
   const statuses=citationObservations(selected,c,retained,observations),next=offset+selected.length;
   const result={ok:true,snapshot:{projectId:binding.id,projectRevision:doc.revision,sourceGeneration:c.generation,sourceRevision:c.revision},scope:{slideId:request.slideId,elementId:request.elementId??null,status:present?'present':'not-saved'},total:present?rows.length:0,rows:statuses.map((r,i)=>{
    const source=r.source==='retained'?retained.get(selected[i].citation.source.id):null;
    return {id:r.id,target:structuredClone(selected[i].citation.target),targetStatus:r.target,contentStatus:r.content,sourceStatus:r.source,locatorStatus:r.locator,claimSupport:r.claimSupport,...(source?{reference:{title:source.title,url:source.url}}:{})};
   }),nextCursor:present&&next<rows.length?Buffer.from(JSON.stringify({v:1,p:doc.revision,g:c.generation,r:c.revision,h:hash,o:next})).toString('base64url'):null};
   if(!validCitationView(result,{id:binding.id,revision:doc.revision,...request}))refuse('invalid-state');
   if(Buffer.byteLength(JSON.stringify(result))>VIEW_LIMITS.bytes)refuse('result-too-large');return freeze(result);
  });
 }catch(error){const code=sourceRefusalCode(error)??(error?.code==='not-found'?'not-found':error?.code==='invalid-document'?'invalid-state':error?.code==='target-budget-exceeded'?'target-budget-exceeded':'storage-unavailable');return freeze({ok:false,code:Object.hasOwn(VIEW_MESSAGES,code)?code:'storage-unavailable',message:VIEW_MESSAGES[code]??VIEW_MESSAGES['storage-unavailable']});}}});
}
