# Preliminary and superseded attempts

These logs are diagnostic history, excluded from final distinct totals. The final
matrix and gates identify frozen source f79ae07 independently.

| Attempt | Pass / fail / skip / cancelled | Classification |
|---|---|---|
| Initial ten Chrome cases | 3 / 7 / 0 / 0 | Harness expectations: HTML/XML SVG serialization, one-shot settled bounds, viewport coordinates after deliberate scroll, and revision readiness. Assertions were corrected to the actual canonical representation and intended invariant. |
| Second Chrome run | 9 / 1 / 0 / 0 | Harness: second window blocked without trusted activation. |
| Third Chrome run | 9 / 1 / 0 / 0 | Harness: returning a Window through CDP could not serialize it. |
| Account-change targeted correction | 1 / 0 / 0 / 0 | Pass; other nine cases unexecuted by filter. |
| Font probe setup | 0 / 1 / 0 / 0 | Harness: incorrect relative import in ignored-out driver. |
| Actual dynamic font503, source0f6276a | 0 / 1 / 0 / 0 | Product defect: browser retained failed FontFace; explicit retry could not recover. |
| Dynamic targeted correction, first and tightened | 1 / 0 / 0 / 0 each | Passed after source01ba3a3; remaining cases unexecuted by filter. |
| Static WOFF2-only outage | 0 / 1 / 0 / 0 | Incorrect probe expectation: static WOFF fallback succeeded, so preview correctly remained ready. |
| Static WOFF2 and WOFF outage, source01ba3a3 | 0 / 1 / 0 / 0 | Product defect: failed static FontFace remained in error through retry. |
| Both actual font outage corrections | 2 / 0 / 0 / 0 | Passed working-tree delta now committed as f79ae07. Other ten canonical cases unexecuted by filter. |
| Unit checks after each font correction | 23 / 0 / 0 / 0 each | Repeated unit checks; excluded from unique totals. |

The initial invalid-project-ID HTTP expectation used a valid word under the
accepted identifier regex. The fixture now uses an encoded space and retains
the400 assertion. Fail-first missing cover-route targeted check was0pass/1fail;
first full HTTP run was8pass/1fail, corrected full run9pass/0fail. These raw outputs are retained here separately from final exact-source logs.

The source0f6276a coordinator completed focused42, bulk2053 and five serial
files/52 leaf tests with no failure, skip or cancellation, then stopped between
files for the actual font challenge. Nineteen serial files and all later groups
were unexecuted in that superseded attempt. All five serial files completed before
the resource probe started; no browser file was interrupted and no Vite/browser
owner overlapped. Final validation restarts every group on f79ae07.

Earlier read-only review also corrected StrictMode queue lifetime, settled
same-document account invalidation, failed font-promise caching and rendering
resumed after a cancelled preparation. These are candidate defects corrected
before acceptance, not independent claims of accepted-baseline regressions.

The archived drivers retain imports for their original ignored-out locations;
they are diagnostic source snapshots. The reproducible canonical entrypoints are
in the parent RUNBOOK. `index.json` preserves the exact leaf footers available
for each attempt. Skips/cancellations are zero; a filtered case is unexecuted,
not a passing or skipped case.
