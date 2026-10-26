import { parseArgs } from 'node:util';
import { stat, readFile } from 'node:fs/promises';
import { turnService, turnWorker, turnDiscovery } from './index.js';
import { projectStore } from '../projects/backend.js';
import { createModelProvider } from './model-provider.js';
import { parseTurnWorkInput } from '../../packages/agent/turn-worker.ts';
import { workExitCode } from './turn-work-status.js';
import { parseDiscoveryBinding, parseTurnDiscoveryInput } from '../../packages/agent/turn-discovery-input.ts';

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
  if(positionals.length!==1 || !['read','export','submit','prepare','decide','cancel','clear','work','discover'].includes(action) || action!=='discover' && !values.project)
    throw new Error('usage');
  let result;
  if(action==='discover') {
    if(values.project!==undefined || values.provider!==undefined)throw new Error('usage');
    const binding=parseDiscoveryBinding({owner:values.owner??null});
    const input=parseTurnDiscoveryInput(await jsonFile(values.input,2048));
    result=await (await turnDiscovery()).discover(binding,input);
  } else {
  const binding={owner:values.owner??null,id:values.project},service=await turnService();
  if(action==='read')result=await service.read(binding);
  else if(action==='export')result=await service.export(binding);
  else {
    const input=await jsonFile(values.input,262144);
    if(action==='work') {
      const workInput=parseTurnWorkInput(input),controller=new AbortController();
      const abort=()=>controller.abort();
      process.on('SIGINT',abort);process.on('SIGTERM',abort);
      try {
        const state=await service.inspect(binding,{generation:workInput.generation,turnId:workInput.turnId});
        if(!state.ok)result=state;
        else {
          const provider=state.turn.state==='submitted' && !controller.signal.aborted && values.provider
            ? createModelProvider(await jsonFile(values.provider,16384)) : undefined;
          result=await (await turnWorker(provider)).work(binding,workInput,{signal:controller.signal});
        }
      }
      finally { process.off('SIGINT',abort);process.off('SIGTERM',abort); }
    }
    else if(action==='prepare')result=await service.prepare(binding,input,createModelProvider(await jsonFile(values.provider,16384)));
    else result=await service[action](binding,input);
  }
  }
  console.log(JSON.stringify(result));
  if(action==='work')process.exitCode=workExitCode(result);
  else if(!result.ok)process.exitCode=1;
} catch(error) {
  const code=['not-found','invalid-document','invalid-id','runtime-fenced','store-misconfigured','storage-unavailable','worker-failed','discovery-failed'].includes(error?.code)
    ? error.code : 'invalid-input';
  console.error(JSON.stringify({ok:false,code,message:'Chat command refused. Use read/export --project ID; submit/prepare/decide/cancel/clear/work also require --input FILE. Prepare requires --provider FILE; work needs it only for submitted turns. Discover requires --input FILE with limit/cursor and accepts no --project or --provider. --owner supplies the local operator identity.'}));
  process.exitCode=1;
} finally {
  try {await (await projectStore()).closeProjectStore();} catch {}
}
