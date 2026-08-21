import { useEffect, useState } from "react";
import { api } from "../api.js";

function LegalShell({ eyebrow, title, subtitle, children }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="rounded-[1.5rem] border border-line bg-panel p-8 shadow-[var(--shadow-card)] sm:p-10">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">{eyebrow}</div>
        <h1 className="mt-2 text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.02em] text-fg">{title}</h1>
        {subtitle && <p className="mt-2 text-[13px] text-fg-faint">{subtitle}</p>}
        <div className="mt-6 h-px bg-line" />
        <div className="mt-6 text-[14px] leading-relaxed text-fg-muted">{children}</div>
        <div className="mt-8 flex gap-2">
          <a href="#/home" className="rounded-full border border-line bg-panel px-3.5 py-1.5 text-[13px] font-medium text-fg-muted hover:border-line-strong hover:text-fg">Back to tour</a>
          <a href="#/docs" className="rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-accent-hi">Read the docs</a>
        </div>
      </div>
    </div>
  );
}

export function Privacy() {
  return (
    <LegalShell eyebrow="Legal" title="Privacy Policy" subtitle={`Last updated ${new Date().getFullYear()}`}>
      <p>Presentation Forge is local-first. Decks, reports and chats you create are stored on the device you run it on (or the server you deploy to). We don’t sell, share or mine your content.</p>
      <h2 className="mt-8 text-[15px] font-semibold text-fg">What we store</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Your account (email, name, password hash or Google ID)</li>
        <li>Your decks, reports, themes and uploaded files</li>
        <li>Your API key, if you add one — AES-256-GCM encrypted at rest, never logged</li>
      </ul>
      <h2 className="mt-8 text-[15px] font-semibold text-fg">Model calls</h2>
      <p className="mt-2">When you generate, the brief, research notes and slide purposes are sent to the model you chose (local Ollama or your cloud provider / Auto). No other browsing or file data is sent.</p>
      <h2 className="mt-8 text-[15px] font-semibold text-fg">Your rights</h2>
      <p className="mt-2">Delete any deck from the deck row menu. Deleting removes <code className="rounded bg-sunken px-1 py-0.5 font-mono text-[12px]">decks/&lt;slug&gt;/</code> and its research folder. Your account and key can be cleared in Profile → logout + key remove.</p>
      <h2 className="mt-8 text-[15px] font-semibold text-fg">Contact</h2>
      <p className="mt-2">Questions? Open an issue on GitHub or email the maintainer.</p>
    </LegalShell>
  );
}
export function Terms() {
  return (
    <LegalShell eyebrow="Legal" title="Terms of Service" subtitle="Be reasonable.">
      <p>Presentation Forge is provided as-is, MIT for code. You’re responsible for what you generate and how you use it. Don’t use the shared Auto tier to scrape, spam or break campus policy. Your API key is yours — keep it safe.</p>
      <p className="mt-3">We may rate-limit Auto to keep it fair. Cloud (BYOK) is unlimited and billed to your provider.</p>
      <h2 className="mt-8 text-[15px] font-semibold text-fg">Acceptable use</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>No scraping of the research endpoints beyond normal deck creation.</li>
        <li>No uploading of illegal or non-consensual material as briefing files.</li>
        <li>Respect your institution’s submission rules — the report donor template is a formatting aid, not a waiver.</li>
      </ul>
      <h2 className="mt-8 text-[15px] font-semibold text-fg">Warranty</h2>
      <p className="mt-2">No warranty. Generated slides may contain grounding gaps — verify facts before you present. The grounding badge and Research view exist for that check.</p>
    </LegalShell>
  );
}
export function Contact() {
  return (
    <LegalShell eyebrow="Get in touch" title="Contact" subtitle="We’d love to hear from you.">
      <p>Open an issue on <a href="https://github.com/Deepnar/presentation-forge" target="_blank" rel="noreferrer" className="text-accent hover:underline">GitHub</a> — fastest way to reach us.</p>
      <p className="mt-2">For campus Auto access or quota, contact your CoE coordinator.</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <a href="https://github.com/Deepnar/presentation-forge/issues/new" target="_blank" rel="noreferrer" className="rounded-xl border border-line bg-sunken p-4 hover:border-accent/30">
          <div className="text-[13px] font-semibold text-fg">Open an issue</div>
          <div className="text-[13px] text-fg-muted">Bug, idea, or question — filed on GitHub.</div>
        </a>
        <a href="mailto:hello@presentation-forge.local" className="rounded-xl border border-line bg-sunken p-4 hover:border-accent/30">
          <div className="text-[13px] font-semibold text-fg">Email</div>
          <div className="text-[13px] text-fg-muted">hello@presentation-forge.local</div>
        </a>
      </div>
    </LegalShell>
  );
}

export function Docs() {
  const [text, setText] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    api.docs().then(setText).catch((e) => setErr(String(e.message || e)));
  }, []);
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="rounded-[1.5rem] border border-line bg-panel p-8 shadow-[var(--shadow-card)] sm:p-10">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">Resources</div>
        <h1 className="mt-2 text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.02em] text-fg">Documentation</h1>
        <p className="mt-2 text-[13px] text-fg-faint">The same README developers read at <code className="rounded bg-sunken px-1 py-0.5 font-mono text-[12px]">GET /api/docs</code> — styled for the tour.</p>
        <div className="mt-6 h-px bg-line" />
        {text === null && !err && <div className="mt-6 h-32 skeleton rounded-xl" />}
        {err && <div className="mt-6 rounded-xl border border-danger/20 bg-danger/10 p-4 text-[13px] text-danger">{err}</div>}
        {text && (
          <pre className="mt-6 max-h-[65vh] overflow-auto rounded-xl border border-line bg-sunken p-4 font-mono text-[12.5px] leading-relaxed text-fg-muted whitespace-pre-wrap break-words">{text}</pre>
        )}
        <div className="mt-6 flex gap-2">
          <a href="#/home" className="rounded-full border border-line bg-panel px-3.5 py-1.5 text-[13px] font-medium text-fg-muted hover:border-line-strong hover:text-fg">Back to tour</a>
          <a href="/api/docs" target="_blank" rel="noreferrer" className="rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-accent-hi">Raw README</a>
        </div>
      </div>
    </div>
  );
}
