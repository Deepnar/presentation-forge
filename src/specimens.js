import { deckSchema } from "./ai/catalog.js";
import { ROOT } from "./paths.js";

/**
 * The slide-type specimen deck: one valid example per slide type, used by the
 * deck detail's type-swap gallery to preview all 75 types in the current theme.
 *
 * The examples are now self-contained: neutral gap specimens for the layout-
 * focused types plus a curated fallback set derived from the former demo decks.
 * They are embedded here so the gallery never depends on external deck folders
 * that may be pruned (the "swap slide type" validation failure that motivated
 * this change: decks/type-batch* were removed and the old fallback produced a
 * headline-only slide for ~60 types, which fails validation for every type
 * that requires structured fields).
 *
 * This is build-on-demand: a single specimen deck is assembled, rendered in the
 * requested theme, and the per-slide PNGs are the gallery thumbnails. Cached by
 * theme so re-rendering the gallery is free.
 */

const SPECIMEN_GAPS = {
  image: {
    headline: "A headline over the image",
    image: "__placeholder__",
    caption: "The image lives here — picked when you choose this type.",
  },
  "image-text": {
    headline: "The point beside the image",
    image: "__placeholder__",
    body: ["Image on one side, the claim on the other.", "A supporting sentence that grounds the visual."],
    caption: "Where the picture came from, and when it was taken.",
  },
  // The FILLED state, deliberately: this type renders two ways, and the sweeps
  // can only see one of them. The filled one is where the risk is — a narrowed
  // text column is where points overflow, and `caption` only exists in that
  // branch, so an empty-seat specimen would leave it a field nothing has ever
  // rendered. The empty state is the bullets layout at full width and is
  // covered by test/illustrated-points.test.js, which renders both.
  "illustrated-points": {
    headline: "Points that can take a picture",
    image: "__placeholder__",
    points: [
      "The image field is optional, so this slide is finished without one.",
      "A supply can fill it in place later without touching the points.",
      "With a picture the points move to a column; nothing is dropped.",
    ],
    caption: "Where the picture came from, and when it was taken.",
  },
  freeform: {
    html:
      "<style>body{font-family:Inter,sans-serif;background:#F4F0E6;display:flex;" +
      "align-items:center;justify-content:center;height:100%;margin:0}" +
      ".card{background:#fff;padding:48px 64px;border-radius:16px;box-shadow:" +
      "0 24px 48px rgba(0,0,0,.18)}h1{margin:0 0 8px;font-size:40px}." +
      "sub{color:#666;font-size:18px}</style>" +
      "<div class=card><h1>Freeform slide</h1><div class=sub>Any layout you like — " +
      "this one is a simple card. Rasterised, not editable later.</div></div>",
  },
  compare: {
    headline: "Two options, one trade-off",
    standfirst: "Both sides solve the same problem differently — the choice is what each gives up.",
    left: {
      title: "Option A",
      kicker: "The proven path",
      body: "Fast to adopt, on tooling people know.",
      points: ["Ships this quarter", "Hiring pool is deep"],
    },
    right: {
      title: "Option B",
      kicker: "The efficient path",
      body: "Cheaper at scale, for more setup today.",
      points: ["Lower unit cost", "Fewer moving parts"],
    },
    verdict: "Pick the one whose trade-off fits this brief.",
  },
  table: {
    headline: "The comparison at a glance",
    columns: ["Parameter", "Option A", "Option B"],
    rows: [
      ["Setup effort", "Low", "High"],
      ["Ongoing cost", "Higher", "Lower"],
      ["Ecosystem size", "Large", "Growing"],
    ],
  },
  stats: {
    headline: "The numbers that matter",
    standfirst: "Three figures that frame the decision.",
    stats: [
      { value: "2×", label: "Setup speed", sub: "for the common case" },
      { value: "40%", label: "Lower running cost", sub: "at comparable scale" },
      { value: "3", label: "Key integrations", sub: "you would manage yourself" },
    ],
  },
  bullets: {
    headline: "The argument in order",
    standfirst: "The core points, each a complete statement.",
    bullets: [
      "The current approach works but does not scale with the workload.",
      "The alternative removes the bottleneck at the price of more setup.",
      "Most teams should switch when the workload crosses this threshold.",
      "Adopting early compounds — the learning cost only rises later.",
    ],
  },
  timeline: {
    headline: "The road so far",
    events: [
      { when: "Year one", what: "The first version shipped and proved the approach." },
      { when: "Year three", what: "Early adopters reported real, measured gains." },
      { when: "Today", what: "The trade-offs are clear enough to decide." },
    ],
  },
  quote: {
    quote: "The best choice is the one you can commit to — the option itself matters less than the follow-through.",
    attribution: "A practitioner's rule of thumb",
  },
  callout: {
    headline: "Where this lands",
    label: "Takeaway",
    body: "The decision comes down to one question: does the extra setup buy enough in return? For this brief, the answer is yes.",
  },
  references: {
    headline: "References",
    items: [
      "Industry primer on the current landscape, 2024.",
      "Comparative field notes from three early adopters, 2025.",
      "Cost-model working paper, 2025.",
    ],
  },
  cards: {
    headline: "The four building blocks",
    cards: [
      { kicker: "Foundation", title: "Component one", body: "The foundation everything else sits on." },
      { kicker: "Runtime", title: "Component two", body: "Handles the core workload day to day." },
      { kicker: "Differentiator", title: "Component three", body: "Adds the capabilities that differentiate." },
      { kicker: "Edge", title: "Component four", body: "Pulls the parts together at the edge." },
    ],
  },
};

