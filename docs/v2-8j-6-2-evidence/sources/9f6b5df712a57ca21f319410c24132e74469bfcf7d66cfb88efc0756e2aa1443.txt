import { projectSessionSnapshot } from './projectSession.js';
export const PPTX_MIME='application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const NOTES_BYTES=64*1024*1024,JSON_BYTES=8192;
const messages={
  'pending-edits':'Finish editing and save this presentation before exporting.',
  'context-changed':'The project or session changed. Start a new export.',
  'stale-project':'The saved project changed. Refresh or reopen it before exporting.',
  'stale-catalog':'The retained sources changed. Refresh explicitly before exporting.',
  'unauthorized':'Sign in to export this presentation.','email-unverified':'Confirm your email before exporting.',
  'not-found':'This presentation is not available for source-notes export.',
  'busy':'An export is already running. Try again after it finishes.',
  'invalid-response':'The export response could not be safely read.',
  'too-large':'The complete source-notes export exceeds its download limit.',
  'export-unsafe':'The saved presentation or references cannot be exported safely.',
  'storage-unavailable':'Export is unavailable. No download was requested.',
};
const failure=code=>Object.assign(new Error(messages[code]??messages['export-unsafe']),{code:Object.hasOwn(messages,code)?code:'export-unsafe'});
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const mime=response=>(response.headers.get('Content-Type')??'').split(';')[0].trim().toLowerCase();
function counter(response,key) {
  const value=response.headers.get(key);
  if(value===null||!/^(0|[1-9]\d*)$/.test(value)||!integer(Number(value)))throw failure('invalid-response');
  return Number(value);
}
async function bytes(response,limit,current) {
  const reader=response.body?.getReader();if(!reader)throw failure('invalid-response');
  let complete=false,size=0;const chunks=[];
  try {
    while(true) {
      if(!current())throw failure('context-changed');
      const {done,value}=await reader.read();if(!current())throw failure('context-changed');
      if(done){complete=true;break;}
      if(!(value instanceof Uint8Array))throw failure('invalid-response');
      size+=value.byteLength;if(size>limit)throw failure(limit===JSON_BYTES?'invalid-response':'too-large');
      chunks.push(value);
    }
    return chunks;
  } finally {
    if(!complete)reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
}
async function json(response,current) {
  if(mime(response)!=='application/json')throw failure('invalid-response');
  const chunks=await bytes(response,JSON_BYTES,current),size=chunks.reduce((n,v)=>n+v.length,0),data=new Uint8Array(size);let at=0;
  for(const chunk of chunks){data.set(chunk,at);at+=chunk.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(data));}catch{throw failure('invalid-response');}
}
function metadata(value,id,revision) {
  const s=value?.snapshot;
  if(!exact(value,['ok','snapshot','citationCount'])||value.ok!==true||!exact(s,['projectId','projectRevision','sourceGeneration','sourceRevision'])||s.projectId!==id||
    !['projectRevision','sourceGeneration','sourceRevision'].every(k=>integer(s[k]))||!integer(value.citationCount)||value.citationCount>512)throw failure('invalid-response');
  if(s.projectRevision!==revision)throw failure('stale-project');
  return Object.freeze({snapshot:Object.freeze({...s}),citationCount:value.citationCount});
}
async function responseFailure(response,current) {
  const value=await json(response,current);
  return failure(Object.hasOwn(messages,value?.code)?value.code:'export-unsafe');
}
export function browserExportDownload({blob,title,current}) {
  if(!current())return false;
  const url=URL.createObjectURL(blob);let link,clicked=false;
  try {
    if(!current())return false;
    link=document.createElement('a');link.href=url;
    link.download=(title||'presentation').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g,'_').slice(0,160)+'.pptx';
    document.body.appendChild(link);if(!current())return false;
    link.click();clicked=true;return true;
  } finally {
    link?.remove();
    if(clicked)setTimeout(()=>URL.revokeObjectURL(url),1000);else URL.revokeObjectURL(url);
  }
}
export function createSavedExport({session=projectSessionSnapshot,fetchFn=(...args)=>fetch(...args),download=browserExportDownload,onChange=()=>{}}={}) {
  let active=null,state={phase:'idle'};
  const emit=value=>{state=Object.freeze(value);onChange(state);};
  const identity=t=>{const s=session();try{return active===t&&s.token===t.token&&s.epoch===t.epoch&&t.current();}catch{return false;}};
  const valid=t=>{try{return identity(t)&&t.clean();}catch{return false;}};
  const ensure=t=>{if(!identity(t))throw failure('context-changed');if(!t.clean())throw failure('pending-edits');};
  function finish(t,error) {
    if(active!==t)return;
    const show=identity(t);active=null;t.abort.abort();
    emit(show?{phase:error?'error':'done',projectId:t.id,error:error?.message}: {phase:'idle'});
  }
  async function request(t,url,options={}) {
    ensure(t);const headers=new Headers(options.headers);
    if(t.token!==null)headers.set('Authorization',`Bearer ${t.token}`);else headers.delete('Authorization');
    const response=await fetchFn(url,{...options,headers,signal:t.abort.signal,credentials:'omit',cache:'no-store',redirect:'error'});
    try{ensure(t);}catch(error){response.body?.cancel().catch(()=>{});throw error;}
    return response;
  }
  function deliver(t,blob) {
    ensure(t);if(!download({blob,title:t.title,current:()=>valid(t)}))throw failure('context-changed');finish(t);
  }
  async function start(input) {
    if(active)return false;
    const {id,revision,title='',current=()=>true,clean=()=>true}=input;
    const s=session(),t={id,revision,title,current,clean,token:s.token,epoch:s.epoch,abort:new AbortController()};active=t;
    try {
      ensure(t);if(typeof id!=='string'||!id||!integer(revision))throw failure('invalid-response');
      emit({phase:'loading',projectId:id});
      const response=await request(t,`/api/v2/projects/${encodeURIComponent(id)}/export.pptx`);
      if(response.ok) {
        if(counter(response,'X-Forge-Project-Revision')!==revision)throw failure('stale-project');
        if(mime(response)!==PPTX_MIME)throw failure('invalid-response');
        const blob=await response.blob();ensure(t);deliver(t,blob);return true;
      }
      // The header avoids consuming a potentially large inherited issue list.
      let cited=response.status===422&&response.headers.get('X-Forge-Export-Refusal')==='citation-preservation-required';
      if(cited)response.body?.cancel().catch(()=>{});
      else {
        const body=await json(response,()=>valid(t));ensure(t);
        cited=response.status===422&&body?.code==='citation-preservation-required';
        if(!cited)throw failure(Object.hasOwn(messages,body?.code)?body.code:'export-unsafe');
      }
      const observed=await request(t,`/api/v2/projects/${encodeURIComponent(id)}/native-export`);
      if(!observed.ok)throw await responseFailure(observed,()=>valid(t));
      const value=await json(observed,()=>valid(t));ensure(t);t.metadata=metadata(value,id,revision);
      emit({phase:'confirm',projectId:id,metadata:t.metadata});return true;
    } catch(error){finish(t,failure(error?.code??'storage-unavailable'));return false;}
  }
  async function confirm() {
    const t=active;if(!t||state.phase!=='confirm'||t.confirmed)return false;
    t.confirmed=true;
    try {
      ensure(t);emit({phase:'rendering',projectId:t.id,metadata:t.metadata});
      const {projectId,...counters}=t.metadata.snapshot;
      const response=await request(t,`/api/v2/projects/${encodeURIComponent(t.id)}/native-export`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...counters,disclosure:'source-title-url-v1'}),
      });
      if(!response.ok)throw await responseFailure(response,()=>valid(t));
      if(mime(response)!==PPTX_MIME)throw failure('invalid-response');
      if(counter(response,'X-Forge-Project-Revision')!==t.revision||counter(response,'X-Forge-Source-Generation')!==counters.sourceGeneration||
        counter(response,'X-Forge-Source-Revision')!==counters.sourceRevision)throw failure('invalid-response');
      const chunks=await bytes(response,NOTES_BYTES,()=>valid(t));ensure(t);deliver(t,new Blob(chunks,{type:PPTX_MIME}));return true;
    } catch(error){finish(t,failure(error?.code??'storage-unavailable'));return false;}
  }
  function cancel(){const t=active;if(t){active=null;t.abort.abort();emit({phase:'idle'});}}
  function check(){if(active&&!valid(active))cancel();}
  return Object.freeze({start,confirm,cancel,check,snapshot:()=>state,busy:()=>active!==null});
}
