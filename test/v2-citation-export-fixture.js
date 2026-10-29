import assert from 'node:assert/strict';
import { buildProjectDocument } from '../packages/projects/document.js';
import { canonicalWebSource } from '../packages/tools/web-source.ts';
import { indexCitationTargets } from '../packages/model/citation-targets.ts';
import { citationContentDigests } from '../packages/model/citation-content.ts';
import { seed } from './v2-tool-fixture.js';
import { source } from './v2-source-registry-fixture.js';
import { record,target } from './v2-citations-fixture.js';
export const binding={id:'project',owner:'owner'};
export const request=(overrides={})=>({projectRevision:1,sourceGeneration:0,sourceRevision:1,disclosure:'source-title-url-v1',...overrides});
export async function anchor(scenes,citations,projectId='project') {
  const rows=indexCitationTargets(scenes,citations.map(c=>c.target),true),digests=await citationContentDigests(rows);
  return citations.map((c,i)=>({...c,source:{...c.source,projectId},anchor:{kind:'content-sha256-v1',digest:digests[i] ?? '0'.repeat(64)}}));
}
export async function pureFixture({scenes=seed(),sources=[source()],citations=[record(1,{source:{projectId:'project',id:sources[0].id,generation:0}})]}={}) {
  scenes=structuredClone(scenes);scenes[0].citations=await anchor(scenes,citations);
  const doc={...buildProjectDocument({title:'Saved export',scenes}),id:'project',revision:1};
  const stats={calls:0,batches:[]};
  const backend={async withCitationReadTransaction(b,job){stats.calls++;assert.deepEqual({...b},binding);return job({doc,dialect:'sqlite',async query(sql,params){
    const text=v=>Buffer.from(v),body=s=>JSON.stringify(canonicalWebSource(s)),size=s=>String(Buffer.byteLength(body(s)));
    if(sql.includes('FROM v2_project_source_catalog'))return [{project_id:text(b.id),generation:'0',revision:'1',count:String(sources.length),bytes:String(sources.reduce((n,s)=>n+Number(size(s)),0)),policy_version:'1'}];
    if(sql.includes('source_id IN')) {stats.batches.push(params.length-1);return sources.filter(s=>params.slice(1).includes(s.id)).map(s=>({project_id:text(b.id),source_id:text(s.id),payload:text(body(s)),payload_bytes:size(s),actual_bytes:size(s)}));}
    return sources.map(s=>({project_id:text(b.id),source_id:text(s.id),payload_bytes:size(s),actual_bytes:size(s)}));
  }});}};
  return {doc,sources,stats,backend};
}
export async function registerCited(e,count=1,scenes=seed()) {
  const sources=Array.from({length:count},(_,i)=>source(e.binding.id,i,{excerpt:'界😀 retained evidence.'}));let revision=0;
  for(let i=0;i<count;i+=24){const out=await e.registry.register(e.binding,{projectRevision:0,generation:0,revision,sources:sources.slice(i,i+24)});assert.equal(out.ok,true,JSON.stringify(out));revision=out.catalog.revision;}
  const citations=sources.map((s,i)=>record(i+1,{source:{projectId:e.binding.id,id:s.id,generation:0},target:target()}));
  scenes[0].citations=await anchor(scenes,citations,e.binding.id);
  assert.equal((await e.store.saveProject({...e.binding,baseRevision:0,scenes})).status,'saved');
  return {sources,q:request({sourceRevision:revision})};
}
