# J4 independent source inspection (provisional)

Reviewer context `/root/i8_source_review`, separate from implementer `/root`.
Accepted baseline: `edda5ec7c2105bebff4a429a04b3fbe5b09048b4`.
Initial pushed implementation inspected: `6628bb470e53eed0bd6d5f248d2edaa34c71af1b`.
Human bounded J4 direction was pinned at `b0cb7aa` before runtime.
No acceptance decision has been made. The initial source-only phase executed no
product tests, database/service/browser/build/provider/model/search or network work.
Later expressly authorized actual-PostgreSQL challenges are recorded below.

## Source findings and correction of review error

No concrete product defect remains from this initial inspection. I raised a
trailing-LF fixed-format concern based on an incorrect expectation of unflagged
ECMAScript end-anchor behavior. Root's retained actual Node24 probe and narrow
negative fixture disproved the expectation: the original code already refuses
the malformed inputs. The passing new coverage is retained, with no product regex
correction warranted. Any outer harness expectation that the negative test should
fail is a review/harness error, not a product failure. The finding is withdrawn.

## Inspected contract boundaries

Optional scene metadata is strict and bounded; project validation checks the
canonical project binding and project-wide citation-ID/capacity rules. Tuples are
unique per containing scene, preserving unresolved duplicate scope. Generic create
refuses citation-bearing scenes before project/history writes. Generic existing
save/runtime-save/restore retains unverified same-project metadata, without source
resurrection or claims of prior attachment. This preserves session undo beyond
durable payload pruning and source clear. Schema-generated types are updated.

Fresh attach/replace/inspect runs under canonical exact-owner project/catalog
checks and shared J2 body validation; source IDs and transient quotes are not
provider authority. Removal does not read source catalog/body data. Qualified
commands/history share canonical rollback, including the PostgreSQL private
refusal bridge; no-op comparison preserves existing record bytes. New citation
commands and citation-bearing agent slide insertion are denied, while existing
content operations preserve arrays and deterministic duplicate effects remain
engine-owned. Tool catalogs/projections are unchanged and return no citation data.

Target indexing uses unique live identities and protected ancestor/group scopes,
with request-wide node/depth limits. Browser-safe content projections preserve
payload absence, authored ordering and escaped Unicode before WebCrypto hashing;
saved anchors remain unverified equality data. Inspection separates target/content/
source/range facts with no quote-matched or claim-support elevation. Source clear
generations do not revive old records after identical snippet registration.

Same-project duplication remints citation IDs deterministically and remaps only
unique live target identities; unresolved tuples remain scope-mismatched. Ordinary
edits, deletion/undo, exact snapshot history and recompile retain old metadata and
anchors. Detached scenes remain untouched. Renderer preflight centrally refuses
all nonempty arrays before native output, independent of target visibility.
Source-aware copy, Save-as-new adoption risk and citation presentation are still
separately gated. No new route/UI/provider/receipt/source persistence was found.

## Narrow independent execution

Frozen source and actual invocation:
`665cd0459b0f267b32e808a59046e3d0b914e74f`. Runtime is unchanged from the original
inspection; later source commits add negative LF coverage and repair fixture
history-trigger teardown before snapshot verification. No product assertion was
weakened and no product regex change was made.

One nice10/ionice3/watchdog invocation ran2 new actual-PostgreSQL challenges,
2pass/0fail/0skip/0cancel in5272ms process time. Removing orphan/locked metadata
under an unknown-policy source catalog succeeded without reading/repairing that
catalog or source rows; qualified inspection still refused invalid-state. A
stale-generation reference did not parse a byte-coherent but hash-corrupt same-ID
re-registered body; selecting a current-generation reference refused the entire
output, without partial observations. No old successful suite was repeated.

The independent observer required4samples: a physical disk spike in sample2
prevented immediate admission; the final two ready samples measured CPU12.01%/
10.88%, disk2.74%/2.24%, and only positively classified kernel D tasks. Existing
thresholds/classifier were unchanged. Global I/O PSI remains recorded without
attribution. No unrelated process or service was controlled.

The exact owned container ID/name/image/running state/loopback port32770 was
verified before connection use, and the challenge rechecked CPU/memory limits.
The unique review database was dropped, pools closed, and actual initial/final
user catalogs were empty. Credentials were not printed or retained. A procedural
limit is explicit in `identity-preflight.json`: an earlier metadata-only read
printed the private connection file's key name before Docker verification; it
made no connection or mutation and printed no URL/secret. The report does not
claim all private-file access occurred after verification. All actual connection
use followed exact verification and fresh admission.

Final packet and cleanup audit completed after pushed packet
`ef1d11ac37d24fcc62588ab874a36ecae8af9852`; exact source665cd04 is ACCEPT in
`docs/reviews/V2-8J-4-665cd04.json`. `review.md` and `packet-audit.json` retain
scope, counts, independent cleanup observations and procedural limits.
