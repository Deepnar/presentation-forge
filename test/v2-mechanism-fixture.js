// Shared 12-family mechanism fixture deck.
export function mechanismDeck() {
  const list4 = ["Alpha point", "Beta point", "Gamma point", "Delta point"];
  return {
    id: "mech", title: "Mechanisms",
    slides: [
      {
        id: "m-divider", purpose: "open", title: "Opening",
        rhetoricalRole: "opening",
        blocks: [{ id: "d1", kind: "text", text: "A talk about cells" }],
      },
      {
        id: "m-prose", purpose: "explain", title: "Plain list",
        blocks: [{ id: "p1", kind: "list", items: list4 }],
      },
      {
        id: "m-cards", purpose: "peers", title: "Peers",
        blocks: [
          { id: "c1", kind: "text", label: "One", text: "First" },
          { id: "c2", kind: "text", label: "Two", text: "Second" },
          { id: "c3", kind: "text", label: "Three", text: "Third" },
        ],
      },
      {
        id: "m-compare", purpose: "compare", title: "Sides", relationship: "comparison",
        blocks: [
          { id: "l", kind: "text", label: "Left", text: "Mature" },
          { id: "r", kind: "text", label: "Right", text: "Novel" },
          { id: "v", kind: "callout", text: "Novel wins" },
        ],
      },
      {
        id: "m-table", purpose: "tabulate", title: "Grid",
        blocks: [{ id: "t1", kind: "table", rows: [["a", "b"], ["c", "d"]], header: true }],
      },
      {
        id: "m-metric", purpose: "headline figure", title: "Figure",
        blocks: [
          { id: "s1", kind: "stat", value: "12.5", label: "mS/cm", emphasis: "primary" },
          { id: "s2", kind: "stat", value: "1.2", label: "oxide" },
        ],
      },
      {
        id: "m-chart", purpose: "show data", title: "Data",
        blocks: [{
          id: "ch1", kind: "chart", chartKind: "bar", categories: ["A", "B"],
          series: [{ name: "v", values: [1, 2] }], unit: "mS/cm",
        }],
      },
      {
        id: "m-seq", purpose: "order", title: "Steps", relationship: "sequence",
        blocks: [
          { id: "q1", kind: "text", label: "One", text: "First" },
          { id: "q2", kind: "text", label: "Two", text: "Second" },
          { id: "q3", kind: "text", label: "Three", text: "Third" },
        ],
      },
      {
        id: "m-cycle", purpose: "loop", title: "Loop", relationship: "cycle",
        blocks: [
          { id: "y1", kind: "text", label: "A", text: "First" },
          { id: "y2", kind: "text", label: "B", text: "Second" },
          { id: "y3", kind: "text", label: "C", text: "Third" },
        ],
      },
      {
        id: "m-hier", purpose: "rank", title: "Ranks", relationship: "hierarchy",
        blocks: [
          { id: "h1", kind: "text", label: "Top", text: "Parent" },
          { id: "h2", kind: "text", label: "Left", text: "Child one" },
          { id: "h3", kind: "text", label: "Right", text: "Child two" },
        ],
      },
      {
        id: "m-media", purpose: "show", title: "Visual",
        blocks: [
          { id: "im1", kind: "image", src: "", alt: "cells", mediaRole: "evidence" },
          { id: "tx1", kind: "list", items: ["Point one", "Point two", "Point three", "Point four"] },
        ],
      },
      {
        id: "m-frame", purpose: "warn", title: "Caution", rhetoricalRole: "limitation",
        blocks: [{ id: "f1", kind: "text", label: "Risk", text: "Handle with care" }],
      },
    ],
  };
}
