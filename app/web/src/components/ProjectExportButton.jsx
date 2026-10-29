import { useExportScope } from './ProjectExports.jsx';
export default function ProjectExportButton({projectId,title,revision,children='Export',disabled,...props}) {
  const scope=useExportScope();
  if(!scope)throw Error('Saved exports require a shared view scope.');
  const active=['loading','confirm','rendering'].includes(scope.state.phase),mine=scope.state.projectId===projectId;
  function context(){return scope.capture({id:projectId,title,revision});}
  function start(event){scope.trigger.current=event.currentTarget;scope.controller.start(context());}
  function pointer(event){
    if(active)return;
    const input=context();
    if(!input.clean()) {event.preventDefault();event.stopPropagation();scope.controller.start(input);}
  }
  return <>
    <button {...props} type="button" disabled={disabled||active} onPointerDown={pointer} onMouseDown={pointer} onClick={start}>
      {active&&mine?'Exporting…':children}
    </button>
    {mine&&scope.state.phase==='error'&&<span role="alert" data-export-error className="text-[12px] text-danger">{scope.state.error}</span>}
    {mine&&scope.state.phase==='done'&&<span role="status" data-export-done className="text-[12px] text-fg-muted">Download requested</span>}
  </>;
}
