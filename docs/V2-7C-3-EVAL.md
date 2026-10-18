# V2-7C-3 — production editor controls

Approved 2026-10-18; implementation in progress, independent review pending.
Accepted baseline is bf1bd8f7dbce827be04ed530b2e7330b385e8baa; task-entry checkout
abadb9e on v2. The human selected standalone-only fixture/Live/harness controls
and diagnostics. The bounded contract and future-work ownership are in
[ROADMAP.md](ROADMAP.md#v2-7c-3-plan). No C3 acceptance or dependent feature.

The shared embedded viewer now hides developer controls/readouts while preserving
canonical document/edit/view commands and machine-facing IDs. Readable labels
cover slide status, contextual inspectors, layers and blank-history entries.
Early review also reproduced a false unsaved readout after Done on an untouched
saved project; the readout now follows canonical saveState. No compiler, store,
schema or hosted-policy changes.

Focused behavioral verification is underway. The complete disjoint inventory is
206 files:176 bulk,26 serial owners and4 PostgreSQL contracts/process/fault files.
The new9-case toolbar suite and unchanged28-case7A behavioral scope both belong
to the focused gate; intentional UI entry points were adapted without removing
guard or geometry assertions. The full matrix, commands,50 cells, native rasters
and final visual review remain pending on the frozen implementation. Prior C2
results do not satisfy those gates.

[Earlier attempts](v2-7c-3-evidence/attempts.json) retain fail-first requirements,
readonly defect reproduction and test-instrumentation/fixture corrections.
Local Live compilation is exercised on an actual local SQLite fixture because
hosted policy correctly disables it. The PostgreSQL repeat therefore comprises
8 PostgreSQL saved-project cases plus1 local SQLite standalone case, all executed.
The canonical BYOK locale failure, Fit defect and unexplained B2 restore timeout
remain separately owned roadmap entries.
