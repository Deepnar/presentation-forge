# V2-8A validation reproduction

Freeze the exact implementation SHA in validation-plan.json and state before running.
The inventory contains all208 JavaScript test files plus the existing TypeScript
generated-usage test. The latter was previously typechecked but omitted from the
JavaScript-only runtime inventory; it now executes and has an observed-file marker.
No prior C3 result is execution evidence for this source.

Record a fresh quiet-window sample of actual CPU utilization, memory and I/O
pressure, competing process states and available memory. Use only an owned
ephemeral PostgreSQL15-alpine container on localhost5544, 1CPU/512MiB/192MiB tmpfs,
with a unique V2-8A name and recorded exact container ID. Do not reuse other services.

Run `python3 docs/v2-8a-evidence/run-validation.py`. It runs the focused foundation
checks,179-file non-browser bulk at4workers with30m watchdog,26 browser/build/plate
owners strictly serial with15m watchdog per file, then4 PostgreSQL contract/process/
fault files, production build, typecheck and canonical50cells. There is no overlapping
Vite build, browser or LibreOffice run. Commands use niceness10/I/O priority7.

The1-case headless driver proves real text/chart/table changes, structurally filtered
context, exact undo/redo and geometry/untargeted-scene preservation. It writes actual
before/after SVG/native exports and rasterizes them. Existing B1/B2/7A authenticated
exports supply7 additional native regression pages. Collect all fresh canonical
browser images and measurements under this directory, then restore historical
tracked evidence. Inspect final image hashes, clipping/overlap and canvas stability.
Extra C3 backend repeats are not required: no UI/storage implementation changed;
the full inventory still includes actual PostgreSQL browser/contracts/fault cases.

Keep the en_IN BYOK probe separate. A cancelled/timed-out file is failed execution,
never a pass; retain its output and unexecuted count. No automatic retry hides it.
An absent PostgreSQL service leaves its required checks unexecuted. Source changes
invalidate affected execution; document any bounded unchanged-source retry.

Finalize exact leaf totals, source/backend/command provenance and earlier failures;
update EVAL/state with review pending. Give one separate high-effort reviewer the
exclusive heavy slot and exact pushed SHA. Only that reviewer can supply ACCEPT/HOLD.
Save the owned database-count result before stopping its exact container ID, wait
for auto-removal and verify localhost5544 closed. Stop before another runtime/UI slice.


Source-retry triage: attempts/serial-first retains the first171-case partial serial
execution (170pass/1fail;3files unexecuted). diagnostics/source-retry-full.mjs retains
the original helper with trusted-event observation and reproduced9/11 result;
source-retry-nearest.mjs proves corrected trusted dispatch1/1. These diagnostic
cases/repeats are not added to distinct final totals. The final source is refrozen
after the test-only readiness correction, then the entire209-file matrix reruns.
Historical screenshots/measurements must be collected before restoration.
