import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Button, Spinner, inputCls } from "./ui.jsx";

/**
 * The two screens a link in an email lands on: set a new password, and confirm
 * an address.
 *
 * They are one component because they are one situation — someone arrived from
 * outside the app holding a token, and the whole screen has to work while
 * signed out. That is also why this renders above the auth gate rather than
 * inside it: a person resetting a password is by definition unable to log in,
 * and a reset kills every session the account had, so even a signed-in tab
 * lands here signed out.
 *
 * The token is in the URL fragment, which is never sent to the server. It is
 * read here and POSTed back, and the fragment is scrubbed as soon as it has
 * been spent so a shared screen or a back button does not leave it on display.
 */
export default function RecoveryScreen({ kind, token, onDone, onSignIn }) {
  const reset = kind === "reset";
  return (
    <div className="relative grid min-h-screen place-items-center bg-base px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2.5">
          <img src="/logo.svg" alt="" className="h-8 w-8 rounded-lg" />
          <span className="text-[13px] font-semibold tracking-tight">Presentation Forge</span>
        </div>
        <div className="panel-surface rounded-[var(--radius-lg)] border border-line bg-panel p-6 shadow-[var(--shadow-float)] sm:p-7">
          {reset
            ? <ResetPanel token={token} onSignIn={onSignIn} />
            : <VerifyPanel token={token} onDone={onDone} onSignIn={onSignIn} />}
        </div>
      </div>
    </div>
  );
}

/** Strip the token out of the address bar once it has been spent. */
function clearHash() {
  window.history.replaceState(null, "", "#/home");
}

function Notice({ tone = "info", children }) {
  const cls = tone === "bad"
    ? "border-danger/30 bg-danger/10 text-danger"
    : tone === "good"
      ? "border-accent/30 bg-accent/10 text-fg"
      : "border-line bg-sunken text-fg-muted";
  return (
    <div className={`rounded-lg border px-3 py-2.5 text-[12.5px] leading-relaxed ${cls}`}>
      {children}
    </div>
  );
}

function ResetPanel({ token, onSignIn }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // A rejected password comes back with a replacement token, so a typo does not
  // cost the user another email and another trip to their inbox.
  const [live, setLive] = useState(token);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <>
        <h1 className="text-[17px] font-semibold tracking-tight">This link is incomplete</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
          The address is missing its token — some mail readers break long links
          across lines. Copy the whole link out of the message, or ask for a new one.
        </p>
        <Button variant="primary" className="mt-5 w-full" onClick={onSignIn}>Back to sign in</Button>
      </>
    );
  }

  if (done) {
    return (
      <>
        <h1 className="text-[17px] font-semibold tracking-tight">Password changed</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
          Every session that was open on this account has been signed out — including
          any the reset was prompted by. Log in with the new password.
        </p>
        <Button variant="primary" className="mt-5 w-full" onClick={() => { clearHash(); onSignIn(); }}>
          Log in
        </Button>
      </>
    );
  }

  const mismatch = confirm.length > 0 && password !== confirm;

  async function submit(e) {
    e.preventDefault();
    if (busy || mismatch || password.length < 8) return;
    setBusy(true);
    setError("");
    try {
      await api.resetPassword(live, password);
      clearHash();
      setDone(true);
    } catch (err) {
      setError(err.message);
      // A replacement arrives only when the token itself was still good.
      if (err.token) setLive(err.token);
      else setLive(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="text-[17px] font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
        This link works once. Setting a password here signs out every device the
        account is open on.
      </p>
      <form onSubmit={submit} className="mt-5 space-y-3" noValidate>
        <label className="block">
          <div className="mb-1.5 text-[12px] font-medium text-fg-faint">New password</div>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            autoComplete="new-password"
            autoFocus
            className={inputCls}
          />
          <div className="mt-1 text-[12px] text-fg-faint">at least 8 characters</div>
        </label>
        <label className="block">
          <div className="mb-1.5 text-[12px] font-medium text-fg-faint">Repeat it</div>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className={`${inputCls} ${mismatch ? "border-danger/70 focus:border-danger" : ""}`}
          />
          {mismatch && <div className="mt-1 text-[12px] text-danger">the two do not match</div>}
        </label>

        {error && <Notice tone="bad">{error}</Notice>}

        {live ? (
          <Button type="submit" variant="primary" className="w-full" disabled={busy || mismatch || password.length < 8}>
            {busy && <Spinner />}
            Set password
          </Button>
        ) : (
          <Button variant="primary" className="w-full" onClick={() => { clearHash(); onSignIn(); }}>
            Ask for a new link
          </Button>
        )}
      </form>
    </>
  );
}

function VerifyPanel({ token, onDone, onSignIn }) {
  // idle → working → good | bad. The exchange starts on mount: the person
  // already clicked something, and asking them to click again to confirm the
  // click is a step that carries no decision.
  const [state, setState] = useState(token ? "working" : "bad");
  const [error, setError] = useState(token ? "" : "The address is missing its token — copy the whole link out of the message.");

  useEffect(() => {
    if (!token) return;
    let live = true;
    api.verifyEmail(token)
      .then(() => { if (!live) return; clearHash(); setState("good"); onDone?.(); })
      .catch((err) => { if (!live) return; clearHash(); setError(err.message); setState("bad"); });
    return () => { live = false; };
  }, [token]);

  if (state === "working") {
    return (
      <div className="flex items-center gap-3 text-[13px] text-fg-muted">
        <Spinner /> Confirming your address…
      </div>
    );
  }

  if (state === "good") {
    return (
      <>
        <h1 className="text-[17px] font-semibold tracking-tight">Address confirmed</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
          The account can create and generate now. Sign in to start.
        </p>
        <Button variant="primary" className="mt-5 w-full" onClick={onSignIn}>Continue</Button>
      </>
    );
  }

  return (
    <>
      <h1 className="text-[17px] font-semibold tracking-tight">That link did not work</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{error}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
        The account still exists — it just cannot create anything yet.
      </p>
      <Button variant="primary" className="mt-5 w-full" onClick={onSignIn}>Sign in</Button>
    </>
  );
}
