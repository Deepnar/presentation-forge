export const VIEW_LIMITS=Object.freeze({page:24,rows:128,bytes:262144,errorBytes:8192,queryBytes:8192,cursorBytes:512});
export const safeInteger=n=>Number.isSafeInteger(n)&&n>=0;
export const exactKeys=(v,required,optional=[])=>v&&typeof v==='object'&&!Array.isArray(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
export function scalar(value){if(typeof value!=='string')return false;for(let i=0;i<value.length;i++){const u=value.charCodeAt(i);if(u>=0xd800&&u<=0xdbff){const n=value.charCodeAt(++i);if(!(n>=0xdc00&&n<=0xdfff))return false;}else if(u>=0xdc00&&u<=0xdfff)return false;}return true;}
export const targetId=v=>scalar(v)&&v.length>0&&v.length<=200;
export const validViewCursor=v=>typeof v==='string'&&v.length>0&&v.length<=VIEW_LIMITS.cursorBytes&&/^[A-Za-z0-9_-]+$/.test(v);
const oneOf=(v,values)=>values.includes(v);
function validTarget(t){return exactKeys(t,t?.kind==='slide'?['kind','slideId']:['kind','slideId','elementId'])&&oneOf(t.kind,['slide','element'])&&targetId(t.slideId)&&(t.kind==='slide'||targetId(t.elementId));}
function validReference(r){try{if(!exactKeys(r,['title','url'])||!scalar(r.title)||!r.title.length||r.title.length>500||!scalar(r.url)||r.url.length>2000)return false;const u=new URL(r.url);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.hash&&u.href===r.url;}catch{return false;}}
export function validCitationView(v,scope){
 const s=v?.snapshot,t=v?.scope;
 if(!exactKeys(v,['ok','snapshot','scope','total','rows','nextCursor'])||v.ok!==true||!exactKeys(s,['projectId','projectRevision','sourceGeneration','sourceRevision'])||s.projectId!==scope.id||s.projectRevision!==scope.revision||!['projectRevision','sourceGeneration','sourceRevision'].every(k=>safeInteger(s[k]))||!exactKeys(t,['slideId','elementId','status'])||t.slideId!==scope.slideId||t.elementId!==(scope.elementId??null)||!oneOf(t.status,['present','not-saved'])||!safeInteger(v.total)||v.total>VIEW_LIMITS.rows||!Array.isArray(v.rows)||v.rows.length>VIEW_LIMITS.page||v.rows.length>v.total||!(v.nextCursor===null||validViewCursor(v.nextCursor)))return false;
 if(t.status==='not-saved'&&(v.total!==0||v.rows.length||v.nextCursor!==null))return false;
 const ids=new Set();
 return v.rows.every(r=>{
  if(!exactKeys(r,['id','target','targetStatus','contentStatus','sourceStatus','locatorStatus','claimSupport'],['reference'])||typeof r.id!=='string'||!/^cit_[0-9a-f]{32}$/.test(r.id)||ids.has(r.id)||!validTarget(r.target)||!oneOf(r.targetStatus,['present','missing','ambiguous','scope-mismatch'])||!oneOf(r.contentStatus,['current','changed','unavailable'])||!oneOf(r.sourceStatus,['retained','missing','stale-generation'])||!oneOf(r.locatorStatus,['not-requested','range-valid','invalid','unavailable','unsupported-excerpt'])||r.claimSupport!=='not-assessed'||(r.sourceStatus==='retained'?!validReference(r.reference):Object.hasOwn(r,'reference')))return false;
  ids.add(r.id);return true;
 });
}
export const literalSourceText=value=>value.replace(/[\x00-\x1f\x7f-\x9f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
