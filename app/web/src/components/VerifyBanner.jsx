import { useState } from "react";
import { api } from "../api.js";
import { Button, Spinner } from "./ui.jsx";

/**
 * The strip an unconfirmed account sees until it confirms.
 *
 * It is not a toast and not a modal. The account can sign in, look at the
 * themes and read everything — it just cannot create or generate — so the state
 * persists across the whole session and has to be legible without blocking
 * anything. A dismissible notice would hide the one explanation for the refusal
 * the person is about to hit.
 */
export default function VerifyBanner({ email }) {
  const [state, setState] = useState("idle"); // idle | sending | sent
  const [note, setNote] = useState(null); // { text, bad }

  async function resend() {
    if (state === "sending") return;
    setState("sending");
    setNote(null);
    try {
      await api.resendVerification();
      setState("sent");
    } catch (err) {
      // Being told a message is already on its way is the outcome the click
      // was asking for, not a failure — the signup itself counts against the
      // send budget, so this is what a prompt second click gets.
      const alreadySent = err.code === "recently_sent";
      setNote({ text: err.message, bad: !alreadySent });
      setState(alreadySent ? "sent" : "idle");
    }
  }

  return (
    <div className="border-b border-amber/30 bg-amber/10 px-4 py-2 text-[12.5px] leading-relaxed text-fg">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1.5">
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-amber" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 6 10-6" />
        </svg>
        <span className="min-w-0">
          Confirm <span className="font-medium">{email}</span> to start creating.
          {/* The reassurance is worth a line on a desktop and costs a third of
              a phone screen, on a strip that never goes away. */}
          <span className="hidden sm:inline"> Everything else works — you just cannot generate yet.</span>
        </span>
        {state === "sent" ? (
          <span className="text-fg-muted">{note?.text ?? "Sent — check your inbox, including spam."}</span>
        ) : (
          <Button size="sm" variant="outline" onClick={resend} disabled={state === "sending"}>
            {state === "sending" && <Spinner />}
            Resend the link
          </Button>
        )}
        {note?.bad && <span className="text-danger">{note.text}</span>}
      </div>
    </div>
  );
}
