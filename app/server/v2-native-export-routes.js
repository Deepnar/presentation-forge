import express from 'express';
import { MIMEType } from 'node:util';
import { isUtf8 } from 'node:buffer';
import { bearerToken,SESSION_COOKIE } from '../../src/auth.js';
import { copyOwnerForToken } from '../../src/projects/copy-auth.js';
import { projectStore } from '../../src/projects/backend.js';
import { createProjectCitationExporter } from '../../src/projects/citation-export.js';
import { validProjectId } from '../../packages/projects/document.js';

const PREFIX='/api/v2/projects/:id/native-export';
const FAMILY=/^\/api\/v2\/projects\/[^/]+\/native-export(?:\/|$)/i;
export const NATIVE_EXPORT_BYTES=64*1024*1024;
const MIME='application/vnd.openxmlformats-officedocument.presentationml.presentation';
const statusFor={ 'invalid-request':422,'not-found':404,'stale-project':409,'stale-catalog':409,'invalid-state':409,
  'target-unavailable':409,'target-hidden':409,'target-chrome':409,'content-changed':409,'source-unavailable':409,
  'locator-invalid':409,'target-budget-exceeded':422,'notes-unsafe':422,'notes-capacity':413,'export-unsafe':422,
  'unauthorized':401,'email-unverified':403,'disabled':403,'busy':429,'request-too-large':413,'unsupported-media-type':415,
  'invalid-id':400,'method-not-allowed':405,'artifact-too-large':413,'storage-unavailable':503 };
function failure(res,code='storage-unavailable') {
  const status=statusFor[code] ?? 503;
  const message=code==='unauthorized' ? 'Log in to export this project.' : code==='email-unverified' ? 'Confirm your email before exporting.' :
    status===404 ? 'This project is not available.' : status===409 ? 'The saved project or sources changed or cannot be exported. Refresh explicitly before trying again.' :
    status===429 ? 'An export is already running. Try again after it finishes.' : status===413 ? 'The export request or complete file exceeds its limit.' :
    status===503 ? 'Project export is unavailable.' : 'This export request cannot be completed.';
  return res.status(status).json({ok:false,code:Object.hasOwn(statusFor,code)?code:'storage-unavailable',error:message});
}
function headers(res) { res.set('Cache-Control','private, no-store');res.set('Pragma','no-cache');res.vary('Authorization'); }
export function installNativeExportHeaders(app) {
  app.use((req,res,next)=>{if(FAMILY.test(req.path))headers(res);next();});
}
function encoding(req,res,next) {
  if(req.method!=='POST')return next();
  try {
    const raw=req.get('Content-Type') ?? '',mime=new MIMEType(raw),params=[...mime.params];
    if(mime.essence!=='application/json' || raw.split(';').length!==params.length+1 ||
      params.some(([k,v])=>k!=='charset'||v.toLowerCase()!=='utf-8') ||
      (req.get('Content-Encoding') ?? 'identity').toLowerCase()!=='identity')return failure(res,'unsupported-media-type');
    next();
  } catch {return failure(res,'unsupported-media-type');}
}
function parserFailure(error,_req,res,_next) {
  return failure(res,error?.type==='entity.too.large'?'request-too-large':'invalid-request');
}
export function installNativeExportParser(app) {
  app.use(PREFIX,encoding,express.json({limit:2048,inflate:false,verify:(_req,_res,body)=>{
    if(!isUtf8(body))throw Error('Invalid export request.');
  }}),parserFailure);
}
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
function metadata(result,id) {
  const s=result?.snapshot;
  return result?.ok===true && exact(s,['projectId','projectRevision','sourceGeneration','sourceRevision']) && s.projectId===id &&
    ['projectRevision','sourceGeneration','sourceRevision'].every(k=>integer(s[k])) && integer(result.citationCount)&&result.citationCount<=512;
}

// Dependencies are executable trusted assembly seams, never request fields.
export function registerNativeExportRoutes(app,{allowed=()=>true,service=async()=>createProjectCitationExporter(await projectStore())}={}) {
  let active=0;const owners=new Set();
  async function route(req,res) {
    headers(res);let release,closed=false;
    const close=()=>{closed=true;};res.once('close',close);
    try {
      if(!allowed())return failure(res,'disabled');
      if(!['GET','POST'].includes(req.method))return failure(res,'method-not-allowed');
      if(!validProjectId(req.params.id))return failure(res,'invalid-id');
      if(Object.keys(req.query).length)return failure(res,'invalid-request');
      if(req.method==='GET'&&(Number(req.get('Content-Length')??0)>0||req.get('Transfer-Encoding')))return failure(res,'invalid-request');
      const authorization=req.headers.authorization,hasAuthorization=authorization!==undefined;
      const hasCookie=typeof req.headers.cookie==='string'&&req.headers.cookie.split(';').some(s=>s.trim().startsWith(SESSION_COOKIE+'='));
      if(!hasAuthorization&&hasCookie)return failure(res,'unauthorized');
      const token=hasAuthorization?bearerToken(authorization):null;
      const owner=await copyOwnerForToken(token,hasAuthorization);
      if(closed||req.aborted)return;
      if(active>=2||owners.has(owner))return failure(res,'busy');
      active++;owners.add(owner);release=()=>{active--;owners.delete(owner);};
      const exporter=await service();
      if(closed||req.aborted)return;
      const binding={id:req.params.id,owner};
      const result=await (req.method==='GET'?exporter.inspect(binding):exporter.render(binding,req.body));
      if(closed||req.aborted)return;
      if(!result?.ok)return failure(res,result?.code);
      if(!metadata(result,binding.id))return failure(res);
      if(req.method==='GET')return res.json({ok:true,snapshot:result.snapshot,citationCount:result.citationCount});
      if(!(result.bytes instanceof Uint8Array))return failure(res);
      if(result.bytes.length>NATIVE_EXPORT_BYTES)return failure(res,'artifact-too-large');
      res.set('X-Forge-Project-Revision',String(result.snapshot.projectRevision));
      res.set('X-Forge-Source-Generation',String(result.snapshot.sourceGeneration));
      res.set('X-Forge-Source-Revision',String(result.snapshot.sourceRevision));
      res.set('Content-Type',MIME);res.set('Content-Disposition',`attachment; filename="${binding.id}.pptx"`);
      return res.send(Buffer.from(result.bytes));
    } catch(error) {
      if(!closed&&!req.aborted)return failure(res,['unauthorized','email-unverified'].includes(error?.code)?error.code:'storage-unavailable');
    } finally {release?.();res.removeListener('close',close);}
  }
  app.all(PREFIX,route);
  app.use(PREFIX,(_req,res)=>failure(res,'not-found'));
  app.use((error,req,res,next)=>{
    if(!FAMILY.test(req.path))return next(error);
    headers(res);return failure(res,error instanceof URIError||error?.status===400?'invalid-request':'storage-unavailable');
  });
}
