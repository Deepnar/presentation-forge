import { useEffect, useState } from "react";
import { api } from "../api.js";

const PAGES = [
  { key: "deck", label: "Deck", has: (p) => p.deck },
  { key: "report", label: "Report", has: (p) => p.report },
  { key: "research", label: "Research", has: (p) => p.research },
  { key: "script", label: "Script", has: (p) => p.script },
];

export function defaultProjectPage(project) {
  if (!project) return "deck";
  if (project.deck) return "deck";
  if (project.report) return "report";
  if (project.research) return "research";
  return "deck";
}

export function useProject(slug, refreshToken) {
  const [project, setProject] = useState(null);
  useEffect(() => {
    let live = true;
    if (!slug) return;
    api.project(slug)
      .then((r) => { if (live) setProject(r.project); })
      .catch(() => { if (live) setProject(null); });
    return () => { live = false; };
  }, [slug, refreshToken]);
  return project;
}

export default function ProjectNav({ active, project, onNavigate, className = "" }) {
  return (
    <nav className={`flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] ${className}`}>
      {PAGES.map(({ key, label, has }) => {
        const current = key === active;
        const exists = project ? has(project) : true;
        return (
          <button
            key={key}
            onClick={() => !current && onNavigate?.(key)}
            aria-current={current ? "page" : undefined}
            className={`transition ${
              current
                ? "font-medium text-fg"
                : exists
                  ? "text-fg-faint hover:text-fg"
                  : "text-fg-faint/55 hover:text-fg-muted"
            }`}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}

export function ProjectHeader({ project, active, onNavigate, onBack, action, meta }) {
  return (
    <>
      <button
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-1.5 text-xs text-fg-faint transition hover:text-fg"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18 9 12l6-6" />
        </svg>
        All projects
      </button>

      {/* Side by side from sm up: the title takes the room it needs and the
          action keeps the right edge, which without min-w-0/flex-1 it loses to
          a long title. On a phone they stack instead — sharing 390px squeezes
          a real deck title into five lines to keep one button company. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-x-6">
        <div className="min-w-0 sm:flex-1">
          <h1 className="text-[1.6rem] font-semibold leading-tight tracking-[-0.015em]">
            {project?.title ?? "Loading…"}
          </h1>
          {meta && <div className="mt-1 text-[12.5px] text-fg-muted">{meta}</div>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{action}</div>}
      </div>

      <ProjectNav
        active={active}
        project={project}
        onNavigate={onNavigate}
        className="mt-4 border-b border-line pb-2.5"
      />
    </>
  );
}
