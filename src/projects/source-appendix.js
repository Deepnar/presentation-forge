import { createHash } from 'node:crypto';
import { cloneJson } from '../../packages/tools/json.ts';
import { isSystemChrome } from '../../packages/model/scene-constants.ts';
import { createDocument } from '../../packages/model/engine.ts';
import { validateDesign } from '../../packages/model/validate.ts';
import { validateProjectDocument,validProjectId,MAX_PROJECT_JSON_CHARS } from '../../packages/projects/document.js';
import { normalizeDesign } from '../../packages/core/design.ts';
import { compileSourceAppendix,APPENDIX_FORMAT } from '../../packages/compiler/source-appendix.ts';
import { listThemeNames,listStyleNames,loadThemeDocument,loadStyleDocument } from '../theme-loader.js';
import { qualifyCitationSnapshot } from './citation-qualification.js';
import { refuse,sourceRefusalCode } from './source-read.js';
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const exact=(v,required,optional=[])=>v&&typeof v==='object'&&!Array.isArray(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export const APPENDIX_NOTICE='Full source titles and URLs, including private queries, become ordinary project/history text with normal project/admin/copy/export access and possible later configured-AI input through scoped scene reads. Source/chat clear does not remove those copies. History restoration follows existing retention. Insertion calls no model and grants no research access.';
const messages={
 'invalid-request':'Provide a bounded project/theme request and exact expected counters.', 'not-found':'This project is not available.',
 'consent-required':'Copying source values into deck/history text requires --include-source-text.', 'stale-project':'The saved project changed. Preview it again.',
 'stale-catalog':'Retained sources changed. Preview explicitly again.', 'stale-design':'The normalized theme changed. Preview explicitly again.',
 'theme-required':'Choose an existing theme explicitly for this project.', 'theme-unavailable':'The requested theme or variant is unavailable.',
 'appendix-fit':'Complete references cannot fit at the readable size.', 'appendix-capacity':'The complete appendix exceeds project or composition limits.',
 'engine-refused':'The command engine refused the appendix; no change was committed.', 'invalid-state':'Saved reference state is invalid.',
 'source-unavailable':'A referenced source is unavailable.', 'target-unavailable':'A cited target is unavailable.', 'target-hidden':'A cited target is hidden.',
 'target-chrome':'A cited target belongs to protected furniture.', 'content-changed':'Cited content changed.', 'locator-invalid':'A source range is invalid.',
 'target-budget-exceeded':'Citation traversal exceeds the inspection limit.', 'storage-unavailable':'Appendix preparation is unavailable.',
 'appendix-outcome-unknown':'Appendix save could not be confirmed. Inspect current project/history before retrying.'
};
function capture(binding,request,apply){
 let b,q;try{b=cloneJson(binding,1024);q=cloneJson(request,8192);}catch{refuse('invalid-request');}
 if(!exact(b,['id','owner'])||!validProjectId(b.id)||b.owner!==null&&(typeof b.owner!=='string'||!b.owner.trim()||b.owner.length>128))refuse('invalid-request');
 if(!exact(q,apply?['projectRevision','sourceGeneration','sourceRevision','designFingerprint','disclosure']:[],['theme']))refuse('invalid-request');
 if(Object.hasOwn(q,'theme')&&(typeof q.theme!=='string'||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(q.theme)))refuse('invalid-request');
 if(apply){if(!['projectRevision','sourceGeneration','sourceRevision'].every(k=>integer(q[k]))||typeof q.designFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(q.designFingerprint))refuse('invalid-request');if(q.disclosure!=='source-title-url-scene-v1')refuse('consent-required');}
 return {binding:freeze(b),request:freeze(q)};
}
async function resolveDesign(doc,q){
 const name=q.theme??doc.theme?.name;if(!name)refuse('theme-required');
 if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(name)||!(await listThemeNames()).includes(name))refuse('theme-unavailable');
 const variant=doc.theme?.variant??'light';let style=null,mode='light';
 if(variant==='dark')mode='dark';else if(!['light','plain','chromed'].includes(variant)){if(!(await listStyleNames()).includes(variant))refuse('theme-unavailable');style=await loadStyleDocument(variant);}
 const design=normalizeDesign({theme:await loadThemeDocument(name),...(style?{style}:{}),mode});if(!(await validateDesign(design)).ok)refuse('theme-unavailable');
 return {design,fingerprint:createHash('sha256').update(JSON.stringify({format:APPENDIX_FORMAT,name,variant,design})).digest('hex')};
}
function reserved(scenes){const ids=[];let count=0;const stack=[...scenes];while(stack.length){const n=stack.pop();if(++count>10000)refuse('target-budget-exceeded');ids.push(n.id);stack.push(...(n.elements??n.group?.children??[]));}return ids;}
export function createProjectSourceAppendix(backend,{designResolver=resolveDesign}={}){
 async function run(apply,identity,input={}){
  let committing=false;
  try{
   const {binding,request}=capture(identity,input,apply);
   const transaction=apply?backend.withCitationTransaction:backend.withCitationReadTransaction;
   return await transaction.call(backend,binding,async tx=>{
    const {doc,metadata,references,sourceIds,rows}=await qualifyCitationSnapshot(tx,binding,apply?request:undefined);
    for(const row of rows){
     const pending=[...(row.element?[row.element]:row.scene.elements)];let authored=false;
     while(pending.length){const e=pending.pop();if(isSystemChrome(e))continue;
      if(e.kind==='group')pending.push(...(e.group?.children??[]));
      else if(e.kind==='text'?e.paragraphs?.some(p=>p.runs?.length):['shape','line'].includes(e.kind)||e.kind==='image'&&e.image?.src||e.kind==='chart'&&e.chart?.categories?.length&&e.chart?.series?.length||e.kind==='table'&&e.table?.rows?.length)authored=true;
     }if(!authored)refuse('target-unavailable');
    }
    const refs=[],byId=new Map();for(let i=0;i<references.length;i++){const r=references[i],id=sourceIds[i];let entry=byId.get(id);if(!entry){entry={title:r.title,url:r.url,slides:[]};byId.set(id,entry);refs.push(entry);}if(!entry.slides.includes(r.sceneIndex+1))entry.slides.push(r.sceneIndex+1);}
    if(!refs.length)return freeze({ok:true,snapshot:metadata.snapshot,citationCount:0,referenceCount:0,pageCount:0,designFingerprint:null,changed:false,notice:APPENDIX_NOTICE});
    const {design,fingerprint}=await designResolver(doc,request);if(apply&&request.designFingerprint!==fingerprint)refuse('stale-design');
    const pages=compileSourceAppendix(refs,design,{revision:doc.revision,existingScenes:doc.scenes.length,reservedIds:reserved(doc.scenes)});
    const engine=await createDocument(doc.scenes),envelopeId='references-'+doc.revision;
    const ops=pages.flatMap(scene=>[{slideId:null,op:{type:'slide.insert',scene}},{slideId:null,op:{type:'slide.setLayoutState',id:scene.id,layoutState:'detached'}}]);
    const result=await engine.applyBatch({id:envelopeId,actor:'human',baseRevision:0,ops});if(!result.ok)refuse('engine-refused');
    const scenes=engine.snapshot().scenes,candidate={...doc,scenes};if(JSON.stringify(candidate).length>MAX_PROJECT_JSON_CHARS||Buffer.byteLength(JSON.stringify(candidate))>8*1024*1024)refuse('appendix-capacity');if(!(await validateProjectDocument(candidate)).ok)refuse('invalid-state');
    const output={ok:true,snapshot:metadata.snapshot,citationCount:references.length,referenceCount:refs.length,pageCount:pages.length,designFingerprint:fingerprint,changed:false,notice:APPENDIX_NOTICE};
    if(apply){committing=true;const revision=await tx.saveScenes(scenes,{actor:'human',envelopeIds:[envelopeId],summary:'Add editable References appendix',saveOrigin:'manual'});output.snapshot={...metadata.snapshot,projectRevision:revision};output.changed=true;}
    return freeze(output);
   });
  }catch(error){const known=sourceRefusalCode(error)??error?.code;const code=committing?'appendix-outcome-unknown':Object.hasOwn(messages,known)?known:'storage-unavailable';return freeze({ok:false,code,message:messages[code]});}
 }
 return Object.freeze({preview:(b,q={})=>run(false,b,q),apply:(b,q)=>run(true,b,q)});
}
