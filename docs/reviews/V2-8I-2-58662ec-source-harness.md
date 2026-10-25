# V2-8I-2 replacement source and harness inspection

Reviewed source/tests `58662ecc074f7cc29bf29a0dd410d581ffca0eef` against initial
candidate `b07052c2ccfa1de14735d73e000214efff4afc3e` and accepted I1
`5170adcec56e65e08f4ec5c1e5067c127f1c4c9d`. Reviewed harness correction commit
`a378a0c58aabf07a0b3edff54ed709f8b9890074`. Reviewer/context:
`/root/turn_contract_review`; implementer: `/root`.

No remaining material blocker was found in this bounded source/harness inspection.
This is readiness for behavioral validation, **not ACCEPT**. The reviewer ran no
tests, services, models, generators or resource qualification. Root retains the
execution/Git slots. Only this new note was written; existing notes, source,
state, snapshots and evidence were not changed.

## Source correction

The internal `advanceTurnRun` helper contains the canonical claim/advance/renew
loop with an eight-call cap and immediate return on busy, abort or lease loss.
It adds no queue, SQL, retry or approval authority. The public worker still accepts
only turn identity, derives the run ID from persisted H state, supplies its private
binding snapshot and projects final H status through the fixed-error boundary.
The internal helper is not exposed through the adapter/CLI as arbitrary-run work.

H retains its strict one-batch proposal invariant. The new negative test rejects
an expanded proposal through both H decide and worker lookup. Cap, between-step
abort and renewal-loss tests instead start actual B multi-step canonical runs and
inspect receipts/fences on both stores. They do not expand H authority. Normal
worker cases retain actual ModelProvider preparation and explicit H approval.
An entered one-step H transaction may persist success after abort; its replacement
test asserts that actual result. Current valid H work cannot reach the cap, and
there is no reachable CLI-cap claim. This corrects the initial review's mistaken
B-valid-versus-H-valid fixture characterization without weakening H.

The CLI now uses an explicit exit classifier: unsuccessful/refused or unfinished
work exits1; a final succeeded run dominates a raced refusal and exits0. The table
covers busy/lost-lease/abort/cap reasons and preparing/terminal refusal states.
Real CLI probes cover held preparation, held execution, provider refusal, existing
success/replay and preparation signals. Headless both-store contracts cover claim
and renewal lease loss. These are inspected assertions, not reviewer-executed
passes. The original106pass/2fail fixture attempt remains failed historical evidence.

## Harness correction

Both earlier harness findings are addressed in `a378a0c`:

- `correction-checks.py` records child results and preserves resource files before
  exiting1 for a nonzero child or any failed/skipped/cancelled leaves. It no longer
  falls through to exit0 after breaking on a failed correction job. The new output
  and evidence namespaces retain the previous admission attempt separately.
- `prepare-full-validation.py` rejects `--resume` and existing backup,
  prior-generated-backup or coordinator artifacts before resource admission or
  Docker creation. Only recovery of the same recorded ID before snapshots/tests
  is allowed. Completed-job resume remains the coordinator's operation.

Inspected `harness-guards/results.json` and both raw logs: the two negative probes
exit1 at those early guards, with no new owned identity reported. This is retained
implementer execution, not reviewer probe execution. The archived admission-only
record reports zero started/executed/cancelled leaves and preserves the prior
helper/log/resource hashes; its process-state claims are not an independent
reviewer process observation.

The broader harness inspection found consistent exact-source guards, complete
234-file union assertion, three-file focused worker gate, pinned owned endpoint/
identity checks and four offline protocol/backend flows using worker preparation,
explicit H decision, worker execution and reopen/export. Snapshot/restoration and
one-time original-export archival precede restoration of the five canonical
outputs. Cleanup saves/fsyncs an actual empty catalog before one exact-ID stop
and distinguishes first post-stop observations from bounded final absence.
These are source conclusions; no new snapshot, backend or completed validation
result is inferred from them.

All required current-source behavioral gates, actual PostgreSQL/process execution,
full matrix, inspected fresh images/native originals, preservation/cleanup proof
and separate final independent execution/decision remain necessary. Earlier I1
passes, the failed initial fixture attempt and negative helper refusals supply no
replacement-source acceptance. Stop remains after I2.