const DEMO_SPECIMENS = {
  "title": {
    "type": "title",
    "section": 0
  },
  "agenda": {
    "type": "agenda",
    "headline": "What we cover",
    "items": [
      {
        "title": "The one number that matters",
        "desc": "A hero statistic in isolation"
      },
      {
        "title": "Where we've been",
        "desc": "Milestones along the way"
      },
      {
        "title": "The trade-off",
        "desc": "Pros and cons side by side"
      },
      {
        "title": "The point",
        "desc": "A key takeaway, called out"
      }
    ]
  },
  "big-number": {
    "type": "big-number",
    "headline": "Global hydrogen capacity",
    "value": "180 GW",
    "label": "of electrolysis capacity committed by 2030",
    "body": "Projections across the major deployment roadmaps converge on this figure, driven by policy support in the EU, Japan and the US Inflation Reduction Act.",
    "sub": "IEA Net Zero scenario"
  },
  "milestone": {
    "type": "milestone",
    "headline": "How the market reached this point",
    "milestones": [
      {
        "when": "2019",
        "title": "First utility-scale plants",
        "body": "Pilot projects in Europe and Japan prove continuous operation."
      },
      {
        "when": "2022",
        "title": "Policy inflection",
        "body": "The Inflation Reduction Act and REPowerEU unlock project finance."
      },
      {
        "when": "2030",
        "title": "Committed capacity online",
        "body": "The 180 GW of announced projects start producing."
      }
    ]
  },
  "pros-cons": {
    "type": "pros-cons",
    "headline": "Electrolysis at a glance",
    "pros": [
      "Zero-carbon hydrogen from water and renewables",
      "Mature stack manufacturing with falling costs",
      "Scales together with grid build-out"
    ],
    "cons": [
      "Fresh-water and rare-metal dependencies",
      "High upfront capital for the electrolyser plant",
      "Efficiency losses across power-to-hydrogen"
    ]
  },
  "emphasis": {
    "type": "emphasis",
    "headline": "The key takeaway",
    "label": "The framework",
    "body": "Green hydrogen's cost curve is falling roughly in step with renewables — the constraint today is project finance and grid access, not the technology itself."
  },
  "definition": {
    "type": "definition",
    "headline": "A term worth defining",
    "term": "Overpotential",
    "definition": "The extra voltage above the ideal 1.23 V that real electrolysers need to overcome activation and resistance losses at practical current densities.",
    "example": "Ideal 1.23 V vs around 1.8 V at a typical operating current density."
  },
  "section": {
    "type": "section",
    "headline": "Foundation",
    "section": 0
  },
  "chapter": {
    "type": "chapter",
    "headline": "A lighter pause in the argument",
    "standfirst": "Chapter openers break the flow without claiming a whole new part.",
    "section": 0
  },
  "closing": {
    "type": "closing",
    "headline": "Where the field is heading",
    "body": "The direction of travel is clear, but the pace depends on policy and capital.",
    "cta": "Get in touch",
    "section": 0
  },
  "numbered-list": {
    "type": "numbered-list",
    "headline": "A sequence that matters",
    "items": [
      "Establish the baseline conditions for the experiment",
      "Apply the treatment to the test cohort only",
      "Measure the outcome after a fixed washout period",
      "Compare against the control arm"
    ]
  },
  "checklist": {
    "type": "checklist",
    "headline": "Verification checklist",
    "items": [
      {
        "text": "Sources cross-checked against the institutional library",
        "checked": true
      },
      {
        "text": "All figures grounded in the research notes",
        "checked": true
      },
      {
        "text": "Figures and tables numbered consistently",
        "checked": true
      },
      {
        "text": "Ethical approval filed with the department office",
        "checked": false
      },
      {
        "text": "Raw data archived alongside the final manuscript",
        "checked": false
      }
    ]
  },
  "feature-grid": {
    "type": "feature-grid",
    "headline": "Capability overview",
    "items": [
      {
        "icon": "⚡",
        "title": "Fast iteration",
        "body": "Sub-second rebuilds keep the feedback loop tight."
      },
      {
        "icon": "🔒",
        "title": "Local first",
        "body": "Your notes never leave the machine."
      },
      {
        "icon": "🎨",
        "title": "Themed output",
        "body": "Twenty design languages, one click away."
      },
      {
        "icon": "📊",
        "title": "Grounded facts",
        "body": "Claims are checked against the research pass."
      }
    ]
  },
  "grid-items": {
    "type": "grid-items",
    "headline": "Spec sheet",
    "items": [
      {
        "label": "Canvas",
        "value": "13.333 × 7.5 in"
      },
      {
        "label": "Themes",
        "value": "20"
      },
      {
        "label": "Types",
        "value": "75"
      },
      {
        "label": "Output",
        "value": "PPTX + PDF"
      },
      {
        "label": "Pipeline",
        "value": "Local-first"
      },
      {
        "label": "Fonts",
        "value": "27 families"
      }
    ]
  },
  "icon-list": {
    "type": "icon-list",
    "headline": "What the pipeline guarantees",
    "items": [
      {
        "icon": "✓",
        "text": "Validated content before anything renders"
      },
      {
        "icon": "◇",
        "text": "A human gate on the outline before generation"
      },
      {
        "icon": "✎",
        "text": "Inline editing that never wakes a model"
      },
      {
        "icon": "⛭",
        "text": "A full vocabulary across every rhetorical beat"
      }
    ]
  },
  "stacked-list": {
    "type": "stacked-list",
    "headline": "From brief to deck",
    "items": [
      {
        "tag": "Stage 1",
        "title": "Research",
        "body": "Notes grounded in the sources you supply."
      },
      {
        "tag": "Stage 2",
        "title": "Outline",
        "body": "A plan a human reviews and approves."
      },
      {
        "tag": "Stage 3",
        "title": "Render",
        "body": "Native slides with baked-in text fitting."
      },
      {
        "tag": "Stage 4",
        "title": "Critique",
        "body": "A vision pass that re-renders until nothing overlaps."
      }
    ]
  },
  "kpi-dashboard": {
    "type": "kpi-dashboard",
    "headline": "Quarterly pulse",
    "kpis": [
      {
        "label": "Active users",
        "value": "48.2K",
        "trend": "up",
        "change": "+4.1%"
      },
      {
        "label": "Churn",
        "value": "2.3%",
        "trend": "down",
        "change": "-0.4%"
      },
      {
        "label": "NPS",
        "value": "61",
        "trend": "up",
        "change": "+3"
      },
      {
        "label": "Open rate",
        "value": "38%",
        "trend": "flat",
        "change": "0"
      }
    ]
  },
  "data-cards": {
    "type": "data-cards",
    "headline": "The system at a glance",
    "cards": [
      {
        "value": "10×",
        "label": "Peak speedup",
        "body": "Workers keep the bottleneck moving."
      },
      {
        "value": "99.9%",
        "label": "Uptime",
        "body": "Rolling deploys, three-zone failover."
      },
      {
        "value": "12ms",
        "label": "Median latency",
        "body": "Measured edge-to-core on the backbone."
      },
      {
        "value": "300+",
        "label": "Integrations",
        "body": "First-party connectors and an open SDK."
      }
    ]
  },
  "progress-bars": {
    "type": "progress-bars",
    "headline": "Delivery status",
    "bars": [
      {
        "label": "Research",
        "value": 100,
        "target": 100
      },
      {
        "label": "Design",
        "value": 80,
        "target": 90
      },
      {
        "label": "Build",
        "value": 55,
        "target": 75
      },
      {
        "label": "Testing",
        "value": 30,
        "target": 60
      },
      {
        "label": "Ship",
        "value": 10,
        "target": 40
      }
    ]
  },
  "ranking-list": {
    "type": "ranking-list",
    "headline": "Benchmark leaderboard",
    "items": [
      {
        "rank": 1,
        "label": "Region EMEA",
        "detail": "Two clusters, fully automated",
        "value": "9.4"
      },
      {
        "rank": 2,
        "label": "Region APAC",
        "detail": "Three clusters, one legacy node",
        "value": "8.1"
      },
      {
        "rank": 3,
        "label": "Region AMER",
        "detail": "Mixed fleet with manual ops",
        "value": "7.7"
      },
      {
        "rank": 4,
        "label": "Region LATAM",
        "detail": "Single cluster under capacity",
        "value": "5.9"
      }
    ]
  },
  "metric-comparison": {
    "type": "metric-comparison",
    "headline": "Baseline versus target",
    "left": {
      "value": "180 GW",
      "label": "committed by 2030"
    },
    "right": {
      "value": "95 GW",
      "label": "operating today"
    },
    "delta": "+89%",
    "body": "The gap closes only if announced projects convert to final investment decisions at the historic rate."
  },
  "sparklines": {
    "type": "sparklines",
    "headline": "Load and temperature",
    "items": [
      {
        "label": "CPU load",
        "value": "0.42",
        "values": [
          0.1,
          0.2,
          0.15,
          0.4,
          0.35,
          0.42
        ]
      },
      {
        "label": "Memory",
        "value": "68%",
        "values": [
          52,
          55,
          60,
          58,
          64,
          68
        ]
      },
      {
        "label": "Temp",
        "value": "71°C",
        "values": [
          60,
          62,
          65,
          68,
          66,
          71
        ]
      },
      {
        "label": "Requests",
        "value": "2.1K",
        "values": [
          1.2,
          1.4,
          1.6,
          1.5,
          1.9,
          2.1
        ]
      }
    ]
  },
  "chart": {
    "type": "chart",
    "headline": "Scatter of cost against scale",
    "section": 0,
    "aside": [
      "Cost per unit falls as the installed base grows.",
      "The fourth point is a pilot, not a production site."
    ],
    "chart": {
      "kind": "scatter",
      "categories": [
        "A",
        "B",
        "C",
        "D"
      ],
      "series": [
        {
          "name": "Levelised cost",
          "values": [
            1,
            3,
            6,
            9
          ]
        }
      ]
    }
  },
  "before-after": {
    "type": "before-after",
    "headline": "What the redesign changed",
    "before": {
      "title": "Monolithic deployment",
      "body": "A single server ran everything, so any change meant a full redeploy and any outage was total."
    },
    "after": {
      "title": "Service-oriented pipeline",
      "body": "Independent services deploy on their own cadence, fail in isolation, and scale to the load actually present."
    },
    "section": 0
  },
  "framework": {
    "type": "framework",
    "headline": "The operating model",
    "concept": {
      "title": "Platform",
      "body": "shared foundation"
    },
    "elements": [
      {
        "title": "Identity"
      },
      {
        "title": "Data",
        "body": "governed lake"
      },
      {
        "title": "Messaging"
      },
      {
        "title": "Observability",
        "body": "traces + logs"
      },
      {
        "title": "Compute"
      },
      {
        "title": "Edge"
      }
    ],
    "section": 0
  },
  "matrix": {
    "type": "matrix",
    "headline": "Prioritisation grid",
    "axes": {
      "x": {
        "label": "Effort",
        "low": "Low effort",
        "high": "High effort"
      },
      "y": {
        "label": "Impact",
        "low": "Low impact",
        "high": "High impact"
      }
    },
    "quadrants": [
      {
        "title": "Quick wins",
        "body": "High impact, low effort — do these first."
      },
      {
        "title": "Big bets",
        "body": "High impact, high effort — sequence carefully."
      },
      {
        "title": "Fill-ins",
        "body": "Low impact, low effort — slot in spare cycles."
      },
      {
        "title": "Time sinks",
        "body": "Low impact, high effort — deprioritise."
      }
    ],
    "section": 0
  },
  "scorecard": {
    "type": "scorecard",
    "headline": "Vendor scorecard",
    "criteria": [
      {
        "label": "Cost",
        "weight": "30%"
      },
      {
        "label": "Time to value",
        "weight": "25%"
      },
      {
        "label": "Fit with stack",
        "weight": "25%"
      },
      {
        "label": "Support",
        "weight": "20%"
      }
    ],
    "options": [
      {
        "name": "Vendor A",
        "scores": [
          4,
          5,
          3,
          4
        ]
      },
      {
        "name": "Vendor B",
        "scores": [
          3,
          3,
          5,
          4
        ]
      },
      {
        "name": "Vendor C",
        "scores": [
          5,
          4,
          2,
          3
        ]
      }
    ],
    "section": 0
  },
  "vs": {
    "type": "vs",
    "headline": "Two roads",
    "left": {
      "title": "Buy"
    },
    "right": {
      "title": "Build"
    },
    "left_body": "Fastest to market, ongoing licensing, black-box behaviour.",
    "right_body": "Total control, real engineering cost, long runway.",
    "section": 0
  },
  "side-by-side": {
    "type": "side-by-side",
    "headline": "The two sites at a glance",
    "left": {
      "image": "__placeholder__",
      "title": "North campus",
      "body": "The original cluster, now the disaster-recovery site."
    },
    "right": {
      "image": "__placeholder__",
      "title": "South campus",
      "body": "The primary cluster with the newest hardware generation."
    },
    "section": 0
  },
  "funnel": {
    "type": "funnel",
    "headline": "Conversion across the stages",
    "stages": [
      {
        "label": "Leads",
        "value": "100%"
      },
      {
        "label": "Qualified",
        "value": "42%",
        "body": "meet the criteria"
      },
      {
        "label": "Proposed",
        "value": "18%"
      },
      {
        "label": "Closed won",
        "value": "9%"
      }
    ],
    "section": 0
  },
  "pipeline": {
    "type": "pipeline",
    "headline": "The delivery pipeline",
    "stages": [
      {
        "title": "Commit",
        "body": "code merged",
        "gate": "build"
      },
      {
        "title": "Test",
        "body": "unit + e2e",
        "gate": "coverage"
      },
      {
        "title": "Stage",
        "body": "deploy to env",
        "gate": "approval"
      },
      {
        "title": "Prod",
        "body": "gradual roll-out",
        "gate": "release"
      }
    ],
    "section": 0
  },
  "dependencies": {
    "type": "dependencies",
    "headline": "What depends on what",
    "nodes": [
      {
        "title": "Events",
        "body": "ingested"
      },
      {
        "title": "Enrichment",
        "body": "joins context",
        "depends_on": [
          0
        ]
      },
      {
        "title": "Storage",
        "body": "columnar lake",
        "depends_on": [
          1
        ]
      },
      {
        "title": "Serving",
        "body": "read models",
        "depends_on": [
          2
        ]
      },
      {
        "title": "Alerts",
        "body": "thresholded",
        "depends_on": [
          1,
          2
        ]
      }
    ],
    "section": 0
  },
  "branching-flow": {
    "type": "branching-flow",
    "headline": "How an order flows",
    "steps": [
      {
        "title": "Receive order"
      },
      {
        "title": "Validate"
      }
    ],
    "decision": "Credit check passes?",
    "branches": [
      {
        "label": "Approve",
        "steps": [
          {
            "title": "Confirm order"
          },
          {
            "title": "Notify team"
          }
        ]
      },
      {
        "label": "Review",
        "steps": [
          {
            "title": "Manual check"
          },
          {
            "title": "Decision"
          }
        ]
      }
    ],
    "section": 0
  },
  "layered-architecture": {
    "type": "layered-architecture",
    "headline": "The platform stack",
    "layers": [
      {
        "label": "Presentation",
        "body": "web and mobile clients",
        "items": [
          "React",
          "Mobile"
        ]
      },
      {
        "label": "API gateway",
        "body": "routing and auth",
        "items": [
          "GraphQL",
          "OAuth"
        ]
      },
      {
        "label": "Services",
        "body": "business logic",
        "items": [
          "Orders",
          "Users",
          "Billing"
        ]
      },
      {
        "label": "Data",
        "body": "stores and caches",
        "items": [
          "Postgres",
          "Redis",
          "S3"
        ]
      }
    ],
    "section": 0
  },
  "roadmap": {
    "type": "roadmap",
    "headline": "The delivery roadmap",
    "time_labels": [
      "Now",
      "Next",
      "Later"
    ],
    "phases": [
      {
        "label": "Platform",
        "items": [
          {
            "title": "Auth hardening",
            "body": "SSO + MFA"
          },
          {
            "title": "Rate limiting"
          }
        ]
      },
      {
        "label": "Product",
        "items": [
          {
            "title": "Workspaces"
          },
          {
            "title": "Templates",
            "body": "reusable decks"
          },
          {
            "title": "Add-ins"
          }
        ]
      },
      {
        "label": "Reach",
        "items": [
          {
            "title": "Mobile apps"
          },
          {
            "title": "Localisation"
          }
        ]
      }
    ],
    "section": 0
  },
  "journey": {
    "type": "journey",
    "headline": "The onboarding journey",
    "stages": [
      {
        "label": "Discovery",
        "body": "excited about the promise",
        "sentiment": "positive"
      },
      {
        "label": "Signup",
        "body": "friction at the form",
        "sentiment": "negative"
      },
      {
        "label": "First run",
        "body": "the aha moment",
        "sentiment": "positive"
      },
      {
        "label": "Setup",
        "body": "configuration fatigue",
        "sentiment": "neutral"
      },
      {
        "label": "Daily use",
        "body": "settled into a rhythm",
        "sentiment": "positive"
      }
    ],
    "section": 0
  },
  "chronology": {
    "type": "chronology",
    "headline": "How the project unfolded",
    "events": [
      {
        "year": "2019",
        "text": "The first prototype ships to a single campus."
      },
      {
        "year": "2021",
        "text": "Wider rollout begins with three partner institutions."
      },
      {
        "year": "2023",
        "text": "The platform passes a million generated slides."
      },
      {
        "year": "2025",
        "text": "Academic review recognises the citation workflow."
      },
      {
        "year": "2026",
        "text": "Research grounding becomes a default guardrail."
      }
    ],
    "section": 0
  },
  "testimonial": {
    "type": "testimonial",
    "headline": "What the guide said",
    "quote": "The final deck survived contact with a picky committee — the sources were right there in the notes.",
    "name": "Dr. Meera Rao",
    "role": "Guide, Systems Engineering",
    "image": "__placeholder__",
    "section": 0
  },
  "pull-quote": {
    "type": "pull-quote",
    "headline": "The point worth repeating",
    "quote": "Clarity is a feature, not an afterthought.",
    "attribution": "Internal design principle",
    "section": 0
  },
  "epigraph": {
    "type": "epigraph",
    "quote": "The only way to do great work is to love what you do.",
    "attribution": "Steve Jobs",
    "source": "Stanford commencement, 2005",
    "section": 0
  },
  "warning": {
    "type": "warning",
    "headline": "Before you begin",
    "label": "Caution",
    "body": "Do not skip the calibration step — an uncalibrated rig invalidates the whole batch and the error only shows up weeks later in the analysis.",
    "section": 0
  },
  "tip": {
    "type": "tip",
    "headline": "Make it easier",
    "label": "Tip",
    "body": "Keep the source archive in the same folder as the deck so the research pass and the final render always agree.",
    "section": 0
  },
  "takeaway": {
    "type": "takeaway",
    "headline": "What matters",
    "label": "Key takeaway",
    "body": "The constraint is project finance and grid access, not the technology.",
    "points": [
      "Costs fall in step with renewables",
      "Policy unlocks the financing",
      "Grid build-out is the pacing item"
    ],
    "section": 0
  },
  "image-grid": {
    "type": "image-grid",
    "headline": "Site photographs",
    "images": [
      {
        "src": "__placeholder__",
        "caption": "North plot"
      },
      {
        "src": "__placeholder__",
        "caption": "South plot"
      },
      {
        "src": "__placeholder__",
        "caption": "Overview"
      },
      {
        "src": "__placeholder__",
        "caption": "Detail"
      }
    ],
    "section": 0
  },
  "hero-image": {
    "type": "hero-image",
    "headline": "The field at dawn",
    "subtitle": "A project note from the first survey season.",
    "image": "__placeholder__",
    "section": 0
  },
  "split-screen": {
    "type": "split-screen",
    "headline": "Two systems side by side",
    "left": "__placeholder__",
    "right": "__placeholder__",
    "left_caption": "Baseline",
    "right_caption": "With treatment",
    "section": 0
  },
  "data-table": {
    "type": "data-table",
    "headline": "Quarterly figures",
    "columns": [
      {
        "label": "Metric"
      },
      {
        "label": "Q1",
        "align": "right"
      },
      {
        "label": "Q2",
        "align": "right"
      }
    ],
    "row_labels": [
      "Revenue",
      "Costs",
      "Margin"
    ],
    "rows": [
      {
        "text": [
          "1.4M",
          "1.2M",
          "1.8M"
        ],
        "highlight": true
      },
      {
        "text": [
          "0.9M",
          "0.8M",
          "1.1M"
        ]
      },
      {
        "text": [
          "35%",
          "33%",
          "39%"
        ]
      }
    ],
    "section": 0
  },
  "decision-matrix": {
    "type": "decision-matrix",
    "headline": "Choosing the platform",
    "criteria": [
      {
        "label": "Cost",
        "weight": 2
      },
      {
        "label": "Time to value",
        "weight": 1
      },
      {
        "label": "Fit",
        "weight": 3
      }
    ],
    "options": [
      {
        "name": "Vendor A",
        "scores": [
          4,
          5,
          3
        ]
      },
      {
        "name": "Vendor B",
        "scores": [
          3,
          3,
          5
        ]
      },
      {
        "name": "Vendor C",
        "scores": [
          5,
          4,
          2
        ]
      }
    ],
    "section": 0
  },
  "diagram": {
    "type": "diagram",
    "headline": "The data pipeline (vertical)",
    "layout": "vertical",
    "nodes": [
      {
        "id": "a",
        "label": "Ingest",
        "body": "raw events"
      },
      {
        "id": "b",
        "label": "Parse",
        "body": "normalise"
      },
      {
        "id": "c",
        "label": "Load",
        "body": "to lake"
      },
      {
        "id": "d",
        "label": "Serve",
        "body": "read models"
      },
      {
        "id": "e",
        "label": "Alert",
        "body": "thresholds"
      }
    ],
    "edges": [
      {
        "from": "a",
        "to": "b",
        "label": "batched"
      },
      {
        "from": "b",
        "to": "c",
        "label": "hourly"
      },
      {
        "from": "c",
        "to": "d"
      },
      {
        "from": "c",
        "to": "e"
      }
    ],
    "section": 0
  },
  "pyramid": {
    "type": "pyramid",
    "headline": "The decision hierarchy",
    "levels": [
      {
        "label": "Governance",
        "body": "policy and risk"
      },
      {
        "label": "Architecture",
        "body": "principles and patterns"
      },
      {
        "label": "Product",
        "body": "what we build"
      },
      {
        "label": "Delivery",
        "body": "how we ship"
      }
    ],
    "section": 0
  },
  "venn": {
    "type": "venn",
    "headline": "Where the skills overlap",
    "sets": [
      {
        "label": "Research",
        "items": [
          "Surveys",
          "Interviews",
          "Statistics"
        ]
      },
      {
        "label": "Design",
        "items": [
          "Wireframes",
          "Prototypes",
          "Testing"
        ]
      },
      {
        "label": "Engineering",
        "items": [
          "Systems",
          "Data",
          "Automation"
        ]
      }
    ],
    "section": 0
  },
  "hierarchy": {
    "type": "hierarchy",
    "headline": "The team structure",
    "root": {
      "label": "Programme lead"
    },
    "children": [
      {
        "label": "Research",
        "children": [
          {
            "label": "Fieldwork",
            "children": [
              {
                "label": "Interviews"
              }
            ]
          },
          {
            "label": "Analysis"
          }
        ]
      },
      {
        "label": "Delivery",
        "children": [
          {
            "label": "Frontend"
          },
          {
            "label": "Backend"
          },
          {
            "label": "QA"
          }
        ]
      },
      {
        "label": "Operations",
        "children": [
          {
            "label": "Support"
          }
        ]
      }
    ],
    "section": 0
  },
  "glossary": {
    "type": "glossary",
    "headline": "Key terms",
    "entries": [
      {
        "term": "Overpotential",
        "definition": "Extra voltage beyond the 1.23 V ideal, lost to activation and resistance."
      },
      {
        "term": "Electrolyser",
        "definition": "The stack that splits water into hydrogen and oxygen."
      },
      {
        "term": "Load factor",
        "definition": "Average output over nameplate capacity, in percent."
      },
      {
        "term": "Curtailment",
        "definition": "Deliberately reducing output when the grid cannot absorb it."
      }
    ],
    "section": 0
  },
  "faq": {
    "type": "faq",
    "headline": "Common questions",
    "items": [
      {
        "question": "Does the deck work offline?",
        "answer": "Yes — the whole pipeline is local by default; only an attached cloud model needs a connection."
      },
      {
        "question": "Can I reuse the research pass?",
        "answer": "One brief produces both the deck and the report from the same notes."
      },
      {
        "question": "Who owns the layout?",
        "answer": "The theme does. Content only declares what a slide says."
      }
    ],
    "section": 0
  },
  "team-grid": {
    "type": "team-grid",
    "headline": "The team",
    "members": [
      {
        "name": "Deepesh Sonar",
        "role": "Programme lead"
      },
      {
        "name": "Meera Rao",
        "role": "Research"
      },
      {
        "name": "Arun Nair",
        "role": "Design"
      },
      {
        "name": "Fatima Khan",
        "role": "Engineering"
      },
      {
        "name": "Rahul Verma",
        "role": "Operations"
      }
    ],
    "section": 0
  },
  "attribution": {
    "type": "attribution",
    "headline": "Acknowledgements",
    "items": [
      {
        "name": "Prof. Sharma",
        "contribution": "Supervision and review"
      },
      {
        "name": "Dr. Iyer",
        "contribution": "Methodology guidance"
      },
      {
        "name": "The lab team",
        "contribution": "Instrument access"
      },
      {
        "name": "The admin office",
        "contribution": "Clearance and logistics"
      }
    ],
    "section": 0
  },
  "contact": {
    "type": "contact",
    "headline": "Reach us",
    "items": [
      {
        "label": "email",
        "value": "forge@example.edu"
      },
      {
        "label": "office",
        "value": "Room 4-12, Block B"
      },
      {
        "label": "web",
        "value": "forge.example.edu"
      }
    ],
    "section": 0
  },
  "equation": {
    "type": "equation",
    "headline": "Levelised cost of hydrogen",
    "formula": "LCOH = (CAPEX · CRF + OPEX) / H₂ output",
    "body": "The levelised cost averages total lifetime cost over the hydrogen the plant actually produces, so utilisation is the dominant lever.",
    "variables": [
      {
        "symbol": "CAPEX",
        "meaning": "capital expenditure"
      },
      {
        "symbol": "CRF",
        "meaning": "capital recovery factor"
      },
      {
        "symbol": "OPEX",
        "meaning": "operating expenditure"
      }
    ],
    "section": 0
  },
  "bibliography": {
    "type": "bibliography",
    "headline": "Annotated sources",
    "entries": [
      {
        "citation": "Smith, J. et al. (2024). Electrolysis at scale. Energy Reports.",
        "annotation": "The definitive cost-curve survey used for the 2030 figure."
      },
      {
        "citation": "IEA (2025). Global Hydrogen Review.",
        "annotation": "Capacity announcements across the major roadmaps."
      },
      {
        "citation": "Rao, M. (2026). Grid integration of electrolysers.",
        "annotation": "Local case study on curtailment and load factor."
      }
    ],
    "section": 0
  },
  "data-source": {
    "type": "data-source",
    "headline": "Where the numbers come from",
    "sources": [
      {
        "name": "IEA Global Hydrogen Review 2025",
        "url": "iea.org/reports/global-hydrogen-review",
        "description": "Capacity and cost projections by region."
      },
      {
        "name": "EU Hydrogen Strategy",
        "url": "energy.ec.europa.eu",
        "description": "Policy targets feeding the roadmap slide."
      },
      {
        "name": "Industry association data",
        "url": "hydrogen-assoc.org",
        "description": "Monthly electrolyser deployment tracker."
      }
    ],
    "section": 0
  },
  "flow": {
    "type": "flow",
    "headline": "Six stages, vertical",
    "direction": "ttb",
    "steps": [
      {
        "title": "Discovery",
        "body": "Understand the problem space and constraints."
      },
      {
        "title": "Framing",
        "body": "Turn findings into a sharp research question."
      },
      {
        "title": "Design",
        "body": "Plan the method and the instruments."
      },
      {
        "title": "Fieldwork",
        "body": "Collect the data under controlled conditions."
      },
      {
        "title": "Analysis",
        "body": "Process and interpret the results."
      },
      {
        "title": "Report",
        "body": "Write up the findings and limitations."
      }
    ],
    "section": 0
  },
  "compare": {
    "type": "compare",
    "section": 0,
    "headline": "Two Companies, Two Bets on Parallelism",
    "standfirst": "A GPU is thousands of small cores working at once. NVIDIA and AMD accepted the same premise but built two very different companies around it.\n",
    "left": {
      "title": "NVIDIA",
      "kicker": "Founded 1993 · Santa Clara, CA",
      "body": "Started as a gaming graphics chip maker, then bet the company on CUDA in 2006 — a programming layer that let any scientist run general-purpose math on a GPU. That single bet turned a gaming chipmaker into the backbone of modern AI.\n"
    },
    "right": {
      "title": "AMD",
      "kicker": "Founded 1969 · GPUs via ATI (2006)",
      "body": "A chip company first, GPU maker second. AMD builds both CPUs and GPUs, pushing toward fused chips (APUs) and open standards. Its edge today is cost-efficient chiplet manufacturing rather than a closed software moat.\n"
    },
    "verdict": "NVIDIA optimizes a closed stack for maximum performance; AMD optimizes an open stack for maximum reach. Every architectural choice traces back here.\n"
  },
  "table": {
    "type": "table",
    "section": 0,
    "headline": "SM versus CU, side by side",
    "columns": [
      "Parameter",
      "NVIDIA",
      "AMD"
    ],
    "rows": [
      [
        "Execution model",
        "SIMT — 32-thread warp in lockstep per SM",
        "SIMD — 32/64-wide wavefront per CU"
      ],
      [
        "Flagship (2022-23)",
        "RTX 4090 — 128 SMs, 16,384 CUDA cores",
        "RX 7900 XTX — 96 CUs, 6,144 stream processors"
      ],
      [
        "Ray tracing",
        "3rd-gen RT Cores for BVH traversal",
        "Ray Accelerators inside each CU"
      ],
      [
        "AI upscaling",
        "Tensor Cores + DLSS (proprietary, neural)",
        "FSR (open-source, algorithmic)"
      ],
      [
        "Manufacturing",
        "Monolithic — best performance, costly yields",
        "Chiplets — small cheap dies stitched together"
      ]
    ]
  },
  "stats": {
    "type": "stats",
    "section": 0,
    "headline": "The core-count gap",
    "standfirst": "Raw parallel width at the 2022-23 flagship tier.",
    "stats": [
      {
        "value": "16,384",
        "label": "CUDA cores",
        "sub": "RTX 4090 · 128 SMs"
      },
      {
        "value": "6,144",
        "label": "Stream processors",
        "sub": "RX 7900 XTX · 96 CUs"
      },
      {
        "value": "2.7×",
        "label": "Raw core advantage",
        "sub": "Offset by AMD dual-issue FP32"
      }
    ]
  },
  "bullets": {
    "type": "bullets",
    "section": 0,
    "headline": "Why CUDA still wins",
    "standfirst": "The software moat is deeper than the silicon gap.",
    "bullets": [
      "CUDA has a fifteen-year head start and is the default target for PyTorch and TensorFlow.",
      "ROCm was historically unstable, but PyTorch 2.0 integration made AMD viable for ML.",
      "Framework support, not raw FLOPs, decides what researchers actually buy.",
      "AMD competes on price-per-FLOP where the software stack is not the bottleneck."
    ]
  },
  "timeline": {
    "type": "timeline",
    "section": 0,
    "headline": "Fifteen years of lock-in",
    "events": [
      {
        "when": "2006",
        "what": "CUDA released; general-purpose GPU compute begins"
      },
      {
        "when": "2016",
        "what": "Deep learning boom makes CUDA the de facto standard"
      },
      {
        "when": "2016",
        "what": "AMD launches ROCm as an open alternative"
      },
      {
        "when": "2023",
        "what": "PyTorch 2.0 ships usable ROCm support"
      }
    ]
  },
  "quote": {
    "type": "quote",
    "section": 0,
    "quote": "The future of graphics and AI will be shaped by whoever wins the balance between raw silicon physics and the software that controls it.\n",
    "attribution": "Report conclusion"
  },
  "callout": {
    "type": "callout",
    "section": 0,
    "headline": "Where this lands",
    "label": "Bottom line",
    "body": "NVIDIA's closed performance stack dominates AI and graphics today; AMD's open accessibility and chiplet economics define the competitive battleground of the next generation of parallel compute.\n"
  },
  "references": {
    "type": "references",
    "section": 0,
    "headline": "References",
    "items": [
      "NVIDIA Corporation. Ada Lovelace GPU Architecture Whitepaper, 2022.",
      "AMD. RDNA 3 Instruction Set Architecture Reference Guide, 2023.",
      "Jia, Z. et al. Dissecting the NVIDIA Ampere GPU Architecture, 2021."
    ]
  },
  "cards": {
    "type": "cards",
    "headline": "Modern Ray Tracing Systems: Core Architectural Components",
    "cards": [
      {
        "title": "Acceleration Structures",
        "body": "Optimized data structures that organize scene geometry to enable fast ray-intersection tests. These include BVHs (Bounding Volume Hierarchies) and LBVHs (Linear Bounding Volume Hierarchies), which dramatically reduce the number of intersection candidates per ray.",
        "kicker": "Geometry Organization"
      },
      {
        "title": "Ray Tracing Cores",
        "body": "Specialized hardware units designed to accelerate ray-scene intersections. Found in modern GPUs, these cores process rays in parallel and handle complex shading operations, enabling real-time performance for interactive applications.",
        "kicker": "Hardware Acceleration"
      },
      {
        "title": "Shader Execution Units",
        "body": "Compute units that execute shading programs for each ray hit. These are capable of processing lighting, reflections, and refractions with high fidelity, contributing to the photorealistic output that defines ray tracing.",
        "kicker": "Lighting Calculation"
      },
      {
        "title": "Memory Hierarchy",
        "body": "High-speed memory systems including L1/L2 caches and global memory optimized for fast access patterns. Efficient memory management is critical in ray tracing, as it affects both the traversal of acceleration structures and the retrieval of material properties.",
        "kicker": "Performance Optimization"
      }
    ],
    "section": 0,
    "standfirst": "Key components driving modern real-time ray tracing systems.",
    "notes": "These components work in concert to deliver real-time ray tracing. Each plays a distinct role in optimizing performance while maintaining visual fidelity.",
    "cites": [
      {
        "url": "https://developer.nvidia.com/rtx",
        "title": "NVIDIA RTX Technology"
      },
      {
        "url": "https://www.khronos.org/vulkan/",
        "title": "Vulkan Ray Tracing Specification"
      }
    ]
  }
};

export async function specimenDeck() {
  const schema = await deckSchema();
  const all = schema.definitions.slide.properties.type.enum;

  const byType = new Map();
  for (const t of all) {
    if (SPECIMEN_GAPS[t]) byType.set(t, { type: t, ...SPECIMEN_GAPS[t] });
  }
  for (const [t, slide] of Object.entries(DEMO_SPECIMENS)) {
    if (!byType.has(t)) byType.set(t, slide);
  }

  const slides = [];
  for (const t of all) {
    if (byType.has(t)) {
      slides.push(byType.get(t));
    } else {
      slides.push({ type: t, headline: t.replace(/-/g, " ") });
    }
  }

  return {
    title: "",
    theme: "warm-humanist",
    sections: ["Specimens"],
    slides,
  };
}

export async function specimenIndex() {
  const deck = await specimenDeck();
  const index = {};
  deck.slides.forEach((s, i) => { index[s.type] = i; });
  return index;
}

export function wrapSlide(slide, { theme, headline = "Preview" } = {}) {
  return {
    title: "Single slide preview",
    ...(theme ? { theme } : {}),
    sections: ["Preview"],
    slides: [{ type: slide.type, ...slide, headline: headline ?? slide.headline }],
  };
}

export { ROOT };
