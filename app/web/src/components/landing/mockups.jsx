/**
 * Small, real pieces of interface — not screenshots.
 *
 * A picture of a product goes stale the moment the product moves, and it
 * cannot be read by a screen reader, selected, or scaled without blurring.
 * These are the same tokens, radii and type scale the app itself is built
 * from, so they stay honest for free and cost a few kilobytes instead of a
 * few hundred.
 *
 * They are illustrations of a step, not live controls: nothing here is
 * focusable, because a landing page that hands a reader a fake text field is
 * worse than one that hands them a picture of it.
 */

const Frame = ({ label, children, className = "" }) => (
  <div className={`overflow-hidden rounded-panel border border-line bg-panel shadow-[var(--shadow-card)] ${className}`}>
    <div className="flex items-center gap-1.5 border-b border-line bg-sunken px-3 py-2">
      <span className="h-2 w-2 rounded-full bg-line-strong" />
      <span className="h-2 w-2 rounded-full bg-line-strong" />
      <span className="h-2 w-2 rounded-full bg-line-strong" />
      <span className="ml-1.5 truncate font-mono text-[10px] text-fg-faint">{label}</span>
    </div>
    <div className="p-4">{children}</div>
  </div>
);

const Chip = ({ children, on = false }) => (
  <span
    className={`inline-flex items-center rounded-pill px-2.5 py-1 text-[11.5px] ${
      on ? "bg-accent text-on-accent" : "border border-line bg-sunken text-fg-muted"
    }`}
  >
    {children}
  </span>
);

/** 01 — the briefing asks one question at a time. */
export function BriefMock() {
  return (
    <Frame label="forge / new chat">
      <div className="text-[13px] leading-relaxed text-fg">
        Which theme should this deck use?
      </div>
      <div className="mt-1 text-[11.5px] text-fg-faint">Everything defaults — skip and it picks.</div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip on>Swiss International</Chip>
        <Chip>Editorial Serif</Chip>
        <Chip>Linear Dark</Chip>
        <Chip>Skip</Chip>
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-field px-3 py-2">
        <span className="flex-1 truncate text-[12px] text-fg-faint">Type a topic — everything else defaults…</span>
        <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-on-accent">
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" /></svg>
        </span>
      </div>
    </Frame>
  );
}

/** 02 — research keeps what it read. */
export function ResearchMock() {
  const sources = [
    { host: "iea.org", title: "Global Hydrogen Review", kind: "report" },
    { host: "nature.com", title: "Electrolyser cost trajectories", kind: "paper" },
    { host: "irena.org", title: "Green hydrogen cost reduction", kind: "report" },
  ];
  return (
    <Frame label="forge / research · 3 of 14 kept">
      <div className="space-y-2">
        {sources.map((s) => (
          <div key={s.host} className="flex items-start gap-2.5 rounded-lg border border-line bg-sunken px-3 py-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-fg">{s.title}</div>
              <div className="font-mono text-[10px] text-fg-faint">{s.host}</div>
            </div>
            <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-fg-faint">{s.kind}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[11px] text-fg-faint">Source diversity guard: no single domain over 40%.</div>
    </Frame>
  );
}

/** 03 — a plan you can rearrange before anything renders. */
export function OutlineMock() {
  const rows = [
    { t: "Why the question changed", k: "bullets" },
    { t: "Three figures that frame it", k: "stats" },
    { t: "Two stacks, one trade-off", k: "compare" },
    { t: "Pledged against built", k: "metric" },
  ];
  return (
    <Frame label="forge / outline · 4 sections · 25 slides">
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={r.t} className="flex items-center gap-2.5 rounded-lg border border-line bg-sunken px-3 py-2">
            <span className="font-mono text-[10px] text-fg-faint">{String(i + 1).padStart(2, "0")}</span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-fg">{r.t}</span>
            <span className="shrink-0 rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[9px] text-fg-muted">{r.k}</span>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-fg-faint" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 8h16M4 16h16" /></svg>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** 04 — the gate. */
export function GateMock() {
  return (
    <Frame label="forge / outline · awaiting approval">
      <div className="rounded-lg border border-accent-dim bg-accent-tint p-3">
        <div className="text-[12px] font-semibold text-accent">Nothing has been rendered yet.</div>
        <div className="mt-1 text-[11.5px] leading-relaxed text-fg-muted">
          The plan exists; the deck does not. Change anything above, or approve and the
          renderer starts.
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="rounded-pill bg-accent px-3 py-1.5 text-[11.5px] font-medium text-on-accent">Approve and generate</span>
        <span className="rounded-pill border border-line px-3 py-1.5 text-[11.5px] text-fg-muted">Keep editing</span>
      </div>
    </Frame>
  );
}

/** 05 — written against the notes, and kept to what fits. */
export function ContentMock() {
  return (
    <Frame label="forge / slide 03 · stats">
      <div className="space-y-2.5">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-fg-faint">headline</div>
          <div className="mt-0.5 text-[13px] font-semibold text-fg">Three figures that frame it</div>
        </div>
        <div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-fg-faint">value · label</div>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {[["60%", "Fall in stack cost"], ["95 GW", "Operating capacity"], ["4%", "Reaching approval"]].map(([v, l]) => (
              <div key={v} className="rounded-lg border border-line bg-sunken px-2 py-1.5">
                <div className="text-[14px] font-bold text-fg">{v}</div>
                <div className="truncate text-[10px] text-fg-faint">{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          Every figure traced to a research note
        </div>
      </div>
    </Frame>
  );
}

/** 06 — two real files, and no coordinate chosen by a model. */
export function RenderMock() {
  return (
    <Frame label="forge / render">
      <div className="space-y-2">
        {[["deck.pptx", "25 slides · Swiss International"], ["report.docx", "14 pages · contents paginated"]].map(([f, s]) => (
          <div key={f} className="flex items-center gap-2.5 rounded-lg border border-line bg-sunken px-3 py-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-tint font-mono text-[9px] font-bold text-accent">
              {f.split(".")[1].toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-[11.5px] text-fg">{f}</div>
              <div className="truncate text-[10.5px] text-fg-faint">{s}</div>
            </div>
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-fg-faint" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" /></svg>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[11px] text-fg-faint">Chrome, theme and content stay in separate layers. The model wrote none of the layout.</div>
    </Frame>
  );
}

/** 07 — the render gets inspected. */
export function CritiqueMock() {
  return (
    <Frame label="forge / slide-07.png · read back">
      <div className="rounded-lg border border-amber/30 bg-amber/10 p-3">
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-amber">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4m0 4h.01M10.3 3.3 3.3 10.3a1.5 1.5 0 0 0 0 2.1l6.9 6.9a1.5 1.5 0 0 0 2.1 0l6.9-6.9a1.5 1.5 0 0 0 0-2.1L12.4 3.3a1.5 1.5 0 0 0-2.1 0Z" /></svg>
          caught in the image
        </div>
        <div className="mt-2 text-[12px] leading-relaxed text-fg">
          Body would need <span className="font-semibold">9.9pt</span> to fit — the floor is 14pt.
        </div>
        <div className="mt-1 text-[11.5px] text-fg-muted">The fix is less text, never a smaller font.</div>
      </div>
      <div className="mt-3 font-mono text-[10px] text-fg-faint">rasterise → read back → trim → re-render</div>
    </Frame>
  );
}

export const PIPELINE_MOCKS = [BriefMock, ResearchMock, OutlineMock, GateMock, ContentMock, RenderMock, CritiqueMock];
