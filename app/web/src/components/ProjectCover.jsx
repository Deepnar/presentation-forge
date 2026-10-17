import { useEffect, useRef, useState } from 'react';
import { Button } from './ui.jsx';

export default function ProjectCover({ project, loader, onOpen, onRefresh, disabled = false }) {
  const node = useRef(null);
  const [near, setNear] = useState(false), [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'idle' });
  useEffect(() => {
    if (!globalThis.IntersectionObserver) { setState({ status: 'error', code: 'cover-unsupported' }); return; }
    const observer = new IntersectionObserver(entries => setNear(entries.some(entry => entry.isIntersecting)), { rootMargin: '200px' });
    observer.observe(node.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!globalThis.IntersectionObserver) { setState({ status: 'error', code: 'cover-unsupported' }); return; }
    setState({ status: 'idle' });
    if (near) return loader.subscribe(project, setState);
  }, [near, loader, project.id, project.revision, attempt]);
  const loading = near && (state.status === 'loading' || state.status === 'idle');
  const unavailable = state.status === 'error' || state.status === 'expired';
  const status = state.status === 'ready' ? 'First slide preview' : unavailable ? 'Preview unavailable' : loading ? 'Loading preview' : 'First slide preview loads when visible';
  return (
    <div ref={node} className="relative mb-3" data-project-cover={project.id} data-cover-state={state.status} data-cover-revision={project.revision}>
      <button type="button" disabled={disabled} aria-label={`Open ${project.title}`} aria-describedby={`cover-status-${project.id}`} aria-busy={loading}
        onClick={() => onOpen(project.id)} data-project-cover-open={project.id}
        className="relative block aspect-video w-full overflow-hidden rounded-md border border-line bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default">
        {state.status === 'ready' ? <div aria-hidden="true" className="pointer-events-none h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: state.svg }} /> :
          <div aria-hidden="true" className={`flex h-full items-center justify-center px-3 text-xs text-fg-faint ${loading ? 'skeleton' : ''}`}>{unavailable ? 'Preview unavailable' : loading ? 'Loading preview…' : 'First slide'}</div>}
      </button>
      <p id={`cover-status-${project.id}`} className="sr-only">{status}</p>
      {state.status === 'error' && state.code !== 'cover-fonts-unsupported' && state.code !== 'cover-unsupported' && (
        <div className="absolute bottom-2 right-2"><Button size="sm" onClick={() => { if (state.code === 'cover-stale') onRefresh(); else setAttempt(n => n + 1); }}>Retry preview</Button></div>
      )}
    </div>
  );
}
