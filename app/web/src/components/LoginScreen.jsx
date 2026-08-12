import { useState } from "react";
import { api } from "../api.js";
import { Button, Spinner, inputCls } from "./ui.jsx";
import ParticleField from "./ParticleField.jsx";

/**
 * The landing experience. The deck workspace is per-user, so the first thing a
 * visitor sees is a clean log-in/register screen — your chats and decks are
 * yours, kept apart from everyone else's on the machine. Registration is a
 * local account: scrypt-hashed, token held only in the browser.
 */
export default function LoginScreen({ onDone }) {
  const [mode, setMode] = useState("login"); // login | register
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
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
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <ParticleField className="pointer-events-none absolute inset-0 z-0 h-full w-full" />
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-7 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-accent text-[20px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_16px_32px_-16px_rgba(0,0,0,0.8)]">
              F
            </div>
            <h1 className="mt-4 text-[1.6rem] font-semibold tracking-tight">Presentation Forge</h1>
            <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed text-fg-muted">
              A topic in, a themed deck out — every model call stays on this machine.
            </p>
          </div>

          <div className="fade-in panel-surface rounded-[var(--radius-lg)] border border-line bg-panel p-5 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)]">
            <div className="mb-4 flex items-center gap-0.5 rounded-full bg-sunken p-0.5">
              <button
                onClick={() => { setMode("login"); setError(""); setSuccess(""); }}
                className={`pill px-3 py-1 text-[12px] font-medium transition ${mode === "login" ? "bg-hover text-fg" : "text-fg-faint hover:text-fg-muted"}`}
              >
                Log in
              </button>
              <button
                onClick={() => { setMode("register"); setError(""); setSuccess(""); }}
                className={`pill px-3 py-1 text-[12px] font-medium transition ${mode === "register" ? "bg-hover text-fg" : "text-fg-faint hover:text-fg-muted"}`}
              >
                Register
              </button>
            </div>

            <form onSubmit={submit} className="space-y-3">
              {mode === "register" && (
                <label className="block">
                  <div className="mb-1.5 text-[11px] font-medium text-fg-faint">Name</div>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                    className={inputCls}
                  />
                </label>
              )}
              <label className="block">
                <div className="mb-1.5 text-[11px] font-medium text-fg-faint">Email</div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className={inputCls}
                />
              </label>
              <label className="block">
                <div className="mb-1.5 text-[11px] font-medium text-fg-faint">Password</div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === "register" ? 8 : undefined}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className={inputCls}
                />
                {mode === "register" && (
                  <div className="mt-1 text-[10.5px] text-fg-faint">at least 8 characters</div>
                )}
              </label>

              {error && (
                <div className="rounded-lg border border-amber/30 bg-amber/5 px-3 py-2 text-[12px] leading-relaxed text-amber">
                  {error}
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

            <p className="mt-4 text-center text-[10.5px] leading-relaxed text-fg-faint">
              Local accounts on this machine only — your chats and decks stay
              separate for your use.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
