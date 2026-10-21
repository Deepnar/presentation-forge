# V2-8F shared Forge Search boundary evaluation

Accepted baseline: `c71d65e189387684aac89ca9994acf8a9ff865c1`.
Entry checkout: `661eedc70f3c3f8a4290449303438d391fe97755`; branch `v2`, push
`origin/v2`. The [approved contract](ROADMAP.md#v2-8f-shared-search-boundary) is the
sole work entry. Implementation and validation are in progress; no acceptance is
claimed. Frozen implementation: `9d2a659af55cc9148724f39ace1a5bbe387ab428`; later docs/harness commits have no product/test/tooling delta.

Correctness, authorization isolation, regression, backward compatibility, native /
browser preservation and documentation gates apply. Existing editor, storage,
undo/history, ownership and accessibility behavior remain regression surfaces.
No new UI, persistent source/transcript schema, data policy or deployment is in scope.

The complete inventory retains all 221 accepted files and adds 2 search files
(189 bulk, 26 serial browser/build owners, 8 PostgreSQL). Required final build,
typecheck, 50 benchmark cells, inspected browser/native output and independent
review are pending. No prior result counts as execution of the new source.
All pass/fail/skip/cancelled/unexecuted totals and source/backend are recorded when
executed. BYOK locale and inherited Fit/narrow/SVG/native-ID/provenance limitations
remain separate. Quiet-window qualification precedes expensive validation.

The existing stack is retained. The current
[SearXNG Search API](https://docs.searxng.org/dev/search_api.html) documents GET/POST
/search, form-encoded POST fields, JSON format, language and day/month/year filters.
Local HTTP fixtures qualify this protocol; they do not qualify upstream search
relevance or live provider/Auto output. Search result snippets remain untrusted data.

## Development execution and corrections

Accepted prerequisites passed 25/25 in a lightweight source/schema and conversation
spot check. First new search execution passed31/32: the numeric backend ID3 was
coerced by a regex. A string-type guard corrected the actual configuration defect
with its assertion unchanged. The first shell command ended with tail and masked
the test child exit; its failing raw summary remains retained and is never counted
as passing. The corrected32-case file set passed32/32.

Expanded execution passed70/71 initially. One privacy assertion matched the
legitimate canonical binding value `private-project-id`; it now checks each exact
upstream private marker and verifies the canonical bound projectId is preserved.
This was an incorrect expectation, not a backend data leak. The expanded rerun
passed71/71,0fail/skip/cancel across search, governance and type checks. Initial
TS2698 narrowing was corrected with the AJV-validated generated request type;
its original diagnostic is in the tool transcript, not a retained raw log.
[Development assessment](v2-8f-evidence/development/assessment.json) preserves these
classifications and raw paths. These are development runs, not final-source totals.

Final source is frozen above; final focused, full matrix, commands, visuals and
independent execution remain pending. No assertion/timeout was relaxed. One reused
separate high-effort reviewer is performing read-only source inspection with no
heavy slot or acceptance yet. Shared-machine resource qualification is pending;
raw global I/O pressure retains unresolved provenance.
