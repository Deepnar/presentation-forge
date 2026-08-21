export function Privacy() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-[13px] text-fg-faint">Last updated {new Date().getFullYear()}</p>
      <div className="prose prose-sm mt-6 max-w-none text-[14px] leading-relaxed text-fg-muted">
        <p>Presentation Forge is local-first. Decks, reports and chats you create are stored on the device you run it on (or the server you deploy to). We don’t sell, share or mine your content.</p>
        <h2 className="mt-6 text-[15px] font-semibold text-fg">What we store</h2>
        <ul className="list-disc pl-5">
          <li>Your account (email, name, password hash or Google ID)</li>
          <li>Your decks, reports, themes and uploaded files</li>
          <li>Your API key, if you add one — AES-256-GCM encrypted at rest, never logged</li>
        </ul>
        <h2 className="mt-6 text-[15px] font-semibold text-fg">Model calls</h2>
        <p>When you generate, the brief, research notes and slide purposes are sent to the model you chose (local Ollama or your cloud provider / Auto). No other browsing or file data is sent.</p>
        <h2 className="mt-6 text-[15px] font-semibold text-fg">Contact</h2>
        <p>Questions? Open an issue on GitHub or email the maintainer.</p>
      </div>
    </div>
  );
}
export function Terms() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-[13px] text-fg-faint">Be reasonable.</p>
      <div className="prose prose-sm mt-6 max-w-none text-[14px] leading-relaxed text-fg-muted">
        <p>Presentation Forge is provided as-is, MIT for code. You’re responsible for what you generate and how you use it. Don’t use the shared Auto tier to scrape, spam or break campus policy. Your API key is yours — keep it safe.</p>
        <p>We may rate-limit Auto to keep it fair. Cloud (BYOK) is unlimited and billed to your provider.</p>
      </div>
    </div>
  );
}
export function Contact() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Contact</h1>
      <div className="mt-6 text-[14px] leading-relaxed text-fg-muted">
        <p>Open an issue on <a href="https://github.com/Deepnar/presentation-forge" target="_blank" rel="noreferrer" className="text-accent hover:underline">GitHub</a> — fastest way to reach us.</p>
        <p className="mt-2">For campus Auto access or quota, contact your CoE coordinator.</p>
      </div>
    </div>
  );
}
