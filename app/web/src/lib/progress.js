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

    // Everything below runs AFTER the last slide is written, and together it is
    // the slow half of a generation — the critic alone interleaves a full
    // render with model calls, twice. All of it used to fall through to
    // "Working…", so the phase the user waits longest through was the one the
    // UI said least about.
    case "papers": return "Searching the paper archives…";
    case "field_length_checking": return "Checking what fits…";
    case "field_length":
      // `index` here is the slide being repaired, and it IS the sequence.
      return `Shortening slide ${(p.index ?? 0) + 1} of ${p.total ?? "…"}…`;
    case "coherence_checking": return "Checking the deck holds together…";
    case "coherence_fixing":
      return `Rewriting ${p.count ?? ""} slide${p.count === 1 ? "" : "s"} that drifted…`.replace("  ", " ");
    case "coherence":
      return p.round ? `Checking coherence, round ${p.round}…` : "Checking coherence…";
    case "images":
      // `index` is the SLIDE being illustrated, not the counter — `done` is.
      return p.total
        ? `Finding image ${(p.done ?? 0) + 1} of ${p.total}…`
        : "Finding images…";
    case "images_done": {
      const parts = [];
      if (p.supplied) parts.push(`${p.supplied} image${p.supplied === 1 ? "" : "s"} added`);
      if (p.skipped) parts.push(`${p.skipped} skipped`);
      return parts.length ? `${parts.join(", ")}.` : "No images added.";
    }
    case "critiquing": {
      const round = p.round ? ` (round ${p.round})` : "";
      if (p.phase === "rendering") return `Rendering the deck to look at it${round}…`;
      if (p.phase === "fixing") {
        return `Fixing ${p.count ?? ""} problem${p.count === 1 ? "" : "s"} found${round}…`.replace("  ", " ");
      }
      return p.slide
        ? `Looking at slide ${p.slide} of ${p.total ?? "…"}${round}…`
        : `Looking at the slides${round}…`;
    }
    case "script": return `Writing the script for slide ${(p.index ?? 0) + 1} of ${p.total ?? "…"}…`;

    default: return "Working…";
  }
}
