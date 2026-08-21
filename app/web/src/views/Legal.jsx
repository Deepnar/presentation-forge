import { useEffect, useState } from "react";
import { marked } from "marked";
import { api } from "../api.js";

function LegalShell({ eyebrow, title, subtitle, children }) {
  return (
    <div className="w-full bg-base">
      <div className="mx-auto max-w-4xl px-6 py-10 sm:px-10 sm:py-12">
        <div className="rounded-[1.5rem] border border-line bg-panel p-8 shadow-[var(--shadow-card)] sm:p-10">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">{eyebrow}</div>
          <h1 className="mt-2 text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.02em] text-fg">{title}</h1>
          {subtitle && <p className="mt-2 text-[13px] leading-relaxed text-fg-faint">{subtitle}</p>}
          <div className="mt-6 h-px bg-line" />
          <div className="mt-6 text-[14px] leading-relaxed text-fg-muted">{children}</div>
          <div className="mt-8 flex flex-wrap gap-2">
            <a href="#/home" className="rounded-full border border-line bg-panel px-3.5 py-1.5 text-[13px] font-medium text-fg-muted hover:border-line-strong hover:text-fg">Back to tour</a>
            <a href="#/docs" className="rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-accent-hi">Docs</a>
            <a href="#/usage" className="rounded-full border border-line bg-panel px-3.5 py-1.5 text-[13px] font-medium text-fg-muted hover:border-line-strong hover:text-fg">API usage</a>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Privacy() {
  return (
    <LegalShell eyebrow="Legal · Privacy" title="Privacy Policy" subtitle={`Last updated ${new Date().getFullYear()} · Hosted`}>
      <div className="space-y-8">
        <section>
          <h2 className="text-[15px] font-semibold text-fg">Overview</h2>
          <p className="mt-2">Presentation Forge is hosted. Decks, reports, research, chats and uploads live on the server you deploy to. We don’t sell, share or mine your content. Admin can see deck counts for ops; no content is used for training.</p>
        </section>
        <section>
          <h2 className="text-[15px] font-semibold text-fg">What we store</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Account — email, display name, password hash or Google ID, session tokens.</li>
            <li>Content — <code className="rounded bg-sunken px-1 py-0.5 font-mono text-[12px]">decks/&lt;slug&gt;/</code> with <code>deck.yaml</code>, <code>report.yaml</code>, <code>research/</code>, <code>script.md</code>, uploaded assets.</li>
            <li>Config — per-user API keys (AES-256-GCM encrypted with <code>FORGE_KEY_PEPPER</code>, never logged), presets, identity.</li>
            <li>Ops — <code>auto_events</code> counters for Auto rate limits, sweep logs.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-[15px] font-semibold text-fg">Model calls</h2>
          <p className="mt-2">When you generate, the brief, research notes, slide purposes and your chosen theme voice are sent to the model backend (Auto or your Cloud provider). No other files or browsing history are sent. If you use upload-only research, that file becomes <code>research/notes.md</code> and is the sole source.</p>
        </section>
        <section>
          <h2 className="text-[15px] font-semibold text-fg">Retention & deletion</h2>
          <p className="mt-2">Delete any deck from the deck row menu — it removes the folder and its previews. Monthly sweep deletes decks older than <code>FORGE_SWEEP_DAYS</code> (default 90) unless <code>meta.keep:true</code>. You can clear your key in Profile → Keys and log out to drop the session.</p>
        </section>
        <section className="rounded-xl border border-accent/20 bg-accent-tint p-4">
          <div className="text-[13px] font-semibold text-accent">Questions?</div>
          <p className="mt-1 text-[13px]">Open an issue on <a href="https://github.com/Deepnar/presentation-forge" target="_blank" rel="noreferrer" className="text-accent underline">GitHub</a> or contact your admin. Campus Auto quota questions → CoE coordinator.</p>
        </section>
      </div>
    </LegalShell>
  );
}
export function Terms() {
  return (
    <LegalShell eyebrow="Legal · Terms" title="Terms of Service" subtitle="Be reasonable. Hosted, MIT for code.">
      <div className="space-y-8">
        <section>
          <h2 className="text-[15px] font-semibold text-fg">Your responsibility</h2>
          <p className="mt-2">You’re responsible for what you generate and how you use it. Verify grounded figures in the Research view and speaker notes before presenting. Don’t submit invented data — the grounding badge exists for that check.</p>
        </section>
        <section>
          <h2 className="text-[15px] font-semibold text-fg">Acceptable use</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>No scraping of research endpoints beyond normal deck creation.</li>
            <li>No illegal, non-consensual, or infringing briefing files.</li>
            <li>Respect your institution — the donor template is a formatting aid, not permission to bypass rules.</li>
            <li>Auto shared tier: no spamming or bulk generation to exhaust quota.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-[15px] font-semibold text-fg">Quotas</h2>
          <p className="mt-2">Auto is rate-limited (hourly/weekly requests, slides, tokens, max 30 slides/deck — see <a href="#/usage" className="text-accent underline">API usage</a>). Cloud (BYOK) is unlimited and billed to your provider. We may adjust limits to keep the service fair.</p>
        </section>
        <section>
          <h2 className="text-[15px] font-semibold text-fg">Warranty</h2>
          <p className="mt-2">Provided as-is, no warranty. Generated slides may contain errors. Use the vision critique and grounding checks, but final accuracy is yours.</p>
        </section>
      </div>
    </LegalShell>
  );
}
export function Contact() {
  return (
    <LegalShell eyebrow="Get in touch" title="Contact" subtitle="Fastest route is GitHub.">
      <div className="space-y-6">
        <p>Open an issue — bug, idea, or quota request — and we’ll triage. For campus Auto access, ping your CoE coordinator.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <a href="https://github.com/Deepnar/presentation-forge/issues/new" target="_blank" rel="noreferrer" className="rounded-xl border border-line bg-sunken p-4 hover:border-accent/30">
            <div className="text-[13px] font-semibold text-fg">Open an issue</div>
            <div className="text-[13px] text-fg-muted">GitHub — tracked, searchable.</div>
          </a>
          <a href="mailto:hello@presentation-forge.local" className="rounded-xl border border-line bg-sunken p-4 hover:border-accent/30">
            <div className="text-[13px] font-semibold text-fg">Email</div>
            <div className="text-[13px] text-fg-muted">hello@presentation-forge.local</div>
          </a>
          <a href="#/docs" className="rounded-xl border border-line bg-sunken p-4 hover:border-accent/30">
            <div className="text-[13px] font-semibold text-fg">Docs</div>
            <div className="text-[13px] text-fg-muted">Pipeline, themes, deployment.</div>
          </a>
          <a href="#/usage" className="rounded-xl border border-line bg-sunken p-4 hover:border-accent/30">
            <div className="text-[13px] font-semibold text-fg">API usage</div>
            <div className="text-[13px] text-fg-muted">Limits, tokens, slides.</div>
          </a>
        </div>
      </div>
    </LegalShell>
  );
}

export function Docs() {
  const [html, setHtml] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    api.docs()
      .then((text) => {
        marked.setOptions({ gfm: true, breaks: false });
        const raw = marked.parse(text);
        setHtml(raw);
      })
      .catch((e) => setErr(String(e.message || e)));
  }, []);
  return (
    <div className="w-full bg-base">
      <div className="mx-auto max-w-5xl px-6 py-8 sm:px-10 sm:py-10">
        <div className="mb-6 flex items-center gap-2 text-[12px] text-fg-faint">
          <a href="#/home" className="hover:text-fg">Tour</a>
          <span>›</span>
          <span className="text-fg">Documentation</span>
          <span className="ml-auto hidden sm:inline-flex items-center gap-2">
            <a href="/api/docs" target="_blank" rel="noreferrer" className="rounded-full border border-line bg-panel px-3 py-1 text-[12px] text-fg-muted hover:border-line-strong hover:text-fg">Raw MD</a>
          </span>
        </div>
        <div className="rounded-[1.5rem] border border-line bg-panel shadow-[var(--shadow-card)]">
          <div className="border-b border-line px-6 py-6 sm:px-8">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">Resources</div>
            <h1 className="mt-2 text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.02em] text-fg">Documentation</h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-fg-muted">The pipeline, themes, deployment and API — rendered from the same README at <code className="rounded bg-sunken px-1 py-0.5 font-mono text-[12px]">GET /api/docs</code>.</p>
          </div>
          <div className="px-6 py-6 sm:px-8">
            {html === null && !err && <div className="space-y-3"><div className="h-6 w-3/4 skeleton rounded" /><div className="h-32 skeleton rounded-xl" /></div>}
            {err && <div className="rounded-xl border border-danger/20 bg-danger/10 p-4 text-[13px] text-danger">{err}</div>}
            {html && (
              <div className="prose prose-sm max-w-none prose-headings:tracking-tight prose-headings:text-fg prose-p:text-fg-muted prose-a:text-accent prose-strong:text-fg prose-code:rounded prose-code:bg-sunken prose-code:px-1 prose-code:py-0.5 prose-code:font-mono prose-code:text-[12px] prose-pre:bg-[#0B0F1A] prose-pre:text-white prose-pre:rounded-xl prose-table:text-[13px] prose-th:text-fg prose-td:text-fg-muted" dangerouslySetInnerHTML={{ __html: html }} />
            )}
          </div>
        </div>
        <div className="mt-6 flex gap-2">
          <a href="#/home" className="rounded-full border border-line bg-panel px-3.5 py-1.5 text-[13px] font-medium text-fg-muted hover:border-line-strong hover:text-fg">Back to tour</a>
          <a href="#/usage" className="rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-accent-hi">API usage</a>
        </div>
      </div>
    </div>
  );
}

