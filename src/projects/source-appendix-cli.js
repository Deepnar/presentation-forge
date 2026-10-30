import { cloneJson } from '../../packages/tools/json.ts';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { closeDb } from '../db.js';
import { projectStore } from './backend.js';
import { copyOwnerForToken } from './copy-auth.js';
import { createProjectSourceAppendix } from './source-appendix.js';
export async function sourceAppendixCli(argv){
 const token=process.env.FORGE_PROJECT_TOKEN,supplied=token!==undefined;
 const usage=()=>({ok:false,code:'invalid-request',message:'Use add-project-references ID [--theme NAME] [--include-source-text --revision N --source-generation N --source-revision N --design-fingerprint HASH].'});
 try{argv=cloneJson(argv,8192);}catch{return usage();}
 if(!Array.isArray(argv)||!argv.length||argv.length>12||argv.some(v=>typeof v!=='string'))return usage();
 const [id,...args]=argv,values={};let apply=false;
 for(let i=0;i<args.length;i++){
  const key=args[i];if(key==='--include-source-text'){if(apply)return usage();apply=true;continue;}
  if(!['--theme','--revision','--source-generation','--source-revision','--design-fingerprint'].includes(key)||Object.hasOwn(values,key)||typeof args[i+1]!=='string'||args[i+1].startsWith('--'))return usage();values[key]=args[++i];
 }
 const counters=['--revision','--source-generation','--source-revision'],expected=[...counters,'--design-fingerprint'];
 if(apply?expected.some(k=>!Object.hasOwn(values,k)):expected.some(k=>Object.hasOwn(values,k)))return usage();
 if(counters.some(k=>values[k]!==undefined&&(!/^(0|[1-9]\d*)$/.test(values[k])||!Number.isSafeInteger(Number(values[k])))))return usage();
 let store,saved=false;try{
  const owner=await copyOwnerForToken(token,supplied);store=await projectStore();const api=createProjectSourceAppendix(store),binding={id,owner},input=values['--theme']?{theme:values['--theme']}:{};
  if(!apply)return await api.preview(binding,input);
  const result=await api.apply(binding,{...input,projectRevision:Number(values['--revision']),sourceGeneration:Number(values['--source-generation']),sourceRevision:Number(values['--source-revision']),designFingerprint:values['--design-fingerprint'],disclosure:'source-title-url-scene-v1'});saved=result.ok&&result.changed;return result;
 }catch(error){const code=['unauthorized','email-unverified'].includes(error?.code)?error.code:'storage-unavailable';return {ok:false,code,message:'References appendix is unavailable with this session.'};}
 finally{try{await store?.closeProjectStore();closeDb();}catch{return {ok:false,code:saved?'appendix-outcome-unknown':'storage-unavailable',message:'Appendix shutdown could not be confirmed. Inspect the project before retrying.'};}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{const result=await sourceAppendixCli(process.argv.slice(2));process.stdout.write(JSON.stringify(result)+'\n');if(!result.ok)process.exitCode=1;}catch{process.stdout.write('{"ok":false,"code":"storage-unavailable","message":"References appendix unavailable."}\n');process.exitCode=1;}
}
