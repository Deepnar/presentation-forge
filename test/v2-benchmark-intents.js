// V2-3F benchmark intents. Hand-authored DeckIntents, one per V2-3A
// benchmark class, grounded in that class's fixture source pack. No
// model is involved: these are fixed measurement instruments, so a
// green or red result describes the compiler, never a lucky draft.
// Numbers, uncertainties, and takeaways below come verbatim from the
// corresponding test/fixtures/v2-quality/<class>.json sourcePack.
export const BENCHMARK_IDS = [
  "research-defense",
  "source-of-truth-project",
  "technical-explainer",
  "decision-recommendation",
  "data-heavy-analytical",
];

export function researchDefenseIntent() {
  return {
    id: "research-defense",
    title: "Sulfide solid electrolytes",
    audience: "Graduate examination committee in materials science; familiar with electrochemistry, skeptical of performance claims.",
    objective: "Defend the thesis that sulfide solid electrolytes are the most viable near-term path, without overstating inconclusive cycle-life data.",
    slides: [
      {
        id: "rd-open", purpose: "Open the defense", title: "Sulfide solid electrolytes",
        rhetoricalRole: "opening",
        blocks: [{ id: "rd-open-b1", kind: "text", text: "The most viable near-term path to safer high-rate cells" }],
        takeaway: "Sulfide chemistry earns the pilot, not the victory lap",
      },
      {
        id: "rd-problem", purpose: "Establish why liquids must go", title: "Liquid electrolytes leak",
        rhetoricalRole: "problem",
        blocks: [{ id: "rd-problem-b1", kind: "list", items: ["Flammable organic solvents", "Dendrites pierce separators", "Narrow thermal window"] }],
      },
      {
        id: "rd-evidence", purpose: "Report the headline conductivity result", title: "Conductivity by chemistry",
        rhetoricalRole: "evidence",
        blocks: [{
          id: "rd-evidence-c1", kind: "chart", chartKind: "bar", measure: "comparison",
          categories: ["Oxide", "Sulfide", "Polymer"],
          series: [{ name: "mS/cm", values: [1.2, 12.5, 0.4] }],
          caption: "Room temperature, EIS",
          emphasis: "primary", outcome: "favorable",
        }],
        takeaway: "Sulfide at 12.5 mS/cm leads oxide 1.2 and polymer 0.4",
      },
      {
        id: "rd-negative", purpose: "Report the cycle-life result honestly", title: "Two hundred cycles, eight percent fade",
        rhetoricalRole: "evidence",
        blocks: [{
          id: "rd-negative-s1", kind: "stat", value: "8%", label: "capacity fade over 200 cycles",
          emphasis: "primary", outcome: "unfavorable", uncertainty: "inconclusive",
        }],
        takeaway: "The fade figure is reported, not explained away",
      },
      {
        id: "rd-limit", purpose: "State what remains unproven", title: "What we cannot claim yet",
        rhetoricalRole: "limitation",
        blocks: [{ id: "rd-limit-b1", kind: "text", label: "Dendrites", text: "Suppression observed; the mechanism is unconfirmed.", uncertainty: "contested" }],
      },
      {
        id: "rd-close", purpose: "Close without triumph", title: "A pilot, not a victory",
        rhetoricalRole: "conclusion",
        blocks: [{ id: "rd-close-b1", kind: "text", text: "Sulfide leads on rate and loses on certainty." }],
        takeaway: "Fund the pilot; keep watching the fade",
      },
    ],
  };
}

