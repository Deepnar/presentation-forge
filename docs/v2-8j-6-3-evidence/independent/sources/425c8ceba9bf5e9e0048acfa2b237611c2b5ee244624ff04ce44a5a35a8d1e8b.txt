import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { closeDb } from '../db.js';
import { projectStore } from './backend.js';
import { copyOwnerForToken } from './copy-auth.js';
import { createCitationView } from './citation-view.js';
import { safeInteger } from '../../packages/projects/citation-view-contract.js';
let usedStore;
export async function citationViewCli(argv){
 const token=process.env.FORGE_PROJECT_TOKEN,supplied=token!==undefined;
 const bad=()=>({ok:false,code:'invalid-request',message:'Use inspect-project-sources <id> --revision N --slide ID [--element ID] [--cursor CURSOR].'});
 if(!Array.isArray(argv)||argv.length<5||argv.length>9)return bad();
 const [id,...args]=argv,fields={};
 for(let i=0;i<args.length;i+=2){const key=args[i];if(!['--revision','--slide','--element','--cursor'].includes(key)||typeof args[i+1]!=='string'||Object.hasOwn(fields,key))return bad();fields[key]=args[i+1];}
 if(!/^(0|[1-9]\d*)$/.test(fields['--revision'])||!safeInteger(Number(fields['--revision']))||!fields['--slide'])return bad();
 try{const owner=await copyOwnerForToken(token,supplied);usedStore=await projectStore();return await createCitationView(usedStore).read({id,owner},{projectRevision:Number(fields['--revision']),slideId:fields['--slide'],...(fields['--element']!==undefined?{elementId:fields['--element']}:{}) ,...(fields['--cursor']!==undefined?{cursor:fields['--cursor']}:{})});}
 catch(error){return {ok:false,code:['unauthorized','email-unverified'].includes(error?.code)?error.code:'storage-unavailable',message:'Saved sources cannot be read with this session.'};}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{const result=await citationViewCli(process.argv.slice(2));process.stdout.write(JSON.stringify(result)+'\n');if(!result.ok)process.exitCode=1;}
 catch{process.stdout.write('{"ok":false,"code":"storage-unavailable","message":"Saved sources are unavailable."}\n');process.exitCode=1;}
 finally{try{await usedStore?.closeProjectStore();closeDb();}catch{process.exitCode=1;}}
}
