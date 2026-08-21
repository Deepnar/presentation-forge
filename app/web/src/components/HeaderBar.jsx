import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Badge } from "./ui.jsx";
import { ChevronLeft, ChevronRight, DocIcon, GithubIcon } from "./icons.jsx";
import { setModelMode } from "../lib/modelMode.js";
/**
 * Full-width product bar. AUTO = TCET campus gateway (free, rate-limited),
 * CLOUD = your own key. The toggle writes the routing preference and flips the
 * client model-mode store so every picker filters immediately. CLOUD is only
 * reachable when a BYOK key is attached — without one it points at Settings.
 */
export default function HeaderBar({ leftOpen, onToggleLeft, onHome, onOpenSettings, user, onAuthClick }) {
  const [auto, setAuto] = useState(null);
  const [cloud, setCloud] = useState(null);
  const [route, setRoute] = useState("auto");

  useEffect(() => {
    Promise.all([api.autoStatus().catch(() => ({ auto: null })), api.cloud().catch(() => ({ cloud: null }))])
      .then(([a, c]) => {
        const autoData = a.auto ?? a ?? null;
        const cloudData = c.cloud ?? null;
        setAuto(autoData);
        setCloud(cloudData);
        const r = cloudData?.route ?? autoData?.route ?? "auto";
        setRoute(r);
        setModelMode(r);
      })
      .catch(() => {});
  }, []);

  const cloudOn = Boolean(cloud?.configured && cloud.keySet);
  const routingCloud = route === "cloud";
  const routingAuto = route === "auto";

  async function setMode(next) {
    if (next === "cloud" && !cloudOn) return;
    try {
      await api.cloudRoute(next);
      setRoute(next);
      setModelMode(next);
    } catch {}
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

      <div className="inline-flex items-center rounded-full border border-line-strong bg-panel p-0.5">
        <button
          onClick={() => setMode("auto")}
          title="TCET CoE Gateway — free shared campus model (qwen3.6), hourly/weekly caps"
          className={`pill px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider transition ${
            routingAuto ? "bg-accent/15 text-accent" : "text-fg-faint hover:text-fg-muted"
          }`}
        >
          AUTO
        </button>
        <button
          onClick={() => (cloudOn ? setMode("cloud") : onOpenSettings?.())}
          title={cloudOn
            ? "Your own API key — unlimited, billed to you"
            : "Attach your API key in Settings to use cloud"}
          className={`pill px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider transition ${
            routingCloud ? "bg-hover text-fg" : "text-fg-faint hover:text-fg-muted"
          }`}
        >
          CLOUD
        </button>
      </div>
      {auto?.keySet && (
        <Badge className="hidden border border-accent/20 bg-accent/10 text-accent sm:inline-flex">TCET OK</Badge>
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
          <div className="flex items-center gap-1 rounded-full border border-line bg-panel py-0.5 pl-1 pr-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-accent/15 text-[11px] font-semibold uppercase text-accent">
              {user.name?.[0] ?? "?"}
            </span>
            <span className="max-w-[7rem] truncate px-1 text-[12px] text-fg-muted">{user.name}</span>
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
