export default function Footer() {
  return (
    <footer className="w-full border-t border-line bg-panel">
      <div className="mx-auto max-w-[1440px] px-6 py-8 sm:px-10">
        <div className="grid grid-cols-2 gap-8 text-[13px] sm:grid-cols-4">
          <div>
            <div className="text-[12px] font-semibold tracking-tight">Product</div>
            <div className="mt-2 flex flex-col gap-0 [&>a]:py-1 [&>button]:py-1 text-fg-muted">
              <a href="#/home" className="hover:text-fg">Tour</a>
              <a href="#/tour-themes" className="hover:text-fg">Themes</a>
              <a href="https://github.com/Deepnar/presentation-forge" target="_blank" rel="noreferrer" className="hover:text-fg">GitHub</a>
              <a href="#/usage" className="hover:text-fg">API usage</a>
            </div>
          </div>
          <div>
            <div className="text-[12px] font-semibold tracking-tight">Resources</div>
            <div className="mt-2 flex flex-col gap-0 [&>a]:py-1 [&>button]:py-1 text-fg-muted">
              <a href="#/docs" className="hover:text-fg">Docs</a>
              <a href="#/home" className="hover:text-fg">How it works</a>
              <a href="#/usage" className="hover:text-fg">Usage & limits</a>
            </div>
          </div>
          <div>
            <div className="text-[12px] font-semibold tracking-tight">Legal</div>
            <div className="mt-2 flex flex-col gap-0 [&>a]:py-1 [&>button]:py-1 text-fg-muted">
              <a href="#/privacy" className="hover:text-fg">Privacy</a>
              <a href="#/terms" className="hover:text-fg">Terms</a>
              <a href="#/contact" className="hover:text-fg">Contact</a>
            </div>
          </div>
          <div>
            <div className="text-[12px] font-semibold tracking-tight">Presentation Forge</div>
            <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">Hosted decks, fast generation, your data stays yours. Cloud when you need it.</p>
          </div>
        </div>
        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 text-[12px] text-fg-faint sm:flex-row">
          <span>© {new Date().getFullYear()} Presentation Forge. MIT for code.</span>
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-success" /> All systems operational</span>
        </div>
      </div>
    </footer>
  );
}
