import { bearerToken,SESSION_COOKIE } from '../../src/auth.js';
import { copyOwnerForToken } from '../../src/projects/copy-auth.js';
import { projectStore } from '../../src/projects/backend.js';
import { createCitationView } from '../../src/projects/citation-view.js';
import { VIEW_LIMITS,validCitationView,safeInteger } from '../../packages/projects/citation-view-contract.js';
import { validProjectId } from '../../packages/projects/document.js';
const PREFIX='/api/v2/projects/:id/citation-view',FAMILY=/^\/api\/v2\/projects\/[^/]+\/citation-view(?:\/|$)/i;
const codes={'invalid-request':422,'not-found':404,'stale-project':409,'stale-catalog':409,'invalid-state':409,'target-budget-exceeded':422,'result-too-large':413,'storage-unavailable':503,'unauthorized':401,'email-unverified':403,'disabled':403,'busy':429,'method-not-allowed':405};
const privateHeaders=res=>{res.set('Cache-Control','private, no-store');res.set('Pragma','no-cache');res.vary('Authorization');};
function failure(res,code){if(!Object.hasOwn(codes,code))code='storage-unavailable';return res.status(codes[code]).json({ok:false,code,error:'Saved sources cannot be read. Refresh explicitly or sign in with their owner.'});}
export function installCitationViewBoundary(app){app.use((req,res,next)=>{
 if(!FAMILY.test(req.path))return next();privateHeaders(res);
 if(req.method==='OPTIONS')return next();
 if(req.method!=='GET')return failure(res,'method-not-allowed');
 if(Buffer.byteLength(req.originalUrl.slice(req.originalUrl.indexOf('?')+1))>VIEW_LIMITS.queryBytes||Number(req.get('Content-Length')??0)>0||req.get('Transfer-Encoding'))return failure(res,'invalid-request');
 next();
});}
export function registerCitationViewRoutes(app,{allowed=()=>true,service=async()=>createCitationView(await projectStore())}={}){
 let active=0;const owners=new Set();
 app.all(PREFIX,async(req,res)=>{
  let release,closed=false;const close=()=>{closed=true;};res.once('close',close);
  try{
   if(!allowed())return failure(res,'disabled');if(!validProjectId(req.params.id)||req.method!=='GET')return failure(res,'invalid-request');
   const raw=req.originalUrl.split('?').slice(1).join('?');decodeURIComponent(raw.replace(/\+/g,' '));
   const params=new URLSearchParams(raw),keys=[...params.keys()];
   if(new Set(keys).size!==keys.length||keys.some(k=>!['revision','slide','element','cursor'].includes(k))||!params.has('revision')||!params.has('slide')||!/^(0|[1-9]\d*)$/.test(params.get('revision'))||!safeInteger(Number(params.get('revision'))))return failure(res,'invalid-request');
   const input={projectRevision:Number(params.get('revision')),slideId:params.get('slide'),...(params.has('element')?{elementId:params.get('element')}:{}) ,...(params.has('cursor')?{cursor:params.get('cursor')}:{})};
   const supplied=req.headers.authorization!==undefined,hasCookie=typeof req.headers.cookie==='string'&&req.headers.cookie.split(';').some(s=>s.trim().startsWith(SESSION_COOKIE+'='));
   if(!supplied&&hasCookie)return failure(res,'unauthorized');
   const owner=await copyOwnerForToken(supplied?bearerToken(req.headers.authorization):null,supplied);
   if(closed||req.aborted)return;
   if(active>=2||owners.has(owner))return failure(res,'busy');active++;owners.add(owner);release=()=>{active--;owners.delete(owner);};
   const view=await service();if(closed||req.aborted)return;
   const result=await view.read({id:req.params.id,owner},input);if(closed||req.aborted)return;
   if(!result?.ok)return failure(res,result?.code);
   if(!validCitationView(result,{id:req.params.id,revision:input.projectRevision,...input}))return failure(res,'storage-unavailable');
   const text=JSON.stringify(result);if(Buffer.byteLength(text)>VIEW_LIMITS.bytes)return failure(res,'result-too-large');res.type('application/json').send(text);
  }catch(error){if(!closed&&!req.aborted)failure(res,['unauthorized','email-unverified'].includes(error?.code)?error.code:error instanceof URIError?'invalid-request':'storage-unavailable');}
  finally{release?.();res.removeListener('close',close);}
 });
 app.use(PREFIX,(_req,res)=>failure(res,'not-found'));
 app.use((error,req,res,next)=>{if(!FAMILY.test(req.path))return next(error);privateHeaders(res);return failure(res,error instanceof URIError?'invalid-request':'storage-unavailable');});
}
