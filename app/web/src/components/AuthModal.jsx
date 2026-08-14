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
  const [fieldErrors, setFieldErrors] = useState({}); // field → message
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /**
   * Route a server error to the offending field. The API's messages are
   * written to name the field ("a name is required", "a valid email is
   * required", "an account with that email already exists") — the field-level
   * mapping below catches them so the error sits under the input it names
   * instead of in a pill that reads as a fourth field. Login failures ("invalid
   * email or password") and network errors stay on the form.
   */
  function routeError(message) {
    const m = String(message ?? "");
    const errors = {};
    if (/name/i.test(m)) errors.name = m;
    else if (/email/i.test(m)) errors.email = m;
    else if (/password/i.test(m)) errors.password = m;
    if (Object.keys(errors).length) { setFieldErrors(errors); setFormError(""); }
    else { setFieldErrors({}); setFormError(m); }
  }

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
        // Registration never hands out a session — the account is created and
        // the visitor signs in with it explicitly.
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

  /** Field with an inline error — danger border + message under it. */
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

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--color-overlay)] backdrop-blur-md" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="fade-in panel-surface w-full max-w-sm rounded-[var(--radius-lg)] border border-line bg-panel p-5 shadow-[var(--shadow-float)]">
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
            onClick={() => { setMode("login"); setFieldErrors({}); setFormError(""); setSuccess(""); }}
            className={`pill px-3 py-1 text-[12px] font-medium transition ${mode === "login" ? "bg-hover text-fg" : "text-fg-faint hover:text-fg-muted"}`}
          >
            Log in
          </button>
          <button
            onClick={() => { setMode("register"); setFieldErrors({}); setFormError(""); setSuccess(""); }}
            className={`pill px-3 py-1 text-[12px] font-medium transition ${mode === "register" ? "bg-hover text-fg" : "text-fg-faint hover:text-fg-muted"}`}
          >
            Register
          </button>
        </div>

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
            {mode === "login" ? "Log in" : "Register"}
          </Button>
        </form>

        <p className="mt-3 text-center text-[12px] leading-relaxed text-fg-faint">
          Local accounts on this machine only — the Cloud-key section and future
          hosting are gated behind one.
        </p>
      </div>
    </div>
  );
}
