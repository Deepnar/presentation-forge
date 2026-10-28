# J2 independent exact-source review

Reviewer: `/root/i8_source_review`; implementer: `/root`.
Accepted baseline: `f161901cf29bd7ebd2c12ef634a86cacf5f90ea3`.
Final source under review: `6d51cd409945e94266e23596b57f925553e62e31`.
Human approved J2 retention/implementation before runtime at `6416e1b`.

Decision: **ACCEPT** exact source `6d51cd409945e94266e23596b57f925553e62e31`.
The completed documentation/evidence packet was reviewed at pushed
`9a8d1195bfe4ced5a6e0e3f8488ab53994d70700`. This accepts only the approved J2
headless registry, not dependent implementation, production migration or activation.

## Source assessment

The implementation matches the approved headless web-only registry. Explicit
trusted owner registration is the only retention entry; no research completion,
H/public transport/model tool or provider-context hook registers or reads sources.
The shared validator uses the existing strict WebSource shape and accepted hash
tuple, preserves absent/empty publication equivalence and first provenance, and
keeps general SourceRef, durable plans/receipts and scene/intent contracts intact.

Requests and exact-owner/project identity are validated and cloned before await.
Source wrappers retain the canonical exact-owner project transaction and backend
dialect; new child tables cascade on canonical owner/admin project deletion without
adding an admin bypass to source operations. Source mutations do not save scenes,
advance deck/history/H counters or claim citation verification. Clear generations
fence stale registration, including an absent-empty clear.

SQL caps actual identifier/payload byte lengths before materialization. SQLite
uses capped BLOB projections, fatal UTF-8 and explicit BOM preservation. Catalog
scans read at most513 metadata rows and verify actual/declared byte aggregates;
only selected/affected bodies (at most24) require canonical JSON/hash checks.
The contract deliberately makes no claim about unrequested body validity.
Clear recovers corrupt bodies/aggregate drift only under a valid catalog header;
orphan/unsupported/malformed catalog authority fails closed. Paging uses explicit
binary/C keysets with project/generation/revision cursor fencing and bounded
metadata/payload queries. Capacity/overflow/output refusal stays inside rollback.

The initial PostgreSQL wrapper dropped private registry refusal identity; the
review finding and root's3pass/7fail reproduction are retained. The correction
captures only its own source callback's error, throws runtime-fenced through the
canonical rollback, and rethrows the original privately afterward. It changes no
H error allowlist or generic transaction authority. One final list-only parser
change rejects explicit null limits instead of defaulting them, with retained
no-storage validation; no other source delta occurred after the challenge run.

## Independent execution

One bounded nice10/ionice3 invocation on `0549daf6c61b6995698d01784ea4d75c73aedba6`
executed2 new PostgreSQL challenges,2pass/0fail/0skip/0cancel in3070ms process time.

1. A real source INSERT followed by an opaque private callback refusal preserved
   exact refusal identity after rollback; no source/catalog content remained.
2. Caller mutation during an await changed owner/project, document/catalog tokens,
   source body and batch array. The original captured request still registered
   exactly one original source; the foreign owner could not inspect it.

The exact owned container ID/name/image/loopback port were checked before private
connection access. A unique `forge_source_j2_review_...` database was created and
dropped; pools closed; initial/final non-template user catalogs were empty.
Credentials were neither printed nor retained. Root owns service cleanup.

The final `0549daf`→`6d51cd4` change touches only list limit parsing; neither
challenge calls list. These results remain applicable without rewriting their
execution SHA or repeating successful checks. The raw log has a historical `.tap`
filename but contains Node's default spec output verbatim. The summary parser was
corrected from existing output without rerunning product checks.

## Exclusions and limits

No old bulk suite, browser/build/render/native/benchmark, live model/search/API,
GPU or production deployment/migration was run. The two review checks use actual
PostgreSQL only; retained root storage evidence covers the new SQLite/PG contracts.
This slice adds data/query bounds, not new transaction latency/cancellation
guarantees. Existing PG lock waits and SQLite busy timeout remain. Clear is not
Version-history restoration or physical/external-log erasure; malformed catalog
authority may require canonical project deletion. Unrequested payload validity is
outside a metadata-only inspect result. Retained snippets establish identity and
ownership, not factual support or verified locators. Public integration, source
attachments/copy remapping, paper/file adapters and creation remain outside scope.
Standing BYOK locale, earlier J1/I7 timing and inherited I4/native/visual provenance
limits remain separate and were not reopened.

## Final packet audit and acceptance basis

Fresh EVAL/state/manifest/architecture/roadmap/handoff now name the final source;
state keeps the accepted J1 baseline and pending independent decision until root
records this verdict. All five required gates have retained passing evidence.
Selected57/57 comprise new pure4, actual SQLite13, actual PostgreSQL10, affected
J1 20, graph/drift7 and selected governance3. Required test leaves34 and applicable
typecheck exits0. All root attempts remain107=95pass/12fail/0skip/0cancel, separate
from the independent2/2. Earlier fixture/product failures remain raw evidence.

The first SQLite5 failures were strict-clear DTO and semantic-ID fixture errors;
the first PostgreSQL7 failures reproduced the source refusal-propagation defect.
No assertion was weakened. Early source hash capture omitted src/projects/src/db;
final23 actual-storage cases and final pure4 capture those paths. The manifest
explicitly separates old invocation metadata, final hashes and reviewed list-only
applicability. Retained typecheck/package bytes are unchanged. Audit verifies the
six runtime paths against frozen Git bytes, nine unchanged accepted source/schema/
H boundaries, required evidence links/count arithmetic, and a docs-only packet
delta. See `packet-audit.json`; no additional product tests ran for this audit.

Root cleanup saved/fsynced the actual empty user-database catalog before exact-ID
removal. Independent read-only Docker inventory confirms that owned container is
absent; its temporary private credential file is absent too. The review database
was already dropped and its pools closed. No owned persistent service remains.
No blocking source/evidence issue or required unexecuted gate remains for this
bounded slice. Acceptance permits planning only; later direction stays in ROADMAP.
