import { createContext,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState } from 'react';
import { createPortal } from 'react-dom';
import { createSavedExport } from '../lib/nativeExport.js';
const ExportContext=createContext(null);
export function useProjectExports(capture) {
  const latest=useRef(capture);latest.current=capture;
  const mounted=useRef(true),trigger=useRef(null),[state,setState]=useState({phase:'idle'});
  const controller=useMemo(()=>createSavedExport({onChange:value=>{if(mounted.current)setState(value);}}),[]);
  const scope=useMemo(()=>({controller,trigger,capture:input=>latest.current(input)}),[controller]);
  useLayoutEffect(()=>{controller.check();});
  useEffect(()=>{
    mounted.current=true;
    const cancel=()=>controller.cancel();
    const storage=event=>{if(event.key==='forge.token'||event.key===null)cancel();};
    window.addEventListener('hashchange',cancel);window.addEventListener('popstate',cancel);
    window.addEventListener('forge:project-session',cancel);window.addEventListener('storage',storage);
    return()=>{mounted.current=false;controller.cancel();window.removeEventListener('hashchange',cancel);window.removeEventListener('popstate',cancel);
      window.removeEventListener('forge:project-session',cancel);window.removeEventListener('storage',storage);};
  },[controller]);
  return {...scope,state};
}
function SourceNotesDialog({scope}) {
  const root=useRef(null),cancel=useRef(null),returnFocus=useRef(scope.trigger.current);
  const {controller,state}=scope;
  useEffect(()=>{
    const node=root.current;
    const nodes=()=>[...node.querySelectorAll('button:not(:disabled)')];
    const focus=()=>cancel.current?.focus({preventScroll:true});focus();
    const contain=event=>{if(!node.contains(event.target))focus();};
    const key=event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();controller.cancel();return;}
      if(event.key!=='Tab')return;
      const list=nodes(),first=list[0],last=list.at(-1);
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===node)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===node)){event.preventDefault();first?.focus();}
    };
    document.addEventListener('focusin',contain);document.addEventListener('keydown',key,true);
    return()=>{document.removeEventListener('focusin',contain);document.removeEventListener('keydown',key,true);
      if(returnFocus.current?.isConnected)returnFocus.current.focus({preventScroll:true});};
  },[controller]);
  return createPortal(<div data-source-export-backdrop className="fixed inset-0 z-[100] flex items-center justify-center bg-sunken/95 p-4 backdrop-blur-sm"
    onClick={event=>{if(event.target===event.currentTarget)controller.cancel();}}>
    <div ref={root} role="dialog" aria-modal="true" aria-labelledby="source-export-title" aria-describedby="source-export-disclosure" data-source-export-dialog tabIndex={-1}
      className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-card border border-line bg-panel p-4 text-fg shadow-[var(--shadow-float)]">
      <h2 id="source-export-title" className="shrink-0 text-[16px] font-semibold text-fg">Export with source notes</h2>
      <p className="mt-1 shrink-0 text-xs text-fg-muted">Saved revision {state.metadata.snapshot.projectRevision} · {state.metadata.citationCount} source references</p>
      <p id="source-export-disclosure" className="my-4 min-h-0 overflow-y-auto text-sm leading-relaxed text-fg-muted">
        This PowerPoint file will include full retained source titles and URLs in speaker notes, including private query values.
        Clearing sources or deleting this project will not remove notes from a downloaded file. Claim support is not assessed.
        Long notes may overflow printed notes pages.
      </p>
      <div className="flex shrink-0 flex-wrap justify-end gap-2">
        <button ref={cancel} type="button" onClick={()=>controller.cancel()} className="rounded border border-line px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">Cancel</button>
        <button type="button" data-source-export-confirm disabled={state.phase==='rendering'} onClick={()=>controller.confirm()}
          className="rounded bg-accent px-3 py-2 text-sm text-on-accent disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          {state.phase==='rendering'?'Exporting…':'Download with source notes'}
        </button>
      </div>
    </div>
  </div>,document.body);
}
export function ProjectExportProvider({scope,children}) {
  return <ExportContext.Provider value={scope}>{children}{['confirm','rendering'].includes(scope.state.phase)&&<SourceNotesDialog scope={scope}/>}</ExportContext.Provider>;
}
export function useExportScope(){return useContext(ExportContext);}
