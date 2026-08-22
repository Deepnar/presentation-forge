import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Badge } from "./ui.jsx";
import { ChevronLeft, ChevronRight, DocIcon, GithubIcon } from "./icons.jsx";
import { setModelMode, subscribeModelMode, getModelMode } from "../lib/modelMode.js";
/**
 * Full-width product bar. AUTO = TCET campus gateway (free, rate-limited),
 * CLOUD = your own key. The toggle writes the routing preference and flips the
 * client model-mode store so every picker filters immediately. CLOUD is only
 * reachable when a BYOK key is attached — without one it points at Settings.
 */
export default function HeaderBar({ leftOpen, onToggleLeft, onHome, onOpenSettings, onOpenProfile, user, onAuthClick, view }) {
  const [auto, setAuto] = useState(null);
  const [cloud, setCloud] = useState(null);
  const [route, setRoute] = useState("auto");

  useEffect(() => {
    document.documentElement.dataset.theme = "light";
    try { localStorage.setItem("forge.theme", "light"); } catch {}
  }, []);

  useEffect(() => {
    Promise.all([api.autoStatus().catch(() => ({ auto: null })), api.cloud().catch(() => ({ cloud: null }))])
      .then(([a, c]) => {
        const autoData = a.auto ?? a ?? null;
        const cloudData = c.cloud ?? null;
        setAuto(autoData);
        setCloud(cloudData);
        const r = cloudData?.route ?? autoData?.route ?? getModelMode();
        setRoute(r);
        setModelMode(r);
      })
      .catch(() => {});
    return subscribeModelMode((m) => setRoute(m));
  }, []);

  const cloudOn = Boolean(cloud?.configured && cloud.keySet);
  const routingCloud = route === "cloud";
  const routingAuto = route === "auto";
  const autoKind = auto?.kind ?? (auto?.provider === "tcet-auto" ? "tcet" : "local");
  const autoLabel = "AUTO";
  const autoTitle = "Auto — free shared model, rate-limited";

  async function setMode(next) {
    if (next === "cloud" && !cloudOn) return;
    try {
      await api.cloudRoute(next);
      setRoute(next);
      setModelMode(next);
    } catch {}
  }

  const hideToggle = view === "home" || view === "tour-themes" || view === "privacy" || view === "terms" || view === "contact" || view === "docs";
  const isTour = view === "home" || view === "tour-themes" || view === "privacy" || view === "terms" || view === "contact" || view === "docs";
  const logoHref = isTour && !user ? "#/home" : "#/chat";
  return (
    <header className={`${isTour ? "fixed top-0 left-0 right-0 z-30" : "sticky top-0 z-20"} flex h-14 shrink-0 items-center gap-2.5 border-b border-line bg-panel px-3 shadow-sm`}>
      {!hideToggle && (
        <button
          onClick={onToggleLeft}
          title={leftOpen ? "Collapse navigation" : "Expand navigation"}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg"
        >
          {leftOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      )}

      <a
        href={logoHref}
        title="Home"
        className="flex min-w-0 items-center gap-2.5 rounded-md transition hover:opacity-90"
      >
        <img
          src="/logo.svg"
          alt="Presentation Forge"
          className="h-8 w-8 shrink-0 rounded-lg shadow-sm ring-1 ring-line/60"
        />
        <span className="truncate text-[14px] font-semibold tracking-tight">Presentation Forge</span>
      </a>

      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-medium ${routingAuto ? "text-accent" : "text-fg-faint"}`}>{autoLabel}</span>
        <button
          onClick={() => (routingCloud ? setMode("auto") : (cloudOn ? setMode("cloud") : onOpenSettings?.()))}
          title={routingAuto ? autoTitle + " — click to switch to Cloud" : "Cloud — click to switch to Auto"}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition ${routingAuto ? "border-accent/30 bg-accent" : "border-line-strong bg-panel"}`}
          aria-label="Toggle Auto/Cloud"
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${routingAuto ? "translate-x-0.5" : "translate-x-5"}`} />
        </button>
        <span className={`text-[10px] font-medium ${routingCloud ? "text-fg" : "text-fg-faint"}`}>CLOUD</span>
      </div>
      {auto?.keySet && (
        <Badge className="hidden border border-accent/20 bg-accent/10 text-accent sm:inline-flex">Ready</Badge>
      )}

      <div className="ml-auto flex items-center gap-1">
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
          <button onClick={() => onOpenProfile?.()} className="flex items-center gap-1 rounded-full border border-line bg-panel py-0.5 pl-1 pr-2 transition hover:border-line-strong hover:bg-hover">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-accent/15 text-[11px] font-semibold uppercase text-accent">
              {user.name?.[0] ?? "?"}
            </span>
            <span className="max-w-[7rem] truncate px-1 text-[12px] text-fg-muted">{user.name}</span>
          </button>
        ) : (
          <>
            <button
              onClick={() => onAuthClick?.("login")}
              title="Log in"
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1.5 text-[13px] font-medium text-fg-muted transition hover:border-line-strong hover:text-fg"
            >
              Log in
            </button>
            <button
              onClick={() => onAuthClick?.("register")}
              title="Sign up"
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white transition hover:bg-accent-hi"
            >
              Sign up
            </button>
          </>
        )}
      </div>
    </header>
  );
}
