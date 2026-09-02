import { useEffect, useState } from "react";
import { api } from "../api.js";

/**
 * What this install does with a user's decks, in the words a person needs.
 *
 * The number is READ FROM THE SERVER, never written here. The privacy page used
 * to state 90 days while the scheduler deleted at 30, and described the sweep
 * as unconditional when it only runs where FORGE_SWEEP_DAYS is set — a
 * retention notice is worth nothing if it can disagree with the code that
 * enforces it. It also says the two things the old copy left out: the clock is
 * INACTIVITY rather than age, and marking a deck "keep" exempts it.
 *
 * Renders nothing until the answer is known, so a user is never shown a
 * deletion policy that turns out to be the wrong one.
 */
export default function RetentionNotice({ className = "" }) {
  const [policy, setPolicy] = useState(null);

  useEffect(() => {
    let live = true;
    api.policy()
      .then((r) => { if (live) setPolicy(r.retention ?? null); })
      .catch(() => { /* a policy we cannot read is one we must not guess at */ });
    return () => { live = false; };
  }, []);

  if (!policy) return null;

  if (!policy.sweeps) {
    return (
      <p className={`text-[13px] leading-relaxed text-fg-muted ${className}`}>
        This install does not delete decks automatically. Yours stay until you delete them.
      </p>
    );
  }

  return (
    <p className={`text-[13px] leading-relaxed text-fg-muted ${className}`}>
      <span className="font-medium text-fg">Decks are deleted after {policy.days} days without activity.</span>{" "}
      The clock is inactivity, not age — opening or editing a deck restarts it. Mark a deck
      <span className="font-medium text-fg"> Keep</span> to exempt it, and download anything you
      want to hold on to.
    </p>
  );
}
