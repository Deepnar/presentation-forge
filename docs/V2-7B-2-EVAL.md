# V2-7B-2 — explicit browser handoff

Implementation frozen on `v2`, 2026-10-16. Source under validation:
`22047f7dd89eab46876dfe4a51296be95aeb844a`. Accepted baseline:
`662f7d6a08647d431eded1ea17c5d13e7ca1c591`, independently accepted in
[the separate decision](reviews/V2-7B-1-662f7d6.json). Human direction approved
the explicit **Open in editor** action on completed chats and the deck page.
The bounded contract, non-goals, gates and stop point are in
[ROADMAP.md](ROADMAP.md#v2-7b-2-plan).

No acceptance is claimed. Final focused actual-server/client tests: **25 pass,
0 fail, 0 skip, 0 cancelled**. Non-browser bulk: **2020 pass, 0 fail, 0 skip,
0 cancelled**, all 172 files. The complete 199-file inventory matches disk;
23 browser/build/plate owners are running serially. Four PostgreSQL files and
the remaining command/native/visual gates are pending, not passing. Focused
cases repeat the matrix and are not added again. Earlier accepted evidence is
historical, not execution against this source. See v2-7b-2-evidence/RUNBOOK.md.

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
