# J2 independent source inspection

Reviewer context: `/root/i8_source_review`, separate from implementer `/root`.
Initial pushed implementation: `58de25451c1014df4ec45dc502915277deffca85`.
Accepted baseline: `f161901cf29bd7ebd2c12ef634a86cacf5f90ea3`.
Approved retention/implementation contract was pinned at `6416e1b` before runtime.

This began as provisional source-only inspection, before the later expressly
authorized PostgreSQL challenges below. It is not the decision record; final
acceptance is in `docs/reviews/V2-8J-2-6d51cd4.json` and `review.md`.

## Finding at initial implementation

PostgreSQL drops deliberate registry refusal identity during rollback propagation.
`src/projects/sources.js:9` throws a private-symbol marked object, which the domain
recognizes at lines191–193. PostgreSQL's canonical transaction catches that object
at `src/projects/store-postgres.js:810`; `storageUnavailable` at lines106–115
preserves only its existing domain-code allowlist and wraps all other errors.
The new source refusal codes are absent and the wrapper drops the private symbol.
Consequently stale-project, stale-catalog, invalid-state and capacity failures
become storage-unavailable on PostgreSQL, unlike SQLite and the approved contract.
Reported directly to the implementer before storage validation. Correction should
preserve source-domain refusals through canonical rollback without broadening H
authority or publishing driver errors.

## Inspected boundaries

The registry clones and validates complete binding/request DTOs synchronously
before awaits. Adapter wrappers pin dialect and expose only project revision and
query, using the existing exact-owner parent transaction and rollback boundary.
No new public route, CLI, model tool, H hook, automatic registration or provider
context import was found.

SQL projections cap actual identifier/payload byte lengths before JavaScript.
SQLite reads capped BLOB values and fatal-decodes UTF-8 while preserving BOM bytes.
Catalog validation scans at most513 metadata rows; selected bodies alone require
canonical serialization, exact bytes and identity. Clear skips aggregate/body
validation only when a syntactically valid current catalog exists; an absent
catalog still probes for orphan rows. Both DDL children cascade on project delete.
Shared validation preserves the accepted source-ID tuple and publication-label
equivalence; first provider/retrieval metadata stays immutable for current-token
repeats. List uses project-bound generation/revision cursors and explicit binary
keyset ordering. Overflow checks precede catalog increment and writes.

## Correction and narrow execution

Frozen correction: `0549daf6c61b6995698d01784ea4d75c73aedba6`.
The PostgreSQL source-only wrapper captures its callback's original error
privately, throws the existing runtime-fenced sentinel through canonical rollback,
and rethrows the original outside that boundary. H's generic transaction and error
policy remain unchanged. Root's first PostgreSQL execution reproduced the finding
with3pass/7fail; later corrected10/10 evidence is retained separately.

One independent low-priority/watchdog invocation executed2 new challenges against
the exact verified owned PostgreSQL service, both passed with0fail/skip/cancel.
An actual inserted source row rolled back when the callback threw an opaque private
refusal; the exact same refusal object emerged and no catalog/source content
remained. A delayed registration captured owner/project identity, full source
body/batch and document/catalog tokens before await, surviving mutation of every
caller-owned field while refusing the foreign owner afterward.

The unique review database was dropped, all pools closed, and initial/final
non-template user-database catalogs both empty. Container ID/name/image/loopback
port were matched before reading private connection configuration. Credentials
were neither printed nor retained. See `challenge-final.json`, its verbatim raw
log and `owned-review-database.json`. The runner initially expected TAP summaries;
its parser was corrected for Node's default spec summary from the existing raw
output without repeating the product checks. The historical `.tap` filename
contains that spec output verbatim.

The later list-null parser correction is independently inspected, outside both
challenge operations, and covered by final root pure validation. Final source
`6d51cd409945e94266e23596b57f925553e62e31` is ACCEPT after the completed packet
audit; `review.md` and the separate JSON decision record carry scope and limits.
