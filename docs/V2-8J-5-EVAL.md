# V2-8J-5 evaluation — in progress

Accepted baseline: `665cd0459b0f267b32e808a59046e3d0b914e74f` (J4).
Human approved reviewed contract `1b37cdd674fa680ac15bb266e2e16bf4eff25f05`
on2026-10-29 (“ok continue” directly after the concrete approval question).
[Contract](V2-8J-5-PLAN.md), [inventory](v2-8j-5-evidence/validation-plan.json)
and [roadmap](ROADMAP.md#assistant-citation-project-copy) define bounded scope.
Implementation and independent review are pending. No product result is claimed.

Focused gates: copy-contract, copy-sqlite, copy-postgres, copy-transport,
copy-browser and typecheck. All are pending. Capture all attempts and exact source,
backend, pass/fail/skip/cancel/unexecuted counts and exclusions as work proceeds.
No provider/search/local inference/GPU run or production activation is authorized.
Standing BYOK locale and earlier timing/native/provenance limits remain separate.

## Implementation candidate and current evidence

Initial source/tests pushed at `d4556948a8febda09bb2c1ddab9912cfeb772bc3`.
Headless exact-owner copy, shared SQLite/PostgreSQL insertion seams, thin private
HTTP/CLI and existing-control guarded editor/router adoption are implemented;
independent source review is in progress. No implementation acceptance is claimed.

[Exploratory attempts](v2-8j-5-evidence/attempts.json) retain all43 leaves:
41pass/2fail/0skip/0cancel. Overlapping runs are not final selected totals.
The original J4 handler regression is fail-first1/1 failure: a delayed response
adopts the copy and claims Saved after later edits. This is an isolated handler
execution, not browser reproduction. One transport failure was an invalid absent-
project fixture with foreign-bound citation metadata; corrected to match the absent
binding while preserving404 assertion. Final exploratory pure6/6, SQLite6/6,
HTTP/CLI5/5 and changed router10/10 pass. Initial pure5/5 had no separately captured
child exit and is exploratory only. The esbuild syntax-check import was unavailable;
installed Vite's Oxc transform parsed both changed JSX files, with no install.

Final gate evidence still needs canonical file-inventory reporter/source capture.
Browser/build and actual PostgreSQL are pending a shared-machine quiet window:
I/O full avg10 repeatedly44–68%, memory pressure0, unrelated ICE/Ollama active.
No browser/build, PG fixture, real/local model, search, GPU or native render has run.
A cached PostgreSQL15-alpine image exists; no new container has been acquired.
No old fixture has been recreated or cleanup repeated. Later source fixes require
only affected new checks, not old broad matrices.

The changed router is shared: the focused inventory additionally includes its
small existing test file with three new transfer cases. No old browser file is
added. Current25-source SQLite copy measured in the retained logs reads[24,1]
source batches; use final actual-source run for the final performance statement.

## Current frozen candidate —26a1e86f, pending quiet-window gates

Implementation source `26a1e86fb2be505b4dd382515e15ff9bd38e19b0` has completed
selected28/28: pure6, actual SQLite6, HTTP/CLI5 and changed router11, all0fail/skip/
cancel in the selected evidence. Canonical reporter inventories and source hashes
are retained in [the manifest](v2-8j-5-evidence/source-manifest.json). Typecheck0
ran once, with byte-identical typed-source applicability; no later rerun is inferred.
All root leaf attempts now83=80pass/3fail/0skip/0cancel, with overlap retained.
Two expected fail-first results are the inherited handler and candidate router-
write regressions; the remaining failure is the corrected invalid transport fixture.
Initial missing child-exit capture and syntax-check setup error remain explicit.

Separate source review found four candidate adoption risks: source release before a
failing history write, same-project route drift, viewport drift and pending restore
publication. Corrected source at8e181735 fences all four; no new source blocker was
reported. Router-write failure was independently suggested and root reproduced
before correction1fail; corrected full small file11/11 passes. Browser cases now
also cover same-project history routes, selection-only drift and held restore.
The review caught a later history-hash fixture expectation before execution; it
now compares the retained route. No product acceptance decision has been issued.

Actual PostgreSQL6 and Chrome5, its one production build, screenshot inspection
and browser canvas measurements are **unexecuted/pending** because shared I/O
pressure remains high. No new service, browser, native renderer or provider call
has been acquired. Cached PostgreSQL image availability is not a PostgreSQL pass.
Do not mark this candidate accepted or start later roadmap work.
