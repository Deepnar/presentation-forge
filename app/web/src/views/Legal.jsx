import { useEffect, useState } from "react";
import { marked } from "marked";
import { api } from "../api.js";
import RetentionNotice from "../components/RetentionNotice.jsx";
import Footer from "../components/Footer.jsx";

function FullShell({ eyebrow, title, subtitle, children, aside }) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full flex-col bg-base">
      <div className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-8 sm:px-10 sm:py-12">
        <div className="flex items-center gap-2 text-[12px] text-fg-faint">
          <a href="#/home" className="hover:text-fg">Tour</a>
          <span>›</span>
          <span className="text-fg">{title}</span>
        </div>
        <div className="mt-8 grid gap-10 lg:grid-cols-[220px_1fr] lg:gap-16">
          <aside className="hidden lg:block">
            <div className="sticky top-20 space-y-6">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-faint">On this page</div>
                <div className="mt-3 flex flex-col gap-1.5 text-[13px]">
                  <a href="#/privacy" className={`hover:text-fg ${title === "Privacy Policy" ? "text-accent font-medium" : "text-fg-muted"}`}>Privacy</a>
                  <a href="#/terms" className={`hover:text-fg ${title === "Terms of Service" ? "text-accent font-medium" : "text-fg-muted"}`}>Terms</a>
                  <a href="#/contact" className={`hover:text-fg ${title === "Contact" ? "text-accent font-medium" : "text-fg-muted"}`}>Contact</a>
                  <a href="#/docs" className={`hover:text-fg ${title === "Documentation" ? "text-accent font-medium" : "text-fg-muted"}`}>Docs</a>
                  <a href="#/usage" className={`hover:text-fg ${title === "API usage & limits" ? "text-accent font-medium" : "text-fg-muted"}`}>API usage</a>
                  <a href="#/tour-themes" className="hover:text-fg text-fg-muted">Themes showcase</a>
                </div>
              </div>
              {aside}
            </div>
          </aside>
          <article className="min-w-0">
            <div className="max-w-3xl">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">{eyebrow}</div>
              <h1 className="mt-3 text-[2.6rem] font-semibold leading-[0.95] tracking-[-0.03em] text-fg sm:text-[3rem]">{title}</h1>
              {subtitle && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-fg-muted">{subtitle}</p>}
              <div className="mt-6 h-px bg-line" />
            </div>
            <div className="mt-8 max-w-3xl text-[15px] leading-relaxed text-fg">{children}</div>
          </article>
        </div>
      </div>
      <Footer />
    </div>
  );
}