export function sourceOfTruthProjectIntent() {
  return {
    id: "source-of-truth-project",
    title: "Forge presentation compiler",
    audience: "Project examiners grading implementation against plan.",
    objective: "Present what the compiler does today, what it measured, and what is planned — keeping shipped and planned visually distinct.",
    slides: [
      {
        id: "st-open", purpose: "Open the defense", title: "Forge presentation compiler",
        rhetoricalRole: "opening",
        blocks: [{ id: "st-open-b1", kind: "text", text: "Semantic intent in, editable slides out" }],
      },
      {
        id: "st-built", purpose: "Report what is implemented", title: "Shipped this term",
        rhetoricalRole: "evidence",
        blocks: [{ id: "st-built-b1", kind: "list", items: ["Six-recipe intent-to-scene compiler", "Byte-identical deterministic recompiles", "Customized geometry preserved on recompile", "Detached slides stay authoritative"] }],
        takeaway: "The pipeline runs end to end today",
      },
      {
        id: "st-measured", purpose: "Report measured results", title: "Measured, not claimed",
        rhetoricalRole: "evidence",
        blocks: [
          { id: "st-measured-s1", kind: "stat", value: "26/26", label: "V2 contract tests green", emphasis: "primary", outcome: "favorable" },
          { id: "st-measured-s2", kind: "stat", value: "877/878", label: "full suite, one pre-existing locale failure", outcome: "mixed" },
        ],
      },
      {
        id: "st-planned", purpose: "Report what is planned but not built", title: "Planned, not shipped",
        rhetoricalRole: "limitation",
        blocks: [{
          id: "st-planned-b1", kind: "list", items: ["Full recipe families", "Agent runtime", "Browser editor beyond demo"],
          uncertainty: "qualified",
        }],
        takeaway: "The roadmap is a promise, not a result",
      },
      {
        id: "st-limit", purpose: "Name the sharpest limitation", title: "Known rough edge",
        rhetoricalRole: "limitation",
        blocks: [{ id: "st-limit-b1", kind: "text", label: "Cards", text: "Process and comparison cards span the full content height.", outcome: "unfavorable" }],
      },
    ],
  };
}

export function technicalExplainerIntent() {
  return {
    id: "technical-explainer",
    title: "Why solid-state batteries matter",
    audience: "Third-year undergraduates; no electrochemistry background.",
    objective: "Build a working mental model of why solid-state batteries matter, ending in one clear takeaway.",
    slides: [
      {
        id: "te-open", purpose: "Motivate before mechanism", title: "Why the next cell has no liquid inside",
        rhetoricalRole: "opening",
        blocks: [{ id: "te-open-b1", kind: "text", text: "Phones bend, cars crash, grids burn — the liquid inside is the risk" }],
      },
      {
        id: "te-compare", purpose: "Contrast liquid and solid", title: "Liquid vs solid",
        rhetoricalRole: "explanation", relationship: "comparison",
        blocks: [
          { id: "te-compare-l", kind: "text", label: "Liquid", text: "Flammable solvents, piercing dendrites" },
          { id: "te-compare-r", kind: "text", label: "Solid ceramic", text: "Blocks dendrites physically" },
        ],
      },
      {
        id: "te-rate", purpose: "Anchor the key number to intuition", title: "As fast as liquid",
        rhetoricalRole: "evidence",
        blocks: [{
          id: "te-rate-s1", kind: "stat", value: "12.5", label: "sulfide mS/cm, vs ~10 for liquids",
          emphasis: "primary", outcome: "favorable",
        }],
        takeaway: "Solid does not mean slow",
      },
      {
        id: "te-build", purpose: "Show the open hard problem", title: "How a cell is made",
        rhetoricalRole: "explanation", relationship: "sequence",
        blocks: [
          { id: "te-build-a", kind: "text", label: "Mix", text: "Blend cathode powders" },
          { id: "te-build-b", kind: "text", label: "Press", text: "Cold-press the stack" },
          { id: "te-build-c", kind: "text", label: "Seal", text: "Hermetic packaging" },
        ],
      },
      {
        id: "te-hard", purpose: "Name the real bottleneck", title: "Manufacturing, not chemistry",
        rhetoricalRole: "limitation",
        blocks: [{ id: "te-hard-b1", kind: "text", text: "Cold-pressing stacks at scale is the open hard problem.", uncertainty: "qualified" }],
        takeaway: "The factory is harder than the formula",
      },
    ],
  };
}

