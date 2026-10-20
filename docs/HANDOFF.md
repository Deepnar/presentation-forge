# Handoff — V2-8C independently accepted and closed

2026-10-20, branch `v2`, authorized push `origin/v2`. The accepted implementation is
`e41d509c20fca21a70b9a0c587ccb83684aee7e6`, compared against entry baseline
`1fb39ff75cd473ecaf2884232d5d7465d50a9af2`. The separate reviewer issued
[ACCEPT](reviews/V2-8C-e41d509.json) at `4c61e38`; independent evidence is `d43ada7`.
State, roadmap and as-built guidance now apply that decision. Subsequent commits
contain documentation/evidence/harness work, with no product/test source delta.
Resolve final repository HEAD with Git rather than replacing the accepted source
with a documentation SHA. [The evaluation](V2-8C-EVAL.md) holds exact results,
chronology, performance and limitations; [the runbook](v2-8c-evidence/RUNBOOK.md)
defines reproduction and preservation.

Primary execution: 215 files/2529 passing leaves plus 4 distinct persisted/native
cases = 2533/2533, zero failures/skips/cancellations/unexecuted required cases.
The 137 successful repeats are separate. Independent execution passed 320/320,
including 308 overlapping inventory leaves, 4 overlapping native cases and 8 new
probes; the remaining 197 files/2221 leaves were inspected, not independently rerun.
Build, typecheck, protocol and all 50 benchmark cells passed in both contexts.
The separate en_IN locale probe remains 9 pass/1 standing failure and was inspected,
not independently repeated. All 115 packet images plus 45 fresh independent images
were inspected. Local 120-slide opening measured 1541–1543ms and canvas movement
stayed below 0.05px. No blocking finding or new final-validation product regression
remains; canonical catalog/cache-counter corrections preceded the source freeze.

The exact owned PostgreSQL15.18 service
`2670350f8e8e867b1923c327f5235fd44783e0b5a26dc48d25d5a176d6330809`
was stopped and removed after a fresh zero project-database observation was saved
and fsynced. Port 5544 is closed; [cleanup evidence](v2-8c-evidence/cleanup.json)
retains the corrected case-sensitive removal-probe error. No unrelated service was
used or stopped. The old reboot-lost c0d62e38 service has no saved pre-removal count;
that count remains unavailable, not zero. Elevated global I/O PSI/iowait provenance
remains unresolved; measured headroom and per-job guards qualified the completed
serial runs. No validation job or owned validation database remains running.

All 3473 files in the independent snapshot, including 50 original archives, were
restored/hash-verified; 10 new independent originals are preserved separately from
13 new implementer originals. Preserve all current evidence and ignored originals
before any generator. Do not rerun finish-evidence.py against restored canonical
out/ files; its fresh-source checks deliberately refuse. Historical archive-byte
provenance limits and the earlier cancelled/unacknowledged attempts remain explicit.
Original `.agents/` and both `PRESENTATION_FORGE_V2_*` untracked documents remain
untouched. No credentials were read or deployment/migration performed.

Inherited Fit/narrow overflow, rail/loading/capture/pending-search and first-run SVG
rich-run styling limits remain. Live endpoints/model availability, hosted Auto
content quality and interactive Microsoft PowerPoint were unexecuted and outside
this bounded qualification. Fixture HTTP proves protocol and command plumbing only.
The parent V2-8 is incomplete. The sole remaining-work pointer is
[the roadmap](ROADMAP.md#v2-8-remaining); the next candidate is unauthorized in state.
Stop after this accepted slice and handoff. Acceptance permits later planning only.