export function Privacy() {
  return (
    <FullShell eyebrow="Legal · Privacy" title="Privacy Policy" subtitle={`Last updated ${new Date().getFullYear()} · Hosted`}>
      <div className="space-y-10">
        <section>
          <h2 className="text-[18px] font-semibold tracking-tight text-fg">Overview</h2>
          <p className="mt-3 max-w-2xl">Presentation Forge is hosted. Decks, reports, research, chats and uploads live on the server you deploy to. We don’t sell, share or mine your content. Admin can see deck counts for ops; no content is used for training.</p>
        </section>
        <section>
          <h2 className="text-[18px] font-semibold tracking-tight text-fg">What we store</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {[
              ["Account", "Email, display name, password hash or Google ID, session tokens."],
              ["Content", "decks/<slug>/ with deck.yaml, report.yaml, research/, script.md, uploaded assets."],
              ["Config", "Per-user API keys (AES-256-GCM with FORGE_KEY_PEPPER, never logged), presets, identity."],
              ["Ops", "auto_events counters for Auto rate limits, sweep logs."],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line bg-panel p-4">
                <div className="text-[13px] font-semibold text-fg">{k}</div>
                <div className="mt-1 text-[13px] leading-relaxed text-fg-muted">{v}</div>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2 className="text-[18px] font-semibold tracking-tight text-fg">Model calls</h2>
          <p className="mt-3">When you generate, the brief, research notes, slide purposes and your chosen theme voice are sent to the model backend (Auto or your Cloud provider). No other files or browsing history are sent. If you use upload-only research, that file becomes <code className="rounded bg-sunken px-1 py-0.5 font-mono text-[12px]">research/notes.md</code> and is the sole source.</p>
        </section>
        <section>
          <h2 className="text-[18px] font-semibold tracking-tight text-fg">Retention & deletion</h2>
          <p className="mt-3">Delete any deck from the deck row menu — it removes the folder and its previews. You can clear your key in Profile → Keys and log out to drop the session.</p>
          <RetentionNotice className="mt-3" />
        </section>
        <div className="rounded-xl border border-accent/20 bg-accent-tint p-5">
          <div className="text-[13px] font-semibold text-accent">Questions?</div>
          <p className="mt-1 text-[13px] leading-relaxed">Open an issue on <a href="https://github.com/Deepnar/presentation-forge" target="_blank" rel="noreferrer" className="text-accent underline">GitHub</a> or contact your admin. Campus Auto quota → CoE coordinator.</p>
        </div>
      </div>
    </FullShell>
  );
}
export function Terms() {
  return (
    <FullShell eyebrow="Legal · Terms" title="Terms of Service" subtitle="Be reasonable. Hosted, MIT for code.">
      <div className="space-y-10">
        <section>
          <h2 className="text-[18px] font-semibold tracking-tight text-fg">Your responsibility</h2>
          <p className="mt-3">You’re responsible for what you generate and how you use it. Verify grounded figures in the Research view and speaker notes before presenting. Don’t submit invented data — the grounding badge exists for that check.</p>
        </section>
        <section>
          <h2 className="text-[18px] font-semibold tracking-tight text-fg">Acceptable use</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-panel p-4 text-[13px] leading-relaxed">No scraping of research endpoints beyond normal deck creation.</div>
            <div className="rounded-xl border border-line bg-panel p-4 text-[13px] leading-relaxed">No illegal, non-consensual, or infringing briefing files.</div>
            <div className="rounded-xl border border-line bg-panel p-4 text-[13px] leading-relaxed">Respect your institution — donor template is formatting aid, not permission.</div>
            <div className="rounded-xl border border-line bg-panel p-4 text-[13px] leading-relaxed">Auto shared tier: no spamming or bulk generation to exhaust quota.</div>
          </div>
        </section>
        <section>
          <h2 className="text-[18px] font-semibold tracking-tight text-fg">Quotas</h2>
          <p className="mt-3">Auto is rate-limited (hourly/weekly requests, slides, tokens, max 30 slides/deck — see <a href="#/usage" className="text-accent underline">API usage</a>). Cloud (BYOK) is unlimited and billed to your provider. We may adjust limits to keep it fair.</p>
        </section>
        <section>
          <h2 className="text-[18px] font-semibold tracking-tight text-fg">Warranty</h2>
          <p className="mt-3">Provided as-is, no warranty. Generated slides may contain errors. Use the vision critique and grounding checks, but final accuracy is yours.</p>
        </section>
      </div>
    </FullShell>
  );
}
export function Contact() {
  return (
    <FullShell eyebrow="Get in touch" title="Contact" subtitle="Fastest route is GitHub.">
      <div className="space-y-8">
        <p className="max-w-2xl">Open an issue — bug, idea, or quota request — and we’ll triage. For campus Auto access, ping your CoE coordinator.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <a href="https://github.com/Deepnar/presentation-forge/issues/new" target="_blank" rel="noreferrer" className="group rounded-2xl border border-line bg-panel p-6 hover:border-accent/30">
            <div className="text-[14px] font-semibold text-fg group-hover:text-accent">Open an issue</div>
            <div className="mt-1 text-[13px] leading-relaxed text-fg-muted">GitHub — tracked, searchable. Best for bugs & features.</div>
          </a>
          <a href="mailto:hello@presentation-forge.local" className="group rounded-2xl border border-line bg-panel p-6 hover:border-accent/30">
            <div className="text-[14px] font-semibold text-fg group-hover:text-accent">Email</div>
            <div className="mt-1 font-mono text-[13px] text-fg-muted">hello@presentation-forge.local</div>
          </a>
          <a href="#/docs" className="group rounded-2xl border border-line bg-sunken p-6 hover:border-accent/30">
            <div className="text-[14px] font-semibold text-fg group-hover:text-accent">Docs</div>
            <div className="mt-1 text-[13px] leading-relaxed text-fg-muted">Pipeline, themes, deployment and API.</div>
          </a>
          <a href="#/usage" className="group rounded-2xl border border-line bg-sunken p-6 hover:border-accent/30">
            <div className="text-[14px] font-semibold text-fg group-hover:text-accent">API usage</div>
            <div className="mt-1 text-[13px] leading-relaxed text-fg-muted">Limits, tokens, slides — your windows.</div>
          </a>
        </div>
      </div>
    </FullShell>
  );
}

export function Docs() {
  const [html, setHtml] = useState(null);
  const [err, setErr] = useState(null);
  const [toc, setToc] = useState([]);
  useEffect(() => {
    api.docs()
      .then((text) => {
        marked.setOptions({ gfm: true, breaks: false });
        const raw = marked.parse(text);
        // build TOC from headings
        const headings = [];
        const re = /<h([1-3])[^>]*>(.*?)<\/h\1>/gi;
        let m;
        while ((m = re.exec(raw))) {
          const level = Number(m[1]);
          const title = m[2].replace(/<[^>]+>/g, "");
          const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          headings.push({ level, title, id });
        }
        // inject ids
        let htmlWithIds = raw;
        headings.forEach(({ title, id }) => {
          htmlWithIds = htmlWithIds.replace(`>${title}<`, ` id="${id}">${title}<`);
        });
        setToc(headings.filter((h) => h.level <= 2).slice(0, 12));
        setHtml(htmlWithIds);
      })
      .catch((e) => setErr(String(e.message || e)));
  }, []);
  return (
    <div className="w-full bg-base">
      <div className="mx-auto max-w-[1440px] px-6 py-6 sm:px-10 sm:py-8">
        <div className="flex items-center gap-2 text-[12px] text-fg-faint">
          <a href="#/home" className="hover:text-fg">Tour</a>
          <span>›</span>
          <span className="text-fg">Documentation</span>
          <span className="ml-auto hidden sm:inline-flex items-center gap-2">
            <a href="/api/docs" target="_blank" rel="noreferrer" className="rounded-full border border-line bg-panel px-3 py-1 text-[12px] text-fg-muted hover:border-line-strong hover:text-fg">Raw MD</a>
          </span>
        </div>
        <div className="mt-8 grid gap-10 lg:grid-cols-[240px_1fr_200px] lg:gap-8">
          <aside className="hidden lg:block">
            <div className="sticky top-20">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-faint">On this page</div>
              <div className="mt-3 flex flex-col gap-1.5 text-[13px]">
                {toc.map((h) => (
                  <button key={h.id} onClick={(e) => { e.preventDefault(); document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className={`text-left hover:text-fg ${h.level === 1 ? "font-medium text-fg" : "pl-3 text-fg-muted"}`}>{h.title}</button>
                ))}
                {toc.length === 0 && <span className="text-fg-faint">Loading…</span>}
              </div>
              <div className="mt-8 rounded-xl border border-line bg-panel p-4">
                <div className="text-[12px] font-semibold text-fg">Need more?</div>
                <div className="mt-1 text-[12px] leading-relaxed text-fg-muted">Same README at <code className="font-mono text-[11px]">GET /api/docs</code>. Clone and run <code className="font-mono text-[11px]">npm run dev</code>.</div>
              </div>
            </div>
          </aside>
          <article className="min-w-0">
            <div className="border-b border-line pb-6">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">Resources</div>
              <h1 className="mt-3 text-[2.4rem] font-semibold leading-[0.95] tracking-[-0.03em] text-fg">Documentation</h1>
              <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-fg-muted">The pipeline, themes, deployment and API — the same markdown the server exposes, rendered as editorial documentation.</p>
            </div>
            <div className="mt-6">
              {html === null && !err && <div className="space-y-3"><div className="h-6 w-3/4 skeleton rounded" /><div className="h-64 skeleton rounded-xl" /></div>}
              {err && <div className="rounded-xl border border-danger/20 bg-danger/10 p-4 text-[13px] text-danger">{err}</div>}
              {html && (
                <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:scroll-mt-24 prose-headings:tracking-tight prose-headings:text-fg prose-h1:text-[1.8rem] prose-h2:text-[1.35rem] prose-h2:mt-10 prose-h2:border-b prose-h2:border-line prose-h2:pb-2 prose-p:text-fg prose-p:leading-relaxed prose-a:text-accent prose-strong:text-fg prose-code:rounded prose-code:bg-sunken prose-code:px-1 prose-code:py-0.5 prose-code:font-mono prose-code:text-[12px] prose-code:text-fg prose-pre:bg-[#0B0F1A] prose-pre:text-white prose-pre:rounded-xl prose-pre:p-4 prose-pre:overflow-x-auto prose-table:text-[13px] prose-th:text-fg prose-td:text-fg prose-li:text-fg prose-ul:text-fg" dangerouslySetInnerHTML={{ __html: html }} />
              )}
            </div>
          </article>
          <aside className="hidden lg:block">
            <div className="sticky top-20 rounded-xl border border-line bg-panel p-4">
              <div className="text-[12px] font-semibold text-fg">Quick links</div>
              <div className="mt-2 flex flex-col gap-1.5 text-[13px]">
                <a href="#/usage" className="text-fg-muted hover:text-accent">API usage</a>
                <a href="#/tour-themes" className="text-fg-muted hover:text-accent">Themes showcase</a>
                <a href="https://github.com/Deepnar/presentation-forge" target="_blank" rel="noreferrer" className="text-fg-muted hover:text-accent">GitHub →</a>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <Footer />
    </div>
  );
}

export function Usage() {
  const [usage, setUsage] = useState(null);
  const [limits, setLimits] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    // try per-user usage first, fall back to public limits so page is useful unauth
    api.autoUsage()
      .then((r) => {
        setUsage(r.usage ?? r);
        setLimits(r.limits ?? null);
      })
      .catch((e) => {
        // if 401 (log in), still fetch public limits
        setErr(String(e.message || e));
        fetch("/api/auto/status").then((r) => r.json()).then((j) => {
          if (j.ok) setLimits(j.limits ?? null);
        }).catch(() => {});
      });
    // also fetch limits standalone for header
    fetch("/api/auto/status").then((r) => r.json()).then((j) => { if (j.ok && j.limits) setLimits((prev) => prev ?? j.limits); }).catch(() => {});
  }, []);
  const hourly = usage?.hourly ?? usage?.hour ?? null;
  const weekly = usage?.weekly ?? usage?.week ?? null;
  return (
    <div className="w-full bg-base">
      <div className="mx-auto max-w-[1440px] px-6 py-8 sm:px-10 sm:py-12">
        <div className="flex items-center gap-2 text-[12px] text-fg-faint">
          <a href="#/home" className="hover:text-fg">Tour</a>
          <span>›</span>
          <span className="text-fg">API usage</span>
        </div>
        <div className="mt-8 grid gap-10 lg:grid-cols-[240px_1fr] lg:gap-16">
          <aside className="hidden lg:block">
            <div className="sticky top-20">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-faint">On this page</div>
              <div className="mt-3 flex flex-col gap-1.5 text-[13px]">
                <a href="#/privacy" className="text-fg-muted hover:text-fg">Privacy</a>
                <a href="#/terms" className="text-fg-muted hover:text-fg">Terms</a>
                <a href="#/docs" className="text-fg-muted hover:text-fg">Docs</a>
                <a href="#/usage" className="text-accent font-medium">API usage</a>
              </div>
            </div>
          </aside>
          <div>
            <div className="max-w-2xl">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">Resources · API</div>
              <h1 className="mt-3 text-[2.6rem] font-semibold leading-[0.95] tracking-[-0.03em] text-fg">API usage & limits</h1>
              <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">Auto is free and rate-limited. Cloud (BYOK) is your key, unlimited. This page shows your current windows from <code className="rounded bg-sunken px-1 py-0.5 font-mono text-[12px]">GET /api/auto/usage</code>.</p>
            </div>
            {err && !usage && limits && (
              <div className="mt-8 rounded-xl border border-accent/20 bg-accent-tint p-4 text-[13px] text-accent">Log in to see your personal windows — showing public limits below.</div>
            )}
            {err && !usage && !limits && <div className="mt-8 rounded-xl border border-danger/20 bg-danger/10 p-4 text-[13px] text-danger">Could not load — {err}</div>}
            {!err && !usage && !limits && <div className="mt-8 h-40 skeleton rounded-xl" />}
            {(usage || limits) && (
              <div className="mt-8 space-y-8">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-line bg-panel p-5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-faint">Hourly</div>
                    <div className="mt-2 font-mono text-[13px] leading-relaxed text-fg">{hourly ? JSON.stringify(hourly, null, 2) : limits?.hourly ? JSON.stringify(limits.hourly, null, 2) : "Log in for personal"}</div>
                  </div>
                  <div className="rounded-2xl border border-line bg-panel p-5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-faint">Weekly</div>
                    <div className="mt-2 font-mono text-[13px] leading-relaxed text-fg">{weekly ? JSON.stringify(weekly, null, 2) : limits?.weekly ? JSON.stringify(limits.weekly, null, 2) : "Log in for personal"}</div>
                  </div>
                  <div className="rounded-2xl border border-accent/20 bg-accent-tint p-5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">Max slides/deck</div>
                    <div className="mt-2 text-[22px] font-semibold tracking-tight text-fg">{limits?.maxSlidesPerDeck ?? 30}</div>
                    <div className="text-[12px] text-fg-muted">Auto tier cap</div>
                  </div>
                </div>
                <div className="rounded-2xl border border-line bg-panel p-5">
                  <div className="text-[13px] font-semibold text-fg">Raw {usage ? "usage" : "limits"}</div>
                  <pre className="mt-3 max-h-[50vh] overflow-auto rounded-xl border border-line bg-sunken p-4 font-mono text-[12px] leading-relaxed text-fg">{JSON.stringify(usage ?? limits, null, 2)}</pre>
                </div>
                <p className="text-[12px] leading-relaxed text-fg-faint">Limits are sliding windows — oldest events fall out automatically. Switch to Cloud in the header toggle to bypass these.</p>
              </div>
            )}
            <div className="mt-10 flex gap-2">
              <a href="#/home" className="rounded-full border border-line bg-panel px-3.5 py-1.5 text-[13px] font-medium text-fg-muted hover:border-line-strong hover:text-fg">Back to tour</a>
              <a href="#/docs" className="rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-medium text-on-accent hover:bg-accent-hi">Docs</a>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
