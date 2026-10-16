# V2-7B-2 — explicit browser handoff

Implementation frozen on `v2`, 2026-10-16. Source under validation:
`03cc89ef233db5469066599391cbaac68c2fc646`. Accepted baseline:
`662f7d6a08647d431eded1ea17c5d13e7ca1c591`, independently accepted in
[the separate decision](reviews/V2-7B-1-662f7d6.json). Human direction approved
the explicit **Open in editor** action on completed chats and the deck page.
The bounded contract, non-goals, gates and stop point are in
[ROADMAP.md](ROADMAP.md#v2-7b-2-plan).

No acceptance is claimed. Complete final-source gates are being rerun after
visual review found that expired-session recovery could sit below the composer.
The focused alert now receives focus and is geometrically checked above it.
Superseded `22047f7` had all199files/2233 matrix cases, hosted double-click1,
PostgreSQL browser11 and command/native checks passing; those results do not
satisfy the corrected source's gates. The 199-file inventory remains unchanged.

Independent early read-only review found two recovery gaps: a cross-tab token
change could leave the action opening indefinitely, and a failed chat source read
left it disabled without retry. Corrections add session invalidation with reload
guidance and explicit source-read retry. Their real-window/same-document and
source-read/dark-mode regression cases pass. Visual inspection also prompted a
single error announcement and integration into the existing completion card;
the final focused suite includes both corrections. No converter/engine/store
behaviour is changed.

Known limitations: accepted conversion coverage remains conditional, with
unsupported content/notes/identity/fit refusing atomically; no new conversion
parity. Changed source and deleted imports refuse without replacement or
resurrection. BYOK locale and approximately 24px Viewer Fit overflow remain
separate standing issues. Model-free validation does not judge generated writing
or demonstrate interactive Microsoft PowerPoint. No deployment is in scope.
