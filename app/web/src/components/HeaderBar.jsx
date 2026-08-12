import { Badge } from "./ui.jsx";
import { ChevronLeft, ChevronRight, DocIcon, GithubIcon } from "./icons.jsx";

/**
 * Full-width product bar. Left: the sidebar collapse toggle, the mark and
 * wordmark (home link) with the LOCAL badge. Right: Docs (README modal) and the
 * repo link. Nothing else — no avatar, no sync, no dead icons.
 */
export default function HeaderBar({ leftOpen, onToggleLeft, onOpenDocs, onHome }) {
  return (
    <header className="shell-header flex h-12 shrink-0 items-center gap-2.5 border-b border-line bg-base px-3">
      <button
        onClick={onToggleLeft}
        title={leftOpen ? "Collapse navigation" : "Expand navigation"}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg"
      >
        {leftOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      <button
        onClick={onHome}
        title="Home"
        className="flex min-w-0 items-center gap-2.5 rounded-md"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent text-[13px] font-bold text-white">
          F
        </span>
        <span className="truncate text-[14px] font-semibold tracking-tight">Presentation Forge</span>
      </button>
      <Badge className="border border-line-strong bg-transparent text-fg-faint">LOCAL</Badge>

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={onOpenDocs}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] text-fg-muted transition hover:bg-hover hover:text-fg"
        >
          <DocIcon className="h-4 w-4" />
          Docs
        </button>
        <a
          href="https://github.com/Deepnar/presentation-forge"
          target="_blank"
          rel="noreferrer"
          title="Source on GitHub"
          className="grid h-8 w-8 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg"
        >
          <GithubIcon className="h-4 w-4" />
        </a>
      </div>
    </header>
  );
}
