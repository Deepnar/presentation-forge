# Acceptance criteria

The planner marks each gate applicable or not applicable, with reasons and
concrete evidence required. Passing tests is necessary but does not automatically
prove correctness. An implementer reports a recommendation; independent review
or explicit human approval supplies acceptance of an exact commit.

| Gate | Evidence when applicable |
|---|---|
| Correctness | Approved behaviour exercised through real entry points; narrow defect reproduction and correction; no scope creep |
| Data integrity | Atomic writes/history, exact round trips, stale/noop outcomes, crash and cross-process durability, truthful save states |
| Security/authorization | Canonical ownership checks for every read/write/export; no cross-owner leaks, no silent claiming, no secrets in artifacts |
| Undo/redo | Exact content, metadata, order and ownership restoration; batch atomicity, redo invalidation; documented session-only persistence policy |
| Ownership/regeneration | Human text/data/style/geometry, additions, tombstones and detached scenes survive; protected locks enforced at engine boundary |
| Native PPTX | Real text, chart data, tables and objects verified in OOXML and rendered output; order fidelity; export preflight refuses unsafe scenes |
| Browser interaction | Dashboard/create/reopen, editing, history, save/conflict, project-switch/navigation guards, pending drafts and cleanup |
| Accessibility | Labeled regions/controls, keyboard editing and focus, Escape/topmost dialogs, focus return, contrast and reduced motion |
| Responsive behaviour | Narrow controls/inspector usable, dialogs unclipped, no overlapping controls; selection does not unexpectedly shift the canvas |
| Regression testing | Focused new/changed-behaviour and affected-boundary checks; broad sweeps only with a concrete risk/release reason; bounded serial browser/build isolation, actual backend, exact totals/exclusions and separate standing failures |
| Documentation/evidence | Reproducible commands + tested SHA/delta, logs/totals, inspected final screenshots, updated architecture/roadmap/handoff/state |
| Backward compatibility | Existing projects/fixtures/legacy flows remain usable; schemas/readers refuse unsupported versions without lossy migration |
| Deployment safety | Config/backups/rollback and shared-volume limits evaluated when in scope; no deployment or irreversible migration without authorization |

Use fail-first tests for behavioural corrections; do not weaken assertions to
obtain green results. Distinguish executed tests, source inspection, visual
inspection, skips, cancellations and unexecuted cases. Inspect rasterized native
exports when claiming render quality. Missing services or a busy shared machine
are limitations, never successful validation. A standing BYOK locale failure
stays separate and does not excuse new failures.

Use accepted evidence for unchanged areas. Do not routinely rerun old full suites
or duplicate the implementer's matrix in independent review. Choose the smallest
meaningful checks for the changed behaviour and broaden only when a specific risk,
failure or release requirement justifies it. Stop repeating successful checks
without a new change or unresolved concern. See the
[focused validation policy](DEVELOPMENT-PROTOCOL.md#focused-validation-policy).

A review decision records exact commit, reviewer/context, checks independently
executed, evidence inspected, exclusions, residual risks and ACCEPT or HOLD.
HOLD produces a narrow correction task in [ROADMAP.md](ROADMAP.md); ACCEPT permits
planning only. Higher-impact human approval boundaries remain in
[DEVELOPMENT-PROTOCOL.md](DEVELOPMENT-PROTOCOL.md).
