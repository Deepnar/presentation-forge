import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Button, Spinner, inputCls } from "./ui.jsx";
import ParticleField from "./ParticleField.jsx";

/**
 * The landing experience. The deck workspace is per-user, so the first thing a
 * visitor sees is a clean log-in/register screen — your chats and decks are
 * yours, kept apart from everyone else's on the machine. Registration is a
 * local account: scrypt-hashed, token held only in the browser. On a locked
 * server (FORGE_OPEN_REGISTRATION=0) the register tab is replaced by a note
 * that accounts come from the owner.
 */
export default function LoginScreen({ onDone }) {
  const [mode, setMode] = useState("login"); // login | register
  const [regOpen, setRegOpen] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    api.registrationOpen().then(setRegOpen).catch(() => setRegOpen(true));
  }, []);

  // If registration closed while the form sat on the register tab, land on
  // login instead of showing a dead form.
  useEffect(() => {
    if (!regOpen && mode === "register") setMode("login");
  }, [regOpen, mode]);

  /** Route a server error to the field it names (see AuthModal — same map). */
  function routeError(message) {
    const m = String(message ?? "");
    const errors = {};
    if (/name/i.test(m)) errors.name = m;
    else if (/email/i.test(m)) errors.email = m;
    else if (/password/i.test(m)) errors.password = m;
    if (Object.keys(errors).length) { setFieldErrors(errors); setFormError(""); }
    else { setFieldErrors({}); setFormError(m); }
  }

  const fieldCls = (field) =>
    `${inputCls} ${fieldErrors[field] ? "border-danger/70 focus:border-danger" : ""}`;

  const ErrorLine = ({ field }) =>
    fieldErrors[field] ? (
      <div className="mt-1 flex items-start gap-1 text-[12px] leading-relaxed text-danger">
        <svg viewBox="0 0 24 24" className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" />
        </svg>
        {fieldErrors[field]}
      </div>
    ) : null;

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFieldErrors({});
    setFormError("");
    try {
      if (mode === "login") {
        const user = await api.login({ email: email.trim(), password });
        onDone?.(user);
      } else {
        // Registration never logs in: the account exists, now the visitor signs
        // in with it. Return to the login form with the email pre-filled.
        const user = await api.register({ name: name.trim(), email: email.trim(), password });
        setMode("login");
        setPassword("");
        setSuccess(`Account created for ${user.name} — log in to start.`);
      }
    } catch (err) {
      routeError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hero-glow relative flex h-full flex-col overflow-hidden">
      <ParticleField boost={1.5} className="pointer-events-none absolute inset-0 z-0 h-full w-full" />
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="glow-breathe mb-7 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-accent text-[22px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_16px_32px_-16px_rgba(0,0,0,0.8)]">
              F
            </div>
            <h1 className="mt-5 text-[2.5rem] font-semibold leading-tight tracking-tight text-fg">Presentation Forge</h1>
            <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-fg-muted">
              A topic in, a themed deck out — every model call stays on this machine.
            </p>
            <a href="#/home" className="mt-2 inline-block text-[12px] font-medium text-accent transition hover:text-accent-hi">
              Take the tour →
            </a>
          </div>

          <div className="fade-in panel-surface rounded-[var(--radius-lg)] border border-line bg-panel p-5 shadow-[var(--shadow-float)]">
            <div className="mb-4 flex items-center gap-0.5 rounded-full bg-sunken p-0.5">
              <button
                onClick={() => { setMode("login"); setFieldErrors({}); setFormError(""); setSuccess(""); }}
                className={`pill px-3 py-1 text-[12px] font-medium transition ${mode === "login" ? "bg-hover text-fg" : "text-fg-faint hover:text-fg-muted"}`}
              >
                Log in
              </button>
              {regOpen && (
                <button
                  onClick={() => { setMode("register"); setFieldErrors({}); setFormError(""); setSuccess(""); }}
                  className={`pill px-3 py-1 text-[12px] font-medium transition ${mode === "register" ? "bg-hover text-fg" : "text-fg-faint hover:text-fg-muted"}`}
                >
                  Register
                </button>
              )}
            </div>

            {!regOpen && (
              <div className="mb-4 rounded-lg border border-line bg-sunken px-3 py-2.5 text-[12px] leading-relaxed text-fg-muted">
                This server belongs to one owner and accounts are closed —
                ask them to add you, or use the account they set up.
              </div>
            )}

            <form onSubmit={submit} className="space-y-3" noValidate>
              {mode === "register" && (
                <label className="block">
                  <div className="mb-1.5 text-[12px] font-medium text-fg-faint">Name</div>
                  <input
                    value={name}
                    onChange={(e) => { setName(e.target.value); if (fieldErrors.name) setFieldErrors({}); }}
                    autoComplete="name"
                    className={fieldCls("name")}
                  />
                  <ErrorLine field="name" />
                </label>
              )}
              <label className="block">
                <div className="mb-1.5 text-[12px] font-medium text-fg-faint">Email</div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (fieldErrors.email) setFieldErrors({}); }}
                  autoComplete="email"
                  className={fieldCls("email")}
                />
                <ErrorLine field="email" />
              </label>
              <label className="block">
                <div className="mb-1.5 text-[12px] font-medium text-fg-faint">Password</div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (fieldErrors.password) setFieldErrors({}); }}
                  minLength={mode === "register" ? 8 : undefined}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className={fieldCls("password")}
                />
                {mode === "register" && !fieldErrors.password && (
                  <div className="mt-1 text-[12px] text-fg-faint">at least 8 characters</div>
                )}
                <ErrorLine field="password" />
              </label>

              {formError && (
                <div className="flex items-start gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] leading-relaxed text-danger">
                  <svg viewBox="0 0 24 24" className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" />
                  </svg>
                  {formError}
                </div>
              )}

              {success && (
                <div className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-[12px] leading-relaxed text-fg">
                  {success}
                </div>
              )}

              <Button type="submit" variant="primary" className="w-full" disabled={busy}>
                {busy && <Spinner />}
                {mode === "login" ? "Log in" : "Create account"}
              </Button>
            </form>

            <p className="mt-4 text-center text-[12px] leading-relaxed text-fg-faint">
              Local accounts on this machine only — your chats and decks stay
              separate for your use.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
