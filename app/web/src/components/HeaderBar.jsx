import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Badge } from "./ui.jsx";
import { ChevronLeft, ChevronRight, DocIcon, GithubIcon } from "./icons.jsx";
import { setModelMode } from "../lib/modelMode.js";
/**
 * Full-width product bar. Left: the sidebar collapse toggle, the mark and
 * wordmark (home link) with the routing badge. Right: Docs (README modal) and
 * the repo link.
 *
 * The LOCAL/CLOUD badge is also the mode switch: it writes the routing
 * preference (gitignored config/local.yaml) and flips the client model-mode
 * store so every model picker filters to that mode immediately. CLOUD is only
 * reachable when a key is attached; without one the button is disabled and
 * points at the Settings/Cloud section where the key lands.
 */
export default function HeaderBar({ leftOpen, onToggleLeft, onHome, onOpenIdentity, user, onAuthClick, onLogout }) {
  const [cloud, setCloud] = useState(null);
  const [route, setRoute] = useState("local");

  useEffect(() => {
    api.cloud()
      .then((r) => {
        setCloud(r.cloud ?? null);
        setRoute(r.cloud?.route ?? "local");
        // Rehydrate the pickers' mode from the persisted preference on boot.
        setModelMode(r.cloud?.route ?? "local");
      })
      .catch(() => {});
  }, []);

  const configured = Boolean(cloud?.configured);
  const cloudOn = Boolean(cloud?.configured && cloud.keySet);
  const routingCloud = route === "cloud";

  async function setMode(next) {
    if (next === "cloud" && !cloudOn) return; // no key — unreachable
    try {
      await api.cloudRoute(next);
      setRoute(next);
      setModelMode(next);
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

      <a
        href="#/chat"
        title="Home"
        className="flex min-w-0 items-center gap-2.5 rounded-md transition hover:opacity-90"
      >
        <img
          src="/logo.svg"
          alt="Presentation Forge"
          className="h-7 w-7 shrink-0 rounded-md"
        />
        <span className="truncate text-[14px] font-semibold tracking-tight">Presentation Forge</span>
      </a>

      {configured ? (
        <div className="inline-flex items-center rounded-full border border-line-strong bg-panel p-0.5">
          <button
            onClick={() => setMode("local")}
            title="Author model runs on this machine. Research and critique models are separate — the toggle moves only your writing model."
            className={`pill px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider transition ${
              !routingCloud ? "bg-hover text-fg" : "text-fg-faint hover:text-fg-muted"
            }`}
          >
            LOCAL
          </button>
          <button
            onClick={() => (cloudOn ? setMode("cloud") : onOpenIdentity?.())}
            title={cloudOn
              ? "Author model runs on a cloud provider. Research and critique stay local — this moves only your writing model."
              : "Attach an API key in Settings → Cloud to use cloud models"}
            className={`pill px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider transition ${
              routingCloud ? "bg-accent/15 text-accent" : "text-fg-faint hover:text-fg-muted"
            }`}
          >
            CLOUD
          </button>
        </div>
      ) : (
        <Badge className="border border-line-strong bg-transparent text-fg-faint">LOCAL</Badge>
      )}

      <div className="ml-auto flex items-center gap-1">
        <a
          href="#/home"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] text-fg-muted transition hover:bg-hover hover:text-fg"
        >
          <DocIcon className="h-4 w-4" />
          Tour
        </a>
        <a
          href="https://github.com/Deepnar/presentation-forge"
          target="_blank"
          rel="noreferrer"
          title="Source on GitHub"
          className="grid h-8 w-8 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg"
        >
          <GithubIcon className="h-4 w-4" />
        </a>

        {user ? (
          <div className="flex items-center gap-1 rounded-full border border-line bg-panel py-0.5 pl-1 pr-1">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-accent/15 text-[11px] font-semibold uppercase text-accent">
              {user.name?.[0] ?? "?"}
            </span>
            <span className="max-w-[7rem] truncate px-1 text-[12px] text-fg-muted">{user.name}</span>
            <button
              onClick={onLogout}
              title="Log out"
              className="grid h-6 w-6 place-items-center rounded-full text-fg-faint transition hover:bg-hover hover:text-fg"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            onClick={onAuthClick}
            title="Log in or register"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[13px] text-fg-muted transition hover:border-line-strong hover:text-fg"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-3.6 4.2-5.5 8-5.5s6.8 1.9 8 5.5" />
            </svg>
            Log in
          </button>
        )}
      </div>
    </header>
  );
}
