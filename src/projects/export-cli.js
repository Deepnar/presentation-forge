import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { closeDb } from '../db.js';
import { projectStore } from './backend.js';
import { copyOwnerForToken } from './copy-auth.js';
import { createProjectCitationExporter } from './citation-export.js';
import { publishPrivateExport } from './export-file.js';

export async function exportCli(argv) {
  const args=[...argv],token=process.env.FORGE_PROJECT_TOKEN,supplied=token !== undefined;
  const [id,option,filename,consent,...extra]=args;
  if(!id || option !== '--output' || !filename || filename.startsWith('--') ||
    consent !== undefined && consent !== '--include-source-notes' || extra.length)
    return {ok:false,code:'invalid-request',message:'Usage: export-project <id> --output <new-path> [--include-source-notes]'};
  let store,published=false;
  try {
    const owner=await copyOwnerForToken(token,supplied);
    store=await projectStore();
    const exporter=createProjectCitationExporter(store),binding={id,owner},inspection=await exporter.inspect(binding);
    if(!inspection.ok)return inspection;
    if(inspection.citationCount && !consent)return {ok:false,code:'consent-required',message:'Exporting retained source titles and full URLs requires --include-source-notes.'};
    const {projectId,...counters}=inspection.snapshot;
    const result=consent ? await exporter.render(binding,{...counters,disclosure:'source-title-url-v1'}) : await exporter.renderUncited(binding,counters);
    if(!result.ok)return result;
    const output=await publishPrivateExport(filename,result.bytes);published=true;
    return {ok:true,...output,snapshot:result.snapshot,citationCount:result.citationCount,...(result.notice ? {notice:result.notice} : {})};
  } catch(error) {
    const code=['unauthorized','email-unverified','output-exists','publication-unknown','publication-unsupported'].includes(error?.code) ? error.code : 'storage-unavailable';
    const message=code === 'unauthorized' ? 'Log in to export this project.' : code === 'email-unverified' ? 'Confirm your email before exporting.' :
      code === 'storage-unavailable' ? 'Project export is unavailable.' : error.message;
    return {ok:false,code,message};
  } finally {
    let closeFailed=false;
    try { await store?.closeProjectStore(); } catch { closeFailed=true; }
    try { closeDb(); } catch { closeFailed=true; }
    if(closeFailed)return {ok:false,code:published ? 'publication-unknown' : 'storage-unavailable',message:published ?
      'Export shutdown failed after publication; the output may be complete. Inspect it before retrying.' : 'Project export is unavailable.'};
  }
}
if(process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result=await exportCli(process.argv.slice(2));process.stdout.write(JSON.stringify(result)+'\n');
  if(!result.ok)process.exitCode=1;
}