export function decisionRecommendationIntent() {
  return {
    id: "decision-recommendation",
    title: "Pilot chemistry decision",
    audience: "Program managers holding the pilot budget.",
    objective: "Recommend sulfide for the pilot while keeping oxide as a credible fallback, with trade-offs explicit.",
    slides: [
      {
        id: "dr-open", purpose: "Frame the decision", title: "Which chemistry gets the pilot",
        rhetoricalRole: "opening",
        blocks: [{ id: "dr-open-b1", kind: "text", text: "Rate against certainty, cost against risk" }],
      },
      {
        id: "dr-compare", purpose: "Compare the two credible options", title: "Sulfide vs oxide",
        rhetoricalRole: "decision", relationship: "comparison",
        blocks: [
          { id: "dr-compare-s", kind: "text", label: "Sulfide", text: "12.5 mS/cm; moisture-sensitive handling adds 15% facility cost; 200-cycle data only" },
          { id: "dr-compare-o", kind: "text", label: "Oxide", text: "1.2 mS/cm; air-stable handling; 2000-cycle data" },
          { id: "dr-compare-v", kind: "callout", text: "Sulfide pilots; oxide stays the fallback" },
        ],
        takeaway: "Sulfide pilots, oxide waits in reserve",
      },
      {
        id: "dr-caveat", purpose: "Keep the fallback credible", title: "If moisture control misses budget",
        rhetoricalRole: "limitation",
        blocks: [{ id: "dr-caveat-b1", kind: "text", label: "Fallback trigger", text: "Oxide takes the pilot if the moisture-control line exceeds budget.", uncertainty: "qualified" }],
      },
      {
        id: "dr-close", purpose: "Close with the recommendation", title: "Recommendation",
        rhetoricalRole: "recommendation",
        blocks: [{ id: "dr-close-b1", kind: "text", text: "Fund the sulfide pilot with the oxide fallback written into the plan." }],
        takeaway: "A recommendation that survives its own caveats",
      },
    ],
  };
}

export function dataHeavyAnalyticalIntent() {
  return {
    id: "data-heavy-analytical",
    title: "Conductivity measurement",
    audience: "Analysts who will check every figure.",
    objective: "Make the conductivity comparison and its limits legible at a glance, with every figure traceable.",
    slides: [
      {
        id: "da-open", purpose: "State the measurement", title: "What was measured",
        rhetoricalRole: "opening",
        blocks: [{ id: "da-open-b1", kind: "text", text: "Room-temperature ionic conductivity by EIS, n=5 per chemistry" }],
      },
      {
        id: "da-chart", purpose: "Show the comparison", title: "Conductivity by chemistry",
        rhetoricalRole: "evidence",
        blocks: [{
          id: "da-chart-c1", kind: "chart", chartKind: "bar", measure: "comparison", unit: "mS/cm",
          categories: ["Oxide", "Sulfide", "Polymer"],
          series: [{ name: "mS/cm", values: [1.2, 12.5, 0.4] }],
          caption: "Room temperature, 25C",
          emphasis: "primary",
        }],
      },
      {
        id: "da-table", purpose: "Show precision and limits", title: "Error bars and samples",
        rhetoricalRole: "evidence",
        blocks: [{
          id: "da-table-t1", kind: "table", header: true,
          rows: [["Chemistry", "mS/cm", "Error", "n"], ["Oxide", "1.2", "±0.2", "5"], ["Sulfide", "12.5", "±1.1", "5"], ["Polymer", "0.4", "±0.1", "3"]],
        }],
        takeaway: "Polymer rests on three samples, not five",
      },
      {
        id: "da-close", purpose: "Close on precision", title: "Precision is the product",
        rhetoricalRole: "conclusion",
        blocks: [{ id: "da-close-b1", kind: "text", text: "Every figure above traces to the EIS run; the n=3 polymer row is the weakest link.", uncertainty: "qualified" }],
      },
    ],
  };
}

export function benchmarkIntents() {
  return {
    "research-defense": researchDefenseIntent(),
    "source-of-truth-project": sourceOfTruthProjectIntent(),
    "technical-explainer": technicalExplainerIntent(),
    "decision-recommendation": decisionRecommendationIntent(),
    "data-heavy-analytical": dataHeavyAnalyticalIntent(),
  };
}
