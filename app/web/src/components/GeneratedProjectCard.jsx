import { useEffect, useRef, useState } from 'react';
import DeckThumb from './DeckThumb.jsx';
import { DocIcon } from './icons.jsx';
import { Button, Panel } from './ui.jsx';
import { relative } from '../lib/time.js';

export default function GeneratedProjectCard({ project, onOpen, onDelete, disabled }) {
  const node = useRef(null), [near, setNear] = useState(false);
  useEffect(() => {
    if (!globalThis.IntersectionObserver) return;
    const observer = new IntersectionObserver(entries => setNear(entries.some(entry => entry.isIntersecting)), { rootMargin: '200px' });
    observer.observe(node.current); return () => observer.disconnect();
  }, []);
  const label = project.deck ? project.report ? 'Generated deck + report' : 'Generated deck' : 'Generated report';
  return <Panel className="flex flex-col p-4" data-generated-card={project.slug}>
    <div ref={node} className="mb-3">
      <button type="button" aria-label={`Open ${project.title}`} onClick={() => onOpen(project)} disabled={disabled}
        className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-line bg-raised text-fg-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        {project.deck && near ? <DeckThumb slug={project.slug} title={project.title} theme={project.theme} alt="" className="h-full w-full" /> : <div aria-hidden="true" className="flex flex-col items-center gap-2 text-xs"><DocIcon className="h-7 w-7" />{project.deck ? 'Generated presentation' : 'Report'}</div>}
      </button>
    </div>
    <div className="mb-2 text-xs font-medium text-fg-muted">{label}</div>
    <div className="min-w-0 flex-1"><div className="truncate text-[15px] font-semibold" title={project.title}>{project.title}</div>
      <div className="mt-0.5 text-[12.5px] text-fg-faint">{project.deck ? `${project.slides ?? 0} slides · ` : ''}{relative(project.updated)}</div>
    </div>
    <div className="mt-3 flex flex-wrap gap-1.5"><Button size="sm" variant="primary" data-generated-open={project.slug} onClick={() => onOpen(project)} disabled={disabled}>Open</Button>
      <Button size="sm" data-generated-delete={project.slug} onClick={() => onDelete(project)} disabled={disabled}>Delete…</Button></div>
  </Panel>;
}
