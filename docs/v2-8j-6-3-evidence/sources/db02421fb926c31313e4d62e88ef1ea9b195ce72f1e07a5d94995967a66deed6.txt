import { useEffect,useLayoutEffect,useMemo,useRef,useState } from 'react';
import { createCitationViewClient } from '../lib/citationView.js';
import { literalSourceText } from '../../../../packages/projects/citation-view-contract.js';
export default function SavedSources({active,capture,preservePointer,register}){
 const mounted=useRef(true),live=useRef(null);live.current={active,capture};
 const [state,setState]=useState({phase:'closed',rows:[]});
 const controller=useMemo(()=>createCitationViewClient({onChange:value=>{if(mounted.current)setState(value);}}),[]);
 useLayoutEffect(()=>{if(!active)controller.close();else controller.check();});
 useEffect(()=>{mounted.current=true;const close=()=>controller.close();register(close);
  const storage=e=>{if(e.key==='forge.token'||e.key===null)close();};
  window.addEventListener('hashchange',close);window.addEventListener('popstate',close);window.addEventListener('forge:project-session',close);window.addEventListener('storage',storage);
  return()=>{mounted.current=false;register(null);close();window.removeEventListener('hashchange',close);window.removeEventListener('popstate',close);window.removeEventListener('forge:project-session',close);window.removeEventListener('storage',storage);};
 },[controller,register]);
 function read(){const input=live.current.capture();if(!input)return;const original=input.current;controller.read({...input,current:()=>live.current.active&&original()});}
 const open=state.phase!=='closed',btn='rounded border border-line px-2 py-1 text-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
 const pointer=e=>{if(preservePointer()) {e.preventDefault();e.stopPropagation();}};
 const reading=e=>{if(preservePointer()){const node=e.currentTarget;node.dataset.preserveSourceDraft='';setTimeout(()=>delete node.dataset.preserveSourceDraft,0);}};
 return <section data-saved-sources tabIndex={-1} onPointerDownCapture={reading} onMouseDownCapture={reading} className="min-w-0 border-t border-line pt-2 text-[12.5px] text-fg">
  <button type="button" data-sources-toggle aria-expanded={open} aria-controls="saved-sources-content" onPointerDown={pointer} onMouseDown={pointer} onClick={()=>open?controller.close():read()} className={btn}>Sources</button>
  {open&&<div id="saved-sources-content" role="region" aria-label="Saved sources" className="mt-2 min-w-0 space-y-2 [overflow-wrap:anywhere]">
   <p>Saved revision {state.snapshot?.projectRevision??capture()?.revision}. Unsaved edits are not included.</p>
   <p className="text-fg-muted">Claim support is not assessed.</p>
   <p className="text-fg-muted">{capture()?.elementId?'Selected object':'Current saved slide'} references</p>
   {state.phase==='loading'&&<p role="status">Reading saved sources…</p>}
   {state.phase==='error'&&<><p role="alert">{state.error}</p><button type="button" onPointerDown={pointer} onMouseDown={pointer} onClick={read} className={btn}>Refresh sources</button></>}
   {state.phase==='ready'&&!state.rows.length&&<p data-sources-empty>{state.scope.status==='not-saved'?'This selection is not in the saved revision.':'No saved references in this scope.'}</p>}
   {state.rows.map((row,i)=><article key={row.id} data-source-row className="min-w-0 rounded border border-line p-2">
    <p className="font-semibold">Reference {i+1} · {row.target.kind==='slide'?'Slide':'Object'}</p>
    {row.reference&&<><p data-source-title>{literalSourceText(row.reference.title)}</p><p data-source-url className="select-text text-fg-muted">{literalSourceText(row.reference.url)}</p></>}
    <p>Target: {row.targetStatus} · Saved content: {row.contentStatus}</p><p>Source: {row.sourceStatus} · Snippet range: {row.locatorStatus}</p>
   </article>)}
   {state.phase==='ready'&&state.nextCursor&&<button type="button" data-sources-more onPointerDown={pointer} onMouseDown={pointer} onClick={()=>controller.more()} className={btn}>Show more</button>}
  </div>}
 </section>;
}
