import { useEffect, useState } from "react";
import { api } from "../api.js";

/**
 * The four things a project is, as four plain links.
 *
 * A project holds a deck, a report, its research and a speaker script. Until
 * now the deck page carried thinner copies of the report and research panels
 * *and* linked out to the full views of both, so the same artefact had two
 * surfaces and the deck page had three empty states stacked above its own
 * content. These are those views, sharing one navigation.
 *
 * All four are always shown, including the ones that do not exist yet. A
 * project should read as what it could be, and a set of links that changes as
 * the project grows means the same project has a different navigation on
 * Tuesday than it had on Monday.
 *
 * Deliberately not a tab strip and not pills: text on the page's own ground,
 * separated by weight and ink alone. This sits directly under a title, and a
 * boxed control there reads as a second header rather than as a way through
 * one page.
 */

const PAGES = [
  { key: "deck", label: "Deck", has: (p) => p.deck },
  { key: "report", label: "Report", has: (p) => p.report },
  { key: "research", label: "Research", has: (p) => p.research },
  { key: "script", label: "Script", has: (p) => p.script },
];

/**
 * Which page a project should open on.
 *
 * A report-first project has no deck, and landing it on an empty slide grid
 * offering "Render now" is the deck-shaped assumption this navigation exists to
 * undo. Open on the artefact that is actually there.
 */
export function defaultProjectPage(project) {
  if (!project) return "deck";
  if (project.deck) return "deck";
  if (project.report) return "report";
  if (project.research) return "research";
  return "deck";
}

/** The project's own shape, for the navigation and for a view that needs to
 *  know whether the deck exists at all. Null while loading. */
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
        // Absent is dimmer than merely inactive, so "this project has no
        // script" is legible without opening it — but it stays a link, because
        // the empty state is where you go to make one.
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

/**
 * The head of every project page: one way out, the project's name, the page's
 * own primary action, and the four links.
 *
 * It exists so the four pages read as one project rather than four screens that
 * happen to share a slug. Each view keeps its own content and supplies its own
 * `action` — the primary thing to do differs per page and per stage, and that
 * is the point — but the identity above it never moves.
 */
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

      {/* The title takes the room it needs and the action keeps the right
          edge. Without min-w-0/flex-1 a long title wins the whole row and the
          action wraps onto a line of its own, where it reads as a stray
          button rather than as this page's one thing to do. */}
      <div className="flex items-start justify-between gap-x-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.6rem] font-semibold leading-tight tracking-[-0.015em]">
            {project?.title ?? "Loading…"}
          </h1>
          {meta && <div className="mt-1 text-[12.5px] text-fg-muted">{meta}</div>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{action}</div>}
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
