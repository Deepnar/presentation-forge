import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Button, Spinner, inputCls } from "./ui.jsx";
import ThemeMiniCard from "./ThemeMiniCard.jsx";

/**
 * Login / Sign-up surface — a proper split screen. Left is visual: the
 * logo, the product tagline and a live strip of theme specimens (the ember
 * particle field lives behind the whole app shell). Right is the clean
 * sign-up/login card, labelled "Sign up" as the primary action. Password
 * fields are type=password and never stored client-side; the API returns a
 * session token and the password is dropped on the floor server-side
 * (scrypt-hashed before anything touches disk). Honest scope: single local
 * install, not a multi-user system — accounts exist for the Cloud-key gate
 * and future hosting.
 */
export default function AuthModal({ mode: initialMode, onDone, onClose }) {
  const [mode, setMode] = useState(initialMode ?? "login"); // login | register | forgot
  const [regOpen, setRegOpen] = useState(true);
  // What this install can actually offer. A box with no SMTP cannot deliver a
  // reset, so offering one would be a link to a dead end; and it confirms
  // accounts on creation, so the sign-up copy must not promise an email.
  const [mailOk, setMailOk] = useState(false);
  const [verifyRequired, setVerifyRequired] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [googleId, setGoogleId] = useState(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({}); // field → message
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [themes, setThemes] = useState(null);

  useEffect(() => {
    api.authConfig().then((c) => {
      setRegOpen(c.open === true);
      setMailOk(c.mail === true);
      setVerifyRequired(c.verifyRequired === true);
    }).catch(() => setRegOpen(true));
    api.themes().then((r) => setThemes(r.themes)).catch(() => setThemes([]));
    fetch("/api/auth/google/config").then((r) => r.json()).then((j) => setGoogleId(j.clientId ?? j.googleClientId ?? null)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!googleId) return;
    if (document.getElementById("google-gsi")) return;
    const s = document.createElement("script");
    s.id = "google-gsi";
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    document.head.appendChild(s);
  }, [googleId]);

  // If registration closed while the form sat on the register tab, land on
  // login instead of showing a dead form.
  useEffect(() => {
    if (!regOpen && mode === "register") setMode("login");
  }, [regOpen, mode]);

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
      if (mode === "forgot") {
        // The answer never varies, so neither does the message. Saying "no
        // account with that address" here would hand a stranger the account
        // list one guess at a time.
        await api.forgotPassword(email.trim());
        setForgotSent(true);
      } else if (mode === "login") {
        const user = await api.login({ email: email.trim(), password });
        onDone?.(user);
      } else {
        // Registration never hands out a session — the account is created and
        // the visitor signs in with it explicitly.
        const user = await api.register({ name: name.trim(), email: email.trim(), password });
        setMode("login");
        setPassword("");
        setSuccess(user.verifySent
          ? `Account created for ${user.name}. Check ${email.trim()} for the confirmation link, then log in.`
          : `Account created for ${user.name} — log in to start.`);
      }
    } catch (err) {
      routeError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function googleCredential(credential) {
    setGoogleBusy(true);
    setFormError("");
    try {
      const user = await api.googleLogin(credential);
      onDone?.(user);
    } catch (err) {
      setFormError(err.message);
    } finally { setGoogleBusy(false); }
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

  function GoogleButton() {
    if (!googleId) {
      return (
        <div className="space-y-2">
          <button
            type="button"
            disabled
            title="Set GOOGLE_CLIENT_ID to enable"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-[13px] font-medium text-[#3c4043] opacity-60"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>
          <div className="text-center text-[11px] text-fg-faint">Google sign-in needs <code className="rounded bg-sunken px-1 py-0.5 font-mono text-[11px]">GOOGLE_CLIENT_ID</code> — email/password works now</div>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <button
          type="button"
          disabled={googleBusy}
          onClick={() => {
            if (!window.google?.accounts?.id) { setFormError("Google script not loaded — refresh and try again"); return; }
            window.google.accounts.id.initialize({
              client_id: googleId,
              callback: (resp) => googleCredential(resp.credential),
            });
            window.google.accounts.id.prompt((n) => {
              if (n.isNotDisplayed() || n.isSkippedMoment()) {
                window.google.accounts.id.prompt();
              }
            });
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-[13px] font-medium text-[#3c4043] transition hover:bg-gray-50 disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          {googleBusy ? "Signing in…" : "Continue with Google"}
        </button>
        <div id="g_id_onload" style={{ display: "none" }} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--color-overlay)] backdrop-blur-md" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="fade-in panel-surface flex max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-[var(--radius-lg)] border border-line bg-panel shadow-[var(--shadow-float)]">
        {/* The visual half — logo, tagline, live theme specimens. The ember
            particle field is the app-shell background behind the modal. */}
        <div className="relative hidden w-2/5 shrink-0 flex-col justify-between overflow-hidden border-r border-line bg-sunken/60 p-7 md:flex">
          <div>
            <div className="flex items-center gap-2.5">
              <img src="/logo.svg" alt="" className="h-8 w-8 rounded-lg" />
              <span className="text-[13px] font-semibold tracking-tight">Presentation Forge</span>
            </div>
            <h2 className="mt-6 text-[1.35rem] font-semibold leading-tight tracking-[-0.01em]">
              The app does the bulk. You do the final touches.
            </h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-fg-muted">
              Research, structure, draft and render by machine. The facts and
              the final words stay yours.
            </p>
          </div>

          <div className="mt-8">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-fg-faint">
              38 themes, drawn live
            </div>
            <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {(themes ?? []).slice(0, 4).map((t) => (
                <div key={t.name} className="w-20 shrink-0">
                  <ThemeMiniCard theme={t} />
                </div>
              ))}
              {themes === null && (
                <div className="flex gap-2">
                  {[0, 1, 2].map((i) => <div key={i} className="skeleton h-16 w-20 shrink-0 rounded-card" />)}
                </div>
              )}
            </div>
            <div className="mt-4 text-[10.5px] leading-relaxed text-fg-faint">
              Hosted and ready — create, generate and share from anywhere.
            </div>
          </div>
        </div>

        {/* The card half — clean sign-up / login. */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-6 sm:p-7">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold tracking-tight">
              {mode === "forgot" ? "Reset your password" : mode === "login" ? "Log in" : "Sign up"}
            </h2>
            <button
              onClick={onClose}
              className="grid h-7 w-7 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg"
              title="Close"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>

          {mode === "forgot" ? (
            <button
              onClick={() => { setMode("login"); setForgotSent(false); setFormError(""); setFieldErrors({}); }}
              className="mb-4 flex items-center gap-1.5 self-start text-[12px] font-medium text-fg-faint transition hover:text-fg"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              Back to log in
            </button>
          ) : (
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
                Sign up
              </button>
            )}
          </div>
          )}

          {!regOpen && (
            <div className="mb-4 rounded-lg border border-line bg-sunken px-3 py-2.5 text-[12px] leading-relaxed text-fg-muted">
              This server belongs to one owner and accounts are closed —
              ask them to add you, or use the account they set up.
            </div>
          )}

          {mode !== "forgot" && <GoogleButton />}
          {mode !== "forgot" && googleId && <div className="my-3 flex items-center gap-3"><div className="h-px flex-1 bg-line" /><span className="text-[11px] text-fg-faint">or</span><div className="h-px flex-1 bg-line" /></div>}

          {mode === "forgot" && !forgotSent && (
            <p className="mb-4 text-[12.5px] leading-relaxed text-fg-muted">
              Give the address on the account and a link to set a new password
              goes to it. The link works once and expires within the hour.
            </p>
          )}

          {mode === "forgot" && forgotSent ? (
            /* The same message whether or not that address has an account.
               Confirming which addresses are registered would hand a stranger
               the account list one guess at a time. */
            <div className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-3 text-[12.5px] leading-relaxed text-fg">
              If <span className="font-medium">{email.trim()}</span> has an account with a
              password, a reset link is on its way. Check the spam folder before asking again.
              <div className="mt-1.5 text-fg-muted">
                An account that signs in with Google has no password to reset — use the
                Google button instead.
              </div>
            </div>
          ) : (
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
            {mode !== "forgot" && (
            <label className="block">
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="text-[12px] font-medium text-fg-faint">Password</span>
                {/* Only offered where a message can actually be delivered — a
                    box with no SMTP would send the visitor to a dead end. */}
                {mode === "login" && mailOk && (
                  <button
                    type="button"
                    onClick={() => { setMode("forgot"); setFormError(""); setFieldErrors({}); setSuccess(""); }}
                    className="text-[12px] font-medium text-fg-faint underline-offset-2 transition hover:text-fg hover:underline"
                  >
                    Forgot it?
                  </button>
                )}
              </div>
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
            )}

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
              {mode === "forgot" ? "Send the link" : mode === "login" ? "Log in" : "Sign up"}
            </Button>
          </form>
          )}

          {/* Nothing to say under a reset form — the panel above already says
              what happens next, and a line about Cloud keys does not. */}
          {mode !== "forgot" && (
            <p className="mt-3 text-center text-[12px] leading-relaxed text-fg-faint">
              {mode === "register" && verifyRequired
                ? "You will confirm your email before you can generate — everything else opens straight away."
                : "Hosted accounts — your decks stay on the server, Cloud keys are per account."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
