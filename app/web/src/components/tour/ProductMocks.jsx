import ThemeMiniCard from "../ThemeMiniCard.jsx";

/**
 * Presentational replicas of the app's real briefing UI, for the tour.
 * Deliberately NOT imports of ChatView's cards: those carry autoFocus and
 * pipeline wiring that must not run on a marketing page. Markup and tokens
 * mirror the live components so what the tour shows IS what the product is.
 */

export function BrowserFrame({ url = "forge.local/#/chat", children, className = "" }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_40px_80px_-20px_rgba(15,23,42,0.35)] ${className}`}>
      <div className="flex items-center gap-2 border-b border-line bg-sunken px-4 py-2.5">
        <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
        <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
        <span className="h-3 w-3 rounded-full bg-[#28C840]" />
        <span className="ml-3 truncate rounded-md bg-panel px-2 py-0.5 font-mono text-[10.5px] text-fg-faint">{url}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-line-strong bg-field px-3 py-2 text-[15px] text-fg outline-none transition placeholder:text-fg-faint/60 hover:border-line-strong focus:border-accent";

/** Replica of TitleCard — the real first question of every briefing. */
export function TitleMock() {
  return (
    <div>
      <div className="mb-1.5 text-[11px] text-fg-faint">Suggested from your topic — edit freely.</div>
      <div className={inputCls}>Green hydrogen: how electrolysis technologies compare</div>
      <div className="mt-3 flex justify-end">
        <span className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white">Next</span>
      </div>
    </div>
  );
}

/** Replica of TeamCard — Name / Roll / Presents rows + add member. */
export function TeamMock() {
  const rows = [
    { name: "Aarav Sharma", roll: "21", presenting: true },
    { name: "Diya Patel", roll: "24", presenting: true },
  ];
  return (
    <div>
      <div className="mb-1.5 text-[11px] text-fg-faint">
        Visible rows, an obvious add — nobody is saved until you press Next, and “presents” decides who the slides split across.
      </div>
      <div className="grid grid-cols-[1fr_4.5rem_5rem_2rem] items-center gap-2 px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-fg-faint">
        <div>Name</div><div>Roll</div><div>Presents</div><div />
      </div>
      <div className="space-y-1.5">
        {rows.map((m, i) => (
          <div key={i} className="grid grid-cols-[1fr_4.5rem_5rem_2rem] items-center gap-2">
            <div className={`${inputCls} py-1.5 !text-[12.5px]`}>{m.name}</div>
            <div className={`${inputCls} py-1.5 !text-[12.5px]`}>{m.roll}</div>
            <label className="flex items-center justify-center gap-1 text-[11px] text-fg-muted">
              <span className={`inline-block h-3.5 w-3.5 rounded-sm ${m.presenting ? "bg-accent" : "border border-line-strong"}`} />
              presents
            </label>
            <button className="rounded p-1 text-fg-faint" title="Remove member" tabIndex={-1}>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 w-full rounded-lg border border-dashed border-line py-1.5 text-center text-[12px] text-fg-faint">+ Add member</div>
      <div className="mt-2 flex items-center justify-between">
        <div className={`${inputCls} w-48 py-1.5 !text-[12.5px] text-fg-faint`}>Group label (optional)</div>
        <span className="text-[11px] text-fg-faint">2 members · 2 presenting</span>
      </div>
      <div className="mt-3 flex justify-end">
        <span className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white">Next — 2 on the team</span>
      </div>
    </div>
  );
}

/** Replica of ThemeCard — searchable live gallery. */
export function ThemeGalleryMock({ themes }) {
  const list = (themes ?? []).slice(0, 9);
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] text-fg-faint">{list.length} of 38 themes — drawn live, this is exactly how slides look</span>
        <span className="ml-auto w-36 rounded-full border border-line bg-sunken px-2.5 py-1 text-left text-[11px] text-fg-faint">Filter themes…</span>
      </div>
      <div className="grid max-h-[300px] grid-cols-3 gap-3 overflow-hidden pr-1">
        {list.map((t, i) => (
          <ThemeMiniCard key={t.name} theme={t} selected={i === 0} />
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <span className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white">Use this theme</span>
      </div>
    </div>
  );
}

/** Density pills — Sparse / Balanced / Dense. */
export function DensityMock() {
  const opts = ["Sparse", "Balanced", "Dense"];
  return (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((o, i) => (
        <span key={o} className={`pill px-2.5 py-1 text-[12px] font-medium ${i === 1 ? "bg-hover text-fg" : "text-fg-faint"}`}>
          {o}{i === 1 && <span className="text-[10px] text-fg-faint"> — a sentence or two per point</span>}
        </span>
      ))}
    </div>
  );
}

/** Outline review — plain-language slide cards awaiting approval. */
export function OutlineMock() {
  const rows = [
    { t: "Title", d: "Opening — topic + team", n: "01" },
    { t: "Stats", d: "Big numbers with captions", n: "02" },
    { t: "Compare", d: "Side-by-side technologies", n: "03" },
    { t: "Timeline", d: "Policy milestones to 2030", n: "04" },
  ];
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.n} className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-tint text-[11px] font-bold text-accent">{r.n}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-fg">{r.t} — {r.d}</div>
            <div className="text-[10.5px] text-fg-faint">purpose editable · type switchable</div>
          </div>
          <span className="shrink-0 rounded-full bg-sunken px-2 py-0.5 text-[10px] text-fg-muted">⋮⋮</span>
        </div>
      ))}
      <div className="mt-3 flex justify-end">
        <span className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white">Approve &amp; generate</span>
      </div>
    </div>
  );
}

/** Research pass — sources + coverage summary. */
export function ResearchMock() {
  return (
    <div className="space-y-2.5">
      {[
        ["nature.com", "paper", "Electrolyser cost curves 2020-26"],
        ["arxiv.org", "paper", "PEM vs SOEC efficiency bounds"],
        ["mnre.gov.in", "web", "National Green Hydrogen Mission"],
      ].map(([host, kind, title]) => (
        <div key={host} className="flex items-center gap-2.5 rounded-xl border border-line bg-panel p-3">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${kind === "paper" ? "bg-accent-tint text-accent" : "bg-sunken text-fg-muted"}`}>{kind.toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium text-fg">{title}</div>
            <div className="font-mono text-[10.5px] text-fg-faint">{host}</div>
          </div>
        </div>
      ))}
      <div className="rounded-xl bg-sunken p-3 text-[11.5px] leading-relaxed text-fg-muted">
        Coverage — 21 sources · 9 distinct domains · 4 papers · diversity guard passed
      </div>
    </div>
  );
}
