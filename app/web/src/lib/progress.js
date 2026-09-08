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

    case "papers": return "Searching the paper archives…";
    case "field_length_checking": return "Checking what fits…";
    case "field_length":
      return `Shortening slide ${(p.index ?? 0) + 1} of ${p.total ?? "…"}…`;
    case "coherence_checking": return "Checking the deck holds together…";
    case "coherence_fixing":
      return `Rewriting ${p.count ?? ""} slide${p.count === 1 ? "" : "s"} that drifted…`.replace("  ", " ");
    case "coherence":
      return p.round ? `Checking coherence, round ${p.round}…` : "Checking coherence…";
    case "images":
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
