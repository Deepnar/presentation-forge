import { parseArgs } from 'node:util';
import { stat, readFile } from 'node:fs/promises';
import { turnService } from './index.js';
import { projectStore } from '../projects/backend.js';
import { createModelProvider } from './model-provider.js';

async function jsonFile(file, limit) {
  if (!file || (await stat(file)).size > limit) throw new Error('input');
  const data = await readFile(file);
  if (data.length > limit) throw new Error('input');
  return JSON.parse(data.toString('utf8'));
}
// As in agent-run, owner is trusted local operator input. A web transport must
// instead derive that binding from its authenticated session.
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    project: {type:'string'}, owner: {type:'string'}, input: {type:'string'}, provider: {type:'string'},
  }});
  const action=positionals[0];
  if(positionals.length!==1 || !['read','export','submit','prepare','decide','cancel','clear'].includes(action) || !values.project)
    throw new Error('usage');
  const binding={owner:values.owner??null,id:values.project},service=await turnService();
  let result;
  if(action==='read')result=await service.read(binding);
  else if(action==='export')result=await service.export(binding);
  else {
    const input=await jsonFile(values.input,262144);
    if(action==='prepare')result=await service.prepare(binding,input,createModelProvider(await jsonFile(values.provider,16384)));
    else result=await service[action](binding,input);
  }
  console.log(JSON.stringify(result));
  if(!result.ok)process.exitCode=1;
} catch(error) {
  const code=['not-found','invalid-document','invalid-id','runtime-fenced','store-misconfigured','storage-unavailable'].includes(error?.code)
    ? error.code : 'invalid-input';
  console.error(JSON.stringify({ok:false,code,message:'Chat command refused. Use read/export --project ID; submit/prepare/decide/cancel/clear also require --input FILE. Prepare requires --provider FILE. --owner supplies the local operator identity.'}));
  process.exitCode=1;
} finally {
  try {await (await projectStore()).closeProjectStore();} catch {}
}
