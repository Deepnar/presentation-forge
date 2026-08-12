import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Button, Spinner, inputCls } from "./ui.jsx";

/**
 * Login / Register surface — a lightweight local account gate. Password fields
 * are type=password and never stored client-side; the API returns a session
 * token and the password is dropped on the floor server-side (scrypt-hashed
 * before anything touches disk). Honest scope: single local install, not a
 * multi-user system — accounts exist for the Cloud-key gate and future hosting.
 */
export default function AuthModal({ mode: initialMode, onDone, onClose }) {
  const [mode, setMode] = useState(initialMode ?? "login"); // login | register
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
        // Registration never hands out a session — the account is created and
        // the visitor signs in with it explicitly.
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="fade-in panel-surface w-full max-w-sm rounded-[var(--radius-lg)] border border-line bg-panel p-5 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold tracking-tight">
            {mode === "login" ? "Log in" : "Create an account"}
          </h2>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg"
            title="Close"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

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
            {mode === "login" ? "Log in" : "Register"}
          </Button>
        </form>

        <p className="mt-3 text-center text-[10.5px] leading-relaxed text-fg-faint">
          Local accounts on this machine only — the Cloud-key section and future
          hosting are gated behind one.
        </p>
      </div>
    </div>
  );
}
