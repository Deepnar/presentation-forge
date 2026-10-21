# V2-8F shared Forge Search boundary evaluation

Accepted baseline: `c71d65e189387684aac89ca9994acf8a9ff865c1`.
Entry checkout: `661eedc70f3c3f8a4290449303438d391fe97755`; branch `v2`, push
`origin/v2`. The [approved contract](ROADMAP.md#v2-8f-shared-search-boundary) is the
sole work entry. Implementation and validation are in progress; no acceptance is
claimed. The implementation pointer will be frozen before final validation.

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
