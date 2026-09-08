export const TYPE_FIELDS = {
  section: [{ key: "headline", label: "Headline", kind: "text", maxLength: 80 }],
  agenda: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "items", label: "Agenda items", kind: "items", maxItems: 8, itemLabel: "Item",
      fields: [
        { key: "title", maxLength: 40, placeholder: "Title" },
        { key: "desc", kind: "textarea", maxLength: 120, placeholder: "Description (optional)" },
      ],
    },
  ],
  "big-number": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "value", label: "Value", kind: "text", maxLength: 12 },
    { key: "label", label: "Label", kind: "textarea", maxLength: 60 },
    { key: "body", label: "Body", kind: "textarea", maxLength: 200 },
    { key: "sub", label: "Sub", kind: "textarea", maxLength: 60 },
  ],
  "pros-cons": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "pros", label: "Pros", kind: "list", item: "Pro", maxLength: 120, maxItems: 8 },
    { key: "cons", label: "Cons", kind: "list", item: "Con", maxLength: 120, maxItems: 8 },
  ],
  milestone: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "milestones", label: "Milestones", kind: "items", maxItems: 4, itemLabel: "Milestone",
      fields: [
        { key: "when", maxLength: 16, placeholder: "When" },
        { key: "title", maxLength: 40, placeholder: "Title" },
        { key: "body", kind: "textarea", maxLength: 120, placeholder: "Body (optional)" },
      ],
    },
  ],
  emphasis: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "label", label: "Label", kind: "text", maxLength: 24 },
    { key: "body", label: "Body", kind: "textarea", maxLength: 200 },
  ],
  definition: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "term", label: "Term", kind: "text", maxLength: 40 },
    { key: "definition", label: "Definition", kind: "textarea", maxLength: 200 },
    { key: "example", label: "Example", kind: "textarea", maxLength: 120 },
  ],
  bullets: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "bullets", label: "Bullets", kind: "list", item: "Bullet", maxLength: 160, maxItems: 6 },
  ],
  cards: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "standfirst", label: "Standfirst", kind: "textarea", maxLength: 220 },
    {
      key: "cards", label: "Cards", kind: "items", maxItems: 4, itemLabel: "Card",
      fields: [
        { key: "title", maxLength: 40, placeholder: "Title" },
        { key: "kicker", maxLength: 60, placeholder: "Kicker (optional)" },
        { key: "body", kind: "textarea", maxLength: 320, placeholder: "Body" },
      ],
    },
  ],
  compare: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "standfirst", label: "Standfirst", kind: "textarea", maxLength: 220 },
    { key: "left", label: "Left column", kind: "side" },
    { key: "right", label: "Right column", kind: "side" },
    { key: "verdict", label: "Verdict", kind: "textarea", maxLength: 260 },
  ],
  stats: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "standfirst", label: "Standfirst", kind: "textarea", maxLength: 220 },
    {
      key: "stats", label: "Stats", kind: "items", maxItems: 4, itemLabel: "Stat",
      fields: [
        { key: "value", maxLength: 12, placeholder: "Value" },
        { key: "label", maxLength: 48, placeholder: "Label" },
      ],
    },
  ],
  quote: [
    { key: "quote", label: "Quote", kind: "textarea", maxLength: 280 },
    { key: "attribution", label: "Attribution", kind: "text", maxLength: 80 },
  ],
  callout: [
    { key: "label", label: "Label", kind: "text", maxLength: 24 },
    { key: "body", label: "Body", kind: "textarea", maxLength: 300 },
  ],
  table: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "columns", label: "Columns", kind: "list", item: "Column", maxLength: 28, maxItems: 5 },
    { key: "rows", label: "Rows", kind: "rows", colMaxLength: 120, maxRows: 8 },
  ],
  flow: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "steps", label: "Steps", kind: "items", maxItems: 6, itemLabel: "Step",
      fields: [
        { key: "title", maxLength: 32, placeholder: "Title" },
        { key: "body", kind: "textarea", maxLength: 120, placeholder: "Body" },
      ],
    },
  ],
  image: [{ key: "caption", label: "Caption", kind: "textarea", maxLength: 160 }],
  "image-text": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "body", label: "Body", kind: "list", item: "Paragraph", maxLength: 180, maxItems: 4 },
    { key: "caption", label: "Caption", kind: "textarea", maxLength: 120 },
  ],
  timeline: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "events", label: "Events", kind: "items", maxItems: 6, itemLabel: "Event",
      fields: [
        { key: "when", maxLength: 16, placeholder: "When" },
        { key: "what", kind: "textarea", maxLength: 120, placeholder: "What" },
      ],
    },
  ],
  references: [
    { key: "items", label: "References", kind: "list", item: "Reference", maxLength: 220 },
  ],
  chart: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "aside", label: "Aside", kind: "list", item: "Aside", maxLength: 120, maxItems: 3 },
    { key: "chart", label: "Chart data", kind: "chart" },
  ],
  title: [],
  freeform: [
    { key: "html", label: "HTML", kind: "code", maxLength: 24000 },
  ],
  chapter: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "standfirst", label: "Standfirst", kind: "textarea", maxLength: 220 },
  ],
  closing: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "body", label: "Body", kind: "textarea", maxLength: 300 },
    { key: "cta", label: "Call to action", kind: "text", maxLength: 60 },
  ],
  "numbered-list": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "items", label: "Items", kind: "list", item: "Item", maxLength: 160, maxItems: 8 },
  ],
  checklist: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "items", label: "Items", kind: "items", maxItems: 8, itemLabel: "Item",
      fields: [
        { key: "text", kind: "textarea", maxLength: 160, placeholder: "Text" },
        { key: "checked", kind: "bool", label: "Checked" },
      ],
    },
  ],
  "feature-grid": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "items", label: "Features", kind: "items", maxItems: 6, itemLabel: "Feature",
      fields: [
        { key: "icon", maxLength: 4, placeholder: "Icon (emoji)" },
        { key: "title", maxLength: 30, placeholder: "Title" },
        { key: "body", kind: "textarea", maxLength: 120, placeholder: "Body" },
      ],
    },
  ],
  "grid-items": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "items", label: "Pairs", kind: "items", maxItems: 12, itemLabel: "Pair",
      fields: [
        { key: "label", maxLength: 20, placeholder: "Label" },
        { key: "value", maxLength: 60, placeholder: "Value" },
      ],
    },
  ],
  "icon-list": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "items", label: "Items", kind: "items", maxItems: 6, itemLabel: "Item",
      fields: [
        { key: "icon", maxLength: 4, placeholder: "Icon (emoji)" },
        { key: "text", kind: "textarea", maxLength: 160, placeholder: "Text" },
      ],
    },
  ],
  "stacked-list": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "items", label: "Items", kind: "items", maxItems: 5, itemLabel: "Item",
      fields: [
        { key: "tag", maxLength: 16, placeholder: "Tag" },
        { key: "title", maxLength: 30, placeholder: "Title" },
        { key: "body", kind: "textarea", maxLength: 120, placeholder: "Body" },
      ],
    },
  ],
  "kpi-dashboard": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "kpis", label: "KPIs", kind: "items", maxItems: 6, itemLabel: "KPI",
      fields: [
        { key: "label", maxLength: 20, placeholder: "Label" },
        { key: "value", maxLength: 12, placeholder: "Value" },
        { key: "trend", kind: "select", options: ["up", "down", "flat"], label: "Trend" },
        { key: "change", maxLength: 10, placeholder: "Change (e.g. +3%)" },
      ],
    },
  ],
  "data-cards": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "cards", label: "Cards", kind: "items", maxItems: 4, itemLabel: "Card",
      fields: [
        { key: "value", maxLength: 16, placeholder: "Value" },
        { key: "label", maxLength: 40, placeholder: "Label" },
        { key: "body", kind: "textarea", maxLength: 200, placeholder: "Body" },
      ],
    },
  ],
  "progress-bars": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "bars", label: "Bars", kind: "items", maxItems: 6, itemLabel: "Bar",
      fields: [
        { key: "label", maxLength: 24, placeholder: "Label" },
        { key: "value", kind: "nums", single: true, placeholder: "Value (0-100)" },
        { key: "target", kind: "nums", single: true, placeholder: "Target (0-100)" },
      ],
    },
  ],
  "ranking-list": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "items", label: "Entries", kind: "items", maxItems: 10, itemLabel: "Entry",
      fields: [
        { key: "rank", kind: "nums", single: true, placeholder: "Rank" },
        { key: "label", maxLength: 40, placeholder: "Label" },
        { key: "detail", maxLength: 60, placeholder: "Detail" },
        { key: "value", maxLength: 12, placeholder: "Value" },
      ],
    },
  ],
  "metric-comparison": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "left", label: "Left metric", kind: "mv" },
    { key: "right", label: "Right metric", kind: "mv" },
    { key: "delta", label: "Delta", kind: "text", maxLength: 12 },
    { key: "body", label: "Body", kind: "textarea", maxLength: 200 },
  ],
  sparklines: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "items", label: "Series", kind: "items", maxItems: 6, itemLabel: "Series",
      fields: [
        { key: "label", maxLength: 20, placeholder: "Label" },
        { key: "value", maxLength: 12, placeholder: "Value" },
        { key: "values", kind: "nums", placeholder: "Comma-separated numbers" },
      ],
    },
  ],
  "before-after": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "before", label: "Before", kind: "ba" },
    { key: "after", label: "After", kind: "ba" },
  ],
  framework: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "concept", label: "Concept", kind: "ct" },
    {
      key: "elements", label: "Elements", kind: "items", maxItems: 6, itemLabel: "Element",
      fields: [
        { key: "title", maxLength: 30, placeholder: "Title" },
        { key: "body", kind: "textarea", maxLength: 100, placeholder: "Body" },
      ],
    },
  ],
  matrix: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "axes", label: "Axes", kind: "axes" },
    {
      key: "quadrants", label: "Quadrants", kind: "items", maxItems: 4, itemLabel: "Quadrant",
      fields: [
        { key: "title", maxLength: 30, placeholder: "Title" },
        { key: "body", kind: "textarea", maxLength: 80, placeholder: "Body" },
      ],
    },
  ],
  scorecard: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "criteria", label: "Criteria", kind: "items", maxItems: 6, itemLabel: "Criterion",
      fields: [
        { key: "label", maxLength: 30, placeholder: "Label" },
        { key: "weight", maxLength: 10, placeholder: "Weight (e.g. 30%)" },
      ],
    },
    {
      key: "options", label: "Options", kind: "items", maxItems: 4, itemLabel: "Option",
      fields: [
        { key: "name", maxLength: 20, placeholder: "Name" },
        { key: "scores", kind: "nums", placeholder: "Scores" },
      ],
    },
  ],
  vs: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "left", label: "Left", kind: "t" },
    { key: "right", label: "Right", kind: "t" },
    { key: "left_body", label: "Left body", kind: "textarea", maxLength: 120 },
    { key: "right_body", label: "Right body", kind: "textarea", maxLength: 120 },
  ],
  "side-by-side": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "left", label: "Left panel", kind: "panelled" },
    { key: "right", label: "Right panel", kind: "panelled" },
  ],
  funnel: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "stages", label: "Stages", kind: "items", maxItems: 6, itemLabel: "Stage",
      fields: [
        { key: "label", maxLength: 24, placeholder: "Label" },
        { key: "value", maxLength: 12, placeholder: "Value" },
        { key: "body", kind: "textarea", maxLength: 80, placeholder: "Body" },
      ],
    },
  ],
  pipeline: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "stages", label: "Stages", kind: "items", maxItems: 6, itemLabel: "Stage",
      fields: [
        { key: "title", maxLength: 24, placeholder: "Title" },
        { key: "body", kind: "textarea", maxLength: 80, placeholder: "Body" },
        { key: "gate", maxLength: 16, placeholder: "Gate" },
      ],
    },
  ],
  dependencies: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "nodes", label: "Nodes", kind: "items", maxItems: 8, itemLabel: "Node",
      fields: [
        { key: "title", maxLength: 24, placeholder: "Title" },
        { key: "body", kind: "textarea", maxLength: 60, placeholder: "Body" },
        { key: "depends_on", kind: "nums", placeholder: "Dependency indices" },
      ],
    },
  ],
  "branching-flow": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "decision", label: "Decision", kind: "text", maxLength: 60 },
    {
      key: "branches", label: "Branches", kind: "items", maxItems: 3, itemLabel: "Branch",
      fields: [
        { key: "label", maxLength: 16, placeholder: "Branch label" },
        { key: "steps", kind: "list", item: "Step title", maxLength: 24, maxItems: 3 },
      ],
    },
  ],
  "layered-architecture": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "layers", label: "Layers", kind: "items", maxItems: 7, itemLabel: "Layer",
      fields: [
        { key: "label", maxLength: 30, placeholder: "Label" },
        { key: "body", kind: "textarea", maxLength: 80, placeholder: "Body" },
        { key: "items", kind: "list", item: "Item", maxLength: 24, maxItems: 4 },
      ],
    },
  ],
  roadmap: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "time_labels", label: "Time labels", kind: "list", item: "Label", maxLength: 16, maxItems: 8 },
    {
      key: "phases", label: "Phases", kind: "items", maxItems: 5, itemLabel: "Phase",
      fields: [
        { key: "label", maxLength: 20, placeholder: "Phase label" },
        {
          key: "items", kind: "nested", itemLabel: "Item",
          fields: [
            { key: "title", maxLength: 30, placeholder: "Title" },
            { key: "body", kind: "textarea", maxLength: 60, placeholder: "Body" },
          ],
        },
      ],
    },
  ],
  journey: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "stages", label: "Stages", kind: "items", maxItems: 8, itemLabel: "Stage",
      fields: [
        { key: "label", maxLength: 20, placeholder: "Label" },
        { key: "sentiment", kind: "select", options: ["", "positive", "neutral", "negative"], label: "Sentiment (optional)" },
        { key: "value", kind: "nums", single: true, placeholder: "Value (optional — the line is real only when every stage has one)" },
        { key: "body", kind: "textarea", maxLength: 80, placeholder: "Body" },
      ],
    },
  ],
  chronology: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "events", label: "Events", kind: "items", maxItems: 10, itemLabel: "Event",
      fields: [
        { key: "year", maxLength: 10, placeholder: "Year" },
        { key: "text", kind: "textarea", maxLength: 160, placeholder: "Text" },
      ],
    },
  ],
  testimonial: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "quote", label: "Quote", kind: "textarea", maxLength: 280 },
    { key: "name", label: "Name", kind: "text", maxLength: 60 },
    { key: "role", label: "Role", kind: "text", maxLength: 60 },
    { key: "image", label: "Image path", kind: "text", maxLength: 200 },
  ],
  "pull-quote": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "quote", label: "Quote", kind: "textarea", maxLength: 180 },
    { key: "attribution", label: "Attribution", kind: "text", maxLength: 60 },
  ],
  epigraph: [
    { key: "quote", label: "Quote", kind: "textarea", maxLength: 220 },
    { key: "attribution", label: "Attribution", kind: "text", maxLength: 60 },
    { key: "source", label: "Source", kind: "text", maxLength: 120 },
  ],
  warning: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "label", label: "Label", kind: "text", maxLength: 24 },
    { key: "body", label: "Body", kind: "textarea", maxLength: 200 },
  ],
  tip: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "label", label: "Label", kind: "text", maxLength: 24 },
    { key: "body", label: "Body", kind: "textarea", maxLength: 200 },
  ],
  takeaway: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "label", label: "Label", kind: "text", maxLength: 24 },
    { key: "body", label: "Body", kind: "textarea", maxLength: 200 },
    { key: "points", label: "Points", kind: "list", item: "Point", maxLength: 120, maxItems: 4 },
  ],
  "image-grid": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "images", label: "Images", kind: "items", maxItems: 6, itemLabel: "Image",
      fields: [
        { key: "src", maxLength: 200, placeholder: "Path" },
        { key: "caption", kind: "textarea", maxLength: 80, placeholder: "Caption" },
      ],
    },
  ],
  "hero-image": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "subtitle", label: "Subtitle", kind: "textarea", maxLength: 120 },
    { key: "image", label: "Image path", kind: "text", maxLength: 200 },
  ],
  "split-screen": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "left", label: "Left image", kind: "text", maxLength: 200 },
    { key: "right", label: "Right image", kind: "text", maxLength: 200 },
    { key: "left_caption", label: "Left caption", kind: "text", maxLength: 80 },
    { key: "right_caption", label: "Right caption", kind: "text", maxLength: 80 },
  ],
  "data-table": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "columns", label: "Columns", kind: "items", maxItems: 6, itemLabel: "Column",
      fields: [
        { key: "label", maxLength: 24, placeholder: "Label" },
        { key: "align", kind: "select", options: ["left", "right", "center"], label: "Align" },
      ],
    },
    { key: "row_labels", label: "Row labels", kind: "list", item: "Label", maxLength: 24, maxItems: 8 },
    {
      key: "rows", label: "Rows", kind: "rows", colMaxLength: 120, maxRows: 8, textRows: true,
    },
  ],
  "decision-matrix": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "criteria", label: "Criteria", kind: "items", maxItems: 6, itemLabel: "Criterion",
      fields: [
        { key: "label", maxLength: 30, placeholder: "Label" },
        { key: "weight", kind: "nums", single: true, placeholder: "Weight" },
      ],
    },
    {
      key: "options", label: "Options", kind: "items", maxItems: 5, itemLabel: "Option",
      fields: [
        { key: "name", maxLength: 20, placeholder: "Name" },
        { key: "scores", kind: "nums", placeholder: "Scores" },
      ],
    },
  ],
  diagram: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "layout", label: "Layout", kind: "select", options: ["vertical", "horizontal", "radial"] },
    {
      key: "nodes", label: "Nodes", kind: "items", maxItems: 10, itemLabel: "Node",
      fields: [
        { key: "id", maxLength: 10, placeholder: "Id" },
        { key: "label", maxLength: 40, placeholder: "Label" },
        { key: "body", kind: "textarea", maxLength: 80, placeholder: "Body" },
      ],
    },
    {
      key: "edges", label: "Edges", kind: "items", maxItems: 15, itemLabel: "Edge",
      fields: [
        { key: "from", maxLength: 10, placeholder: "From id" },
        { key: "to", maxLength: 10, placeholder: "To id" },
        { key: "label", maxLength: 20, placeholder: "Label (optional)" },
      ],
    },
  ],
  pyramid: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "levels", label: "Levels", kind: "items", maxItems: 6, itemLabel: "Level",
      fields: [
        { key: "label", maxLength: 24, placeholder: "Label" },
        { key: "body", kind: "textarea", maxLength: 60, placeholder: "Body" },
      ],
    },
  ],
  venn: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "sets", label: "Sets", kind: "items", maxItems: 4, itemLabel: "Set",
      fields: [
        { key: "label", maxLength: 30, placeholder: "Label" },
        { key: "items", kind: "list", item: "Item", maxLength: 40, maxItems: 6 },
      ],
    },
  ],
  hierarchy: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "root", label: "Root", kind: "l" },
    {
      key: "children", label: "Children", kind: "items", maxItems: 4, itemLabel: "Child",
      fields: [
        { key: "label", maxLength: 30, placeholder: "Label" },
        {
          key: "children", kind: "nested", itemLabel: "Grandchild",
          fields: [
            { key: "label", maxLength: 30, placeholder: "Label" },
            {
              key: "children", kind: "nested", itemLabel: "Great-grandchild",
              fields: [
                { key: "label", maxLength: 30, placeholder: "Label" },
              ],
            },
          ],
        },
      ],
    },
  ],
  glossary: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "entries", label: "Entries", kind: "items", maxItems: 8, itemLabel: "Entry",
      fields: [
        { key: "term", maxLength: 30, placeholder: "Term" },
        { key: "definition", kind: "textarea", maxLength: 120, placeholder: "Definition" },
      ],
    },
  ],
  faq: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "items", label: "Items", kind: "items", maxItems: 6, itemLabel: "Item",
      fields: [
        { key: "question", kind: "textarea", maxLength: 60, placeholder: "Question" },
        { key: "answer", kind: "textarea", maxLength: 200, placeholder: "Answer" },
      ],
    },
  ],
  "team-grid": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "members", label: "Members", kind: "items", maxItems: 8, itemLabel: "Member",
      fields: [
        { key: "name", maxLength: 30, placeholder: "Name" },
        { key: "role", maxLength: 40, placeholder: "Role" },
        { key: "image", maxLength: 200, placeholder: "Image path" },
      ],
    },
  ],
  attribution: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "items", label: "Entries", kind: "items", maxItems: 12, itemLabel: "Entry",
      fields: [
        { key: "name", maxLength: 30, placeholder: "Name" },
        { key: "contribution", kind: "textarea", maxLength: 60, placeholder: "Contribution" },
      ],
    },
  ],
  contact: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "items", label: "Details", kind: "items", maxItems: 6, itemLabel: "Detail",
      fields: [
        { key: "label", maxLength: 16, placeholder: "Label" },
        { key: "value", maxLength: 60, placeholder: "Value" },
      ],
    },
  ],
  equation: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    { key: "formula", label: "Formula", kind: "text", maxLength: 120 },
    { key: "body", label: "Body", kind: "textarea", maxLength: 200 },
    {
      key: "variables", label: "Variables", kind: "items", maxItems: 6, itemLabel: "Variable",
      fields: [
        { key: "symbol", maxLength: 10, placeholder: "Symbol" },
        { key: "meaning", kind: "textarea", maxLength: 60, placeholder: "Meaning" },
      ],
    },
  ],
  bibliography: [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "entries", label: "Entries", kind: "items", maxItems: 12, itemLabel: "Entry",
      fields: [
        { key: "citation", kind: "textarea", maxLength: 220, placeholder: "Citation" },
        { key: "annotation", kind: "textarea", maxLength: 160, placeholder: "Annotation" },
      ],
    },
  ],
  "data-source": [
    { key: "headline", label: "Headline", kind: "text", maxLength: 80 },
    {
      key: "sources", label: "Sources", kind: "items", maxItems: 8, itemLabel: "Source",
      fields: [
        { key: "name", maxLength: 40, placeholder: "Name" },
        { key: "url", maxLength: 200, placeholder: "URL" },
        { key: "description", kind: "textarea", maxLength: 120, placeholder: "Description" },
      ],
    },
  ],
};
