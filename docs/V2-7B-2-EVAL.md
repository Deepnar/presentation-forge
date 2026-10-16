# V2-7B-2 — explicit browser handoff

Implementation in progress on `v2`, 2026-10-16. Accepted baseline:
`662f7d6a08647d431eded1ea17c5d13e7ca1c591`, independently accepted in
[the separate decision](reviews/V2-7B-1-662f7d6.json). Human direction approved
the explicit **Open in editor** action on completed chats and the deck page.
The bounded contract, non-goals, gates and stop point are in
[ROADMAP.md](ROADMAP.md#v2-7b-2-plan).

No acceptance is claimed. Current changes are unfrozen; retained final validation
has not started. Preliminary client tests: 13 pass / 0 fail / 0 skip / 0 cancelled.
The actual-server Chrome suite and complete 199-file manifest are being prepared.
Earlier accepted evidence is historical, not execution against this change.

Independent early read-only review found two recovery gaps: a cross-tab token
change could leave the action opening indefinitely, and a failed chat source read
left it disabled without retry. Corrections add session invalidation with reload
guidance and explicit source-read retry. Behavioural regression cases must pass
before either correction is considered verified.

Known limitations: accepted conversion coverage remains conditional, with
unsupported content/notes/identity/fit refusing atomically; no new conversion
parity. Changed source and deleted imports refuse without replacement or
resurrection. BYOK locale and approximately 24px Viewer Fit overflow remain
separate standing issues. Model-free validation does not judge generated writing
or demonstrate interactive Microsoft PowerPoint. No deployment is in scope.
