import { useEffect, useState } from "react";
import { api } from "../api.js";

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
