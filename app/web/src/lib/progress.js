/** Human labels for the pipeline's SSE status frames, shared by every surface
 *  that streams research/planning/writing progress. */
export function progressLabel(p) {
  switch (p.status) {
    case "researching": return "Researching sources…";
    case "planning": return "Planning the outline…";
    case "planned": return "Outline ready.";
    case "writing": return `Writing slide ${(p.index ?? 0) + 1} of ${p.total ?? "…"}…`;
    case "rendering": return "Rendering slides…";
    case "report_planning": return "Planning the report…";
    case "report_writing": return `Writing section ${(p.index ?? 0) + 1} of ${p.total ?? "…"}…`;
    default: return "Working…";
  }
}
