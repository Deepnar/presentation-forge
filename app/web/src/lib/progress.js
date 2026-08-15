/** Human labels for the pipeline's SSE status frames, shared by every surface
 *  that streams research/planning/writing progress. Every long action reports
 *  per-step movement so the UI never looks stuck: research names the query,
 *  writing/sweeping names the slide of M, the report names its section.
 *  A frame that carries detail on top of its status (a query under
 *  "researching", a slide index under "writing") shows both. */
export function progressLabel(p) {
  switch (p.status) {
    case "researching":
      return p.query
        ? `Researching: ${String(p.query).replace(/^[↳⤷]+ ?/, "").replace(/^gap ?/, "")}…`
        : "Researching sources…";
    case "planning": return "Planning the outline…";
    case "planned": return "Outline ready.";
    case "writing": return `Writing slide ${(p.index ?? 0) + 1} of ${p.total ?? "…"}…`;
    case "rendering": return "Rendering slides…";
    case "report_planning": return "Planning the report…";
    case "report_writing": return `Writing section ${(p.index ?? 0) + 1} of ${p.total ?? "…"}…`;
    case "sweeping": return `Sweeping slide ${(p.index ?? 0) + 1} of ${p.total ?? "…"}…`;
    case "converting": return `Converting slide ${(p.index ?? 0) + 1}…`;
    case "reading": return "Reading the deck…";
    case "editing": return "Editing the deck…";
    default: return "Working…";
  }
}
