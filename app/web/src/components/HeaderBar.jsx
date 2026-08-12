import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Badge } from "./ui.jsx";
import { ChevronLeft, ChevronRight, DocIcon, GithubIcon } from "./icons.jsx";

/**
 * Full-width product bar. Left: the sidebar collapse toggle, the mark and
 * wordmark (home link) with the routing badge. Right: Docs (README modal) and
 * the repo link. Nothing else — no avatar, no sync, no dead icons.
 *
 * The LOCAL/CLOUD badge reflects whether a cloud key is attached and where the
 * model pickers' "auto" points: LOCAL when no cloud or routing is local,
 * CLOUD/HYBRID when routing routes default work to the attached provider. The
 * toggle flips the routing preference (gitignored config/local.yaml) so
 * "auto" follows the header without touching any picker.
 */
export default function HeaderBar({ leftOpen, onToggleLeft, onOpenDocs, onHome }) {
  const [cloud, setCloud] = useState(null);
  const [route, setRoute] = useState("local");

  useEffect(() => {
    api.cloud()
      .then((r) => {
        setCloud(r.cloud ?? null);
        setRoute(r.cloud?.route ?? "local");
      })
      .catch(() => {});
  }, []);

  const cloudOn = Boolean(cloud?.configured && cloud.keySet);
  const routingCloud = route === "cloud";
  const hybrid = cloudOn && routingCloud;

  async function toggleRoute() {
    const next = routingCloud ? "local" : "cloud";
    try {
      await api.cloudRoute(next);
      setRoute(next);
    } catch { /* non-fatal — the badge just stays as it was */ }
  }

  return (
    <header className="shell-header relative z-20 flex h-12 shrink-0 items-center gap-2.5 border-b border-line bg-base px-3">
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

      {cloudOn && (
        <button
          onClick={toggleRoute}
          title={hybrid
            ? "Default model routing is CLOUD — click to route work locally"
            : "Default model routing is LOCAL — click to route work to your cloud subscription"}
          className="group inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-panel px-2 py-0.5 transition hover:border-accent/50"
        >
          {hybrid ? (
            <Badge className="bg-accent/15 text-accent">CLOUD</Badge>
          ) : (
            <Badge className="border border-line-strong bg-transparent text-fg-faint">LOCAL</Badge>
          )}
          <svg
            viewBox="0 0 24 24"
            className="h-3 w-3 text-fg-faint transition group-hover:text-accent"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8a6 6 0 0 0-11.8 1.5A4 4 0 1 0 5 18h13a3 3 0 0 0 0-10Z" />
          </svg>
        </button>
      )}

      {!cloudOn && <Badge className="border border-line-strong bg-transparent text-fg-faint">LOCAL</Badge>}

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
