// Shared stress fixtures for visual evaluation. Deterministic
// hand-authored intents (no model): the evaluation matrix driver
// renders every deck here on every requested theme. Words, numbers,
// and claims are fixed instruments, never quality judgments.
import { mechanismDeck } from "./v2-mechanism-fixture.js";

export { mechanismDeck };

export function escapeSlide() {
  return {
    id: "x1", purpose: "carry", title: "Carry",
    blocks: [
      { id: "e1", kind: "text", text: "Lone line" },
      { id: "e2", kind: "stat", value: "7", label: "seven" },
      { id: "e3", kind: "table", rows: [["a"]], header: false },
    ],
  };
}

export function escapeComp() {
  return {
    slideId: "x1", family: "escape", variantKey: "escape/standard",
    densityClass: "standard", emphasisTargets: [], mediaTreatment: "none",
    outcomeTreatments: [], caveatTargets: [], takeawayTreatment: "none",
    breaks: { sectionOpen: false }, selectionBasis: "fallback",
  };
}

const T = (id, blocks, extra = {}) => ({ id, purpose: `stress ${id}`, title: `Stress ${id}`, blocks, ...extra });

export function stressDecks() {
  return {
    "stress-table-wrap": [T("m", [
      { id: "t", kind: "table", header: true, rows: [["Chemistry", "Conductivity", "Notes"], ["Oxide", "1.2", "Air-stable handling with a well understood sintering window"], ["Sulfide", "12.5", "Moisture-sensitive handling adds fifteen percent facility cost"]] },
    ])],
    "stress-table-token": [T("m", [
      { id: "t", kind: "table", header: true, rows: [["ID", "Compound", "Note"], ["S1", "Supercalifragilisticexpialidociousness", "ok"], ["S2", "short", "fine"]] },
    ])],
    "stress-table-ragged": [T("m", [
      { id: "t", kind: "table", header: false, rows: [["A", "B", "C"], ["only-one"], ["x", "y"], []] },
    ])],
    "stress-table-wide": [T("m", [
      { id: "t", kind: "table", header: true, rows: [["A", "B", "C", "D", "E", "F"], ["alpha value one", "beta value two", "gamma value three", "delta value four", "epsilon value five", "zeta value six"]] },
    ])],
    "stress-table-status": [T("m", [
      { id: "t", kind: "table", header: true, status: "implemented", rows: [["Item", "State"], ["Compiler", "Shipped"], ["Editor", "Planned"]] },
    ])],
    "stress-chart-many": [T("m", [
      { id: "c", kind: "chart", chartKind: "bar", measure: "comparison", categories: Array.from({ length: 12 }, (_, i) => `Category number ${i + 1}`), series: [{ name: "Score", values: [3, 7, 5, 9, 2, 8, 4, 6, 1, 10, 5, 7] }] },
    ])],
    "stress-chart-neg": [T("m", [
      { id: "c", kind: "chart", chartKind: "bar", measure: "comparison", categories: ["Q1", "Q2", "Q3"], series: [{ name: "Delta", values: [-3.5, 2.0, -1.25] }] },
    ])],
    "stress-chart-pie": [T("m", [
      { id: "c", kind: "chart", chartKind: "pie", categories: ["Sulfide", "Oxide", "Polymer", "Hybrid composite blend"], series: [{ name: "Share", values: [45, 25, 15, 15] }] },
    ])],
    "stress-chart-hbar": [T("m", [
      { id: "c", kind: "chart", chartKind: "hbar", categories: ["Alpha", "Beta", "Gamma"], series: [{ name: "S", values: [1, 2, 3] }] },
    ])],
    "stress-chart-line": [T("m", [
      { id: "c", kind: "chart", chartKind: "line", measure: "trend", categories: ["Jan", "Feb", "Mar", "Apr"], series: [{ name: "Temp", values: [1.1, 1.4, 1.2, 1.8] }] },
    ])],
    "stress-chart-area": [T("m", [
      { id: "c", kind: "chart", chartKind: "area", measure: "trend", categories: ["W1", "W2", "W3"], series: [{ name: "Load", values: [2, 5, 3] }] },
    ])],
    "stress-chart-doughnut": [T("m", [
      { id: "c", kind: "chart", chartKind: "doughnut", categories: ["A", "B", "C"], series: [{ name: "Split", values: [50, 30, 20] }] },
    ])],
    "stress-compare-full": [{ id: "m", purpose: "full compare", title: "Full compare", relationship: "comparison", takeaway: "Choose left today", blocks: [
      { id: "l", kind: "text", label: "Shipped today with substantial detail", text: "The full body copy for the left side bedding down across lines.", status: "implemented", outcome: "favorable" },
      { id: "r", kind: "text", label: "Planned next with substantial detail", text: "The full body copy for the right side bedding down across lines.", status: "planned", uncertainty: "qualified" },
      { id: "v", kind: "callout", text: "Verdict support line" },
    ] }],
    "stress-extreme-text": [T("m", [{ id: "b", kind: "text", label: "Label", text: "Word ".repeat(200).trim() }])],
    "stress-status-pressure": [{ id: "m", purpose: "pressure", title: "Pressure", blocks: [
      { id: "a", kind: "text", label: "A", text: "Copy ".repeat(40).trim(), status: "implemented" },
      { id: "b", kind: "text", label: "B", text: "Copy ".repeat(40).trim(), status: "planned", uncertainty: "qualified" },
    ] }],
  };
}