export function Usage() {
  const [usage, setUsage] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    api.autoUsage().then((r) => setUsage(r.usage ?? r)).catch((e) => setErr(String(e.message || e)));
  }, []);
  return (
    <div className="w-full bg-base">
      <div className="mx-auto max-w-4xl px-6 py-8 sm:px-10 sm:py-10">
        <div className="rounded-[1.5rem] border border-line bg-panel p-8 shadow-[var(--shadow-card)] sm:p-10">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">Resources · API</div>
          <h1 className="mt-2 text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.02em] text-fg">API usage & limits</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">Auto is free and rate-limited. Cloud (BYOK) is your key, unlimited. This page shows your current windows.</p>
          <div className="mt-6 h-px bg-line" />
          {err && <div className="mt-6 rounded-xl border border-danger/20 bg-danger/10 p-4 text-[13px] text-danger">Could not load usage — {err}. Log in to see your windows.</div>}
          {!err && !usage && <div className="mt-6 h-32 skeleton rounded-xl" />}
          {usage && (
            <div className="mt-6 space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  ["Hourly", usage.hourly ?? usage.hour ?? "—"],
                  ["Weekly", usage.weekly ?? usage.week ?? "—"],
                  ["Max slides/deck", "30"],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-line bg-sunken p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-faint">{k}</div>
                    <div className="mt-1 font-mono text-[13px] text-fg">{typeof v === "object" ? JSON.stringify(v, null, 2) : String(v)}</div>
                  </div>
                ))}
              </div>
              <div className="overflow-auto rounded-xl border border-line">
                <pre className="p-4 font-mono text-[12px] leading-relaxed text-fg-muted">{JSON.stringify(usage, null, 2)}</pre>
              </div>
              <p className="text-[12px] text-fg-faint">Limits are sliding windows — oldest events fall out automatically. Cloud routing ignores these.</p>
            </div>
          )}
          <div className="mt-8 flex gap-2">
            <a href="#/home" className="rounded-full border border-line bg-panel px-3.5 py-1.5 text-[13px] font-medium text-fg-muted hover:border-line-strong hover:text-fg">Back to tour</a>
            <a href="#/docs" className="rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-accent-hi">Docs</a>
          </div>
        </div>
      </div>
    </div>
  );
}
