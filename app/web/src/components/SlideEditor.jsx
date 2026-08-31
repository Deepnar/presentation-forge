import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { Button, Panel, Spinner } from "./ui.jsx";

/**
 * The precision layer: edit one slide's content straight into deck.yaml.
 *
 * Deliberately no model anywhere in this path — clicking a headline and typing
 * must not wake an LLM. Fields are rendered from a per-type descriptor map
 * shaped after deck.schema.json, so the form can never offer a field the
 * schema does not know. Every keystroke re-validates the draft deck through
 * POST /api/validate so schema errors surface while typing, before any save is
 * allowed. A title slide edits deck.title/subtitle because that is what its
 * layout actually draws.
 */

const inputCls =
  "w-full rounded-lg border border-line bg-sunken px-3 py-2 text-sm text-fg outline-none transition placeholder:text-fg-faint/60 hover:border-line-strong focus:border-accent";

/** Empty optional values are dropped so clearing a field really removes it. */
function clean(v) {
  if (Array.isArray(v)) {
    const out = v.map(clean).filter((x) => x !== "" && x != null && !(Array.isArray(x) && !x.length));
    return out;
  }
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      const c = clean(val);
      if (c !== "" && c != null && !(Array.isArray(c) && !c.length)) out[k] = c;
    }
    return out;
  }
  return v;
}

/** Editable fields per slide type; maxLengths mirror deck.schema.json. */
const TYPE_FIELDS = {
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

export default function SlideEditor({ deck, index, members, onSave, onClose }) {
  const slide = deck.slides[index];
  const fields = TYPE_FIELDS[slide?.type] ?? [];
  const [draft, setDraft] = useState(() => structuredClone(deck));
  const [valid, setValid] = useState(true);
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const timer = useRef(null);

  const slideDraft = draft.slides[index];
  const isTitle = slide.type === "title";
  const memberNames = useMemo(() => (members ?? []).map((m) => m.name).filter(Boolean), [members]);

  useEffect(() => {
    setValidating(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const r = await api.validateDeck(clean(draft));
        setValid(r.valid);
        setErrors(r.errors ?? []);
      } catch (err) {
        setValid(false);
        setErrors([err.message]);
      } finally {
        setValidating(false);
      }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [draft]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  function patchSlide(patch) {
    setDraft((d) => {
      const out = structuredClone(d);
      out.slides[index] = { ...out.slides[index], ...patch };
      return out;
    });
  }
  function patchDeck(patch) {
    setDraft((d) => ({ ...d, ...patch }));
  }
  function save() {
    setSaving(true);
    // Cleaned so cleared optionals truly vanish; required fields then fail
    // validation and block the save with a visible reason.
    onSave(clean(draft));
  }

  const title = slide.headline ?? slide.quote ?? slide.title ?? "edit slide";

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-sunken/95 p-6 backdrop-blur-sm">
      <Panel className="flex max-h-full w-full max-w-2xl flex-col">
        <header className="flex items-center gap-3 border-b border-line px-5 py-3">
          <span className="font-mono text-sm tabular-nums text-fg">{String(index + 1).padStart(2, "0")}</span>
          <span className="rounded bg-raised px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
            {slide.type}
          </span>
          <span className="truncate text-sm text-fg-faint">{isTitle ? "Deck title" : title}</span>
          <button
            onClick={onClose}
            className="ml-auto rounded-lg px-2 py-1 text-fg-muted transition hover:bg-hover hover:text-fg"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            {isTitle && (
              <>
                <Field label="Deck title" maxLength={90}>
                  <input className={inputCls} value={draft.title ?? ""} maxLength={90}
                    onChange={(e) => patchDeck({ title: e.target.value })} />
                </Field>
                <Field label="Deck subtitle" maxLength={140} hint="optional">
                  <input className={inputCls} value={draft.subtitle ?? ""} maxLength={140}
                    onChange={(e) => patchDeck({ subtitle: e.target.value })} />
                </Field>
              </>
            )}

            {fields.map((f) => (
              <FieldEditor key={f.key} field={f} value={slideDraft[f.key]}
                onChange={(v) => patchSlide({ [f.key]: v })} />
            ))}

            {slide.type === "freeform" && (
              <div className="rounded-card border border-amber/30 bg-amber/5 px-3 py-2.5 text-[11.5px] leading-relaxed text-amber">
                <span className="font-semibold">Rasterises.</span> This slide becomes an image — a typo or a
                wrong word can't be fixed in PowerPoint afterwards. Text must be real HTML, and scripts or
                network requests won't run.
              </div>
            )}

            <div className="border-t border-line pt-4">
              <Field label="Presenter" hint="Who presents this slide — free text. Leave empty for the deck's presenting member.">
                <input className={inputCls} list="forge-presenter-options" value={slideDraft.presenter ?? ""}
                  placeholder="auto" onChange={(e) => patchSlide({ presenter: e.target.value })} />
                <datalist id="forge-presenter-options">
                  {memberNames.map((n) => <option key={n} value={n} />)}
                </datalist>
              </Field>
            </div>

            <Field label="Speaker notes" hint="Never rendered on the slide">
              <textarea className={`${inputCls} resize-y`} rows={3} value={slideDraft.notes ?? ""}
                onChange={(e) => patchSlide({ notes: e.target.value })} />
            </Field>

            {(validating || !valid) && (
              <div className={`rounded-card border px-3 py-2 text-xs leading-relaxed ${
                validating ? "border-line text-fg-faint" : "border-amber/30 bg-amber/5 text-amber"
              }`}>
                {validating ? "Validating…" : (
                  <ul className="space-y-1">
                    {errors.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}
                    {errors.length > 6 && <li>…and {errors.length - 6} more</li>}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!valid || validating || saving}>
            {saving && <Spinner />}
            {saving ? "Saving" : "Save & render"}
          </Button>
        </footer>
      </Panel>
    </div>
  );
}

function Field({ label, hint, maxLength, children }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11px] font-medium text-fg-faint">{label}</span>
        {maxLength && <span className="text-[10px] tabular-nums text-fg-faint/60">≤ {maxLength}</span>}
      </div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-fg-faint">{hint}</div>}
    </label>
  );
}

function FieldEditor({ field, value, onChange }) {
  switch (field.kind) {
    case "text":
      return (
        <Field label={field.label} maxLength={field.maxLength}>
          <input className={inputCls} value={value ?? ""} maxLength={field.maxLength}
            onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case "textarea":
      return (
        <Field label={field.label} maxLength={field.maxLength}>
          <textarea className={`${inputCls} resize-y`} rows={3} value={value ?? ""} maxLength={field.maxLength}
            onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case "code":
      return (
        <Field label={field.label} maxLength={field.maxLength} hint="Full-bleed 16:9 (1280×720). Inline CSS only; scripts and network are blocked by the renderer's sandbox. Leave the top-right and bottom ~50px clear for the crest and footer.">
          <textarea className={`${inputCls} resize-y font-mono text-[12px] leading-relaxed`} rows={14}
            value={value ?? ""} maxLength={field.maxLength}
            onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case "select":
      return (
        <Field label={field.label}>
          <select
            className={inputCls}
            value={value ?? (field.options ?? [])[0] ?? ""}
            onChange={(e) => onChange(e.target.value)}
          >
            {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
      );
    case "nums":
      // A numbers field edits as comma/space-separated text; a `single` variant
      // maps to one number, otherwise the result is an array.
      return (
        <Field label={field.label}>
          <input className={inputCls} placeholder={field.placeholder}
            value={field.single ? (value ?? "") : (value ?? []).join(", ")}
            onChange={(e) => {
              const raw = e.target.value;
              if (field.single) {
                onChange(raw === "" ? undefined : Number(raw));
              } else {
                const nums = raw.split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n));
                onChange(nums);
              }
            }} />
        </Field>
      );
    case "list":
      return <ListEditor field={field} value={value ?? []} onChange={onChange} />;
    case "items":
      return <ItemListEditor field={field} value={value ?? []} onChange={onChange} />;
    case "nested":
      return <NestedListEditor field={field} value={value ?? []} onChange={onChange} />;
    case "side":
      return <SideEditor field={field} value={value ?? {}} onChange={onChange} />;
    case "mv":
      return <MetricValueEditor field={field} value={value ?? {}} onChange={onChange} />;
    case "ba":
      return <PairEditor field={field} value={value ?? {}} onChange={onChange} fields={[
        { key: "title", maxLength: 40, placeholder: "Title" },
        { key: "body", kind: "textarea", maxLength: 200, placeholder: "Body" },
      ]} />;
    case "ct":
      return <PairEditor field={field} value={value ?? {}} onChange={onChange} fields={[
        { key: "title", maxLength: 40, placeholder: "Title" },
        { key: "body", kind: "textarea", maxLength: 120, placeholder: "Body" },
      ]} />;
    case "t":
      return <PairEditor field={field} value={value ?? {}} onChange={onChange} fields={[
        { key: "title", maxLength: 30, placeholder: "Title" },
      ]} />;
    case "l":
      return <PairEditor field={field} value={value ?? {}} onChange={onChange} fields={[
        { key: "label", maxLength: 30, placeholder: "Label" },
      ]} />;
    case "panelled":
      return <PairEditor field={field} value={value ?? {}} onChange={onChange} fields={[
        { key: "image", maxLength: 200, placeholder: "Image path" },
        { key: "title", maxLength: 40, placeholder: "Title" },
        { key: "body", kind: "textarea", maxLength: 120, placeholder: "Body" },
      ]} />;
    case "axes":
      return <AxesEditor field={field} value={value ?? {}} onChange={onChange} />;
    case "chart":
      return <ChartEditor field={field} value={value ?? {}} onChange={onChange} />;
    case "rows":
      return <RowsEditor field={field} value={value ?? { columns: [], rows: [] }} onChange={onChange} />;
    default:
      return null;
  }
}

function AddButton({ label, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="rounded-lg border border-dashed border-line px-2.5 py-1.5 text-[11px] text-fg-muted transition hover:border-line-strong hover:text-fg disabled:pointer-events-none disabled:opacity-40">
      + {label}
    </button>
  );
}

function RemoveButton({ onClick }) {
  return (
    <button onClick={onClick} title="Remove"
      className="grid h-7 w-7 shrink-0 place-items-center self-end rounded-md text-fg-faint transition hover:bg-hover hover:text-amber">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  );
}

function ListEditor({ field, value, onChange }) {
  return (
    <Field label={field.label}>
      <div className="space-y-1.5">
        {value.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input className={inputCls} value={item ?? ""} maxLength={field.maxLength}
              onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))} />
            <RemoveButton onClick={() => onChange(value.filter((_, j) => j !== i))} />
          </div>
        ))}
        <AddButton label={`Add ${(field.item ?? "item").toLowerCase()}`}
          onClick={() => onChange([...value, ""])}
          disabled={field.maxItems != null && value.length >= field.maxItems} />
      </div>
    </Field>
  );
}

function ItemListEditor({ field, value, onChange }) {
  return (
    <Field label={field.label}>
      <div className="space-y-2">
        {value.map((item, i) => (
          <div key={i} className="rounded-card border border-line bg-panel p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-fg-faint">
                {field.itemLabel} {i + 1}
              </span>
              <RemoveButton onClick={() => onChange(value.filter((_, j) => j !== i))} />
            </div>
            <div className="space-y-1.5">
              {field.fields.map((f) => itemField(f, item, (v) =>
                onChange(value.map((x, j) => (j === i ? { ...x, [f.key]: v } : x)))))}
            </div>
          </div>
        ))}
        <AddButton label={`Add ${(field.itemLabel ?? "item").toLowerCase()}`}
          onClick={() => onChange([...value, {}])}
          disabled={field.maxItems != null && value.length >= field.maxItems} />
      </div>
    </Field>
  );
}

/** One input inside an items row, by field kind. */
function itemField(f, item, onPatch) {
  switch (f.kind) {
    case "textarea":
      return (
        <textarea key={f.key} className={`${inputCls} resize-y`} rows={2} maxLength={f.maxLength}
          placeholder={f.placeholder} value={item[f.key] ?? ""}
          onChange={(e) => onPatch(e.target.value)} />
      );
    case "bool":
      return (
        <label key={f.key} className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={item[f.key] !== false}
            onChange={(e) => onPatch(e.target.checked)} />
          {f.label ?? "Checked"}
        </label>
      );
    case "select":
      return (
        <select key={f.key} className={inputCls} value={item[f.key] ?? (f.options ?? [])[0]}
          onChange={(e) => onPatch(e.target.value)}>
          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case "nums":
      return (
        <input key={f.key} className={inputCls} placeholder={f.placeholder}
          value={f.single ? (item[f.key] ?? "") : (item[f.key] ?? []).join(", ")}
          onChange={(e) => {
            const raw = e.target.value;
            if (f.single) onPatch(raw === "" ? undefined : Number(raw));
            else {
              const nums = raw.split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n));
              onPatch(nums);
            }
          }} />
      );
    case "list":
      return (
        <div key={f.key}>
          <ListEditor field={{ label: f.itemLabel ?? "Items", ...f }} value={item[f.key] ?? []}
            onChange={(v) => onPatch(v)} />
        </div>
      );
    case "nested":
      return (
        <div key={f.key}>
          <NestedListEditor field={f} value={item[f.key] ?? []} onChange={(v) => onPatch(v)} />
        </div>
      );
    default:
      return (
        <input key={f.key} className={inputCls} maxLength={f.maxLength} placeholder={f.placeholder}
          value={item[f.key] ?? ""}
          onChange={(e) => onPatch(e.target.value)} />
      );
  }
}

/** A recursive list of {label, children} items — roadmap phases, hierarchy nodes. */
function NestedListEditor({ field, value, onChange }) {
  return (
    <Field label={field.itemLabel ?? "Items"}>
      <div className="space-y-1.5">
        {value.map((item, i) => (
          <div key={i} className="rounded border border-line bg-sunken p-2">
            <div className="flex items-center gap-1.5">
              <input className={inputCls} value={item.label ?? ""} maxLength={30}
                placeholder="Label"
                onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <RemoveButton onClick={() => onChange(value.filter((_, j) => j !== i))} />
            </div>
            {field.fields?.some((f) => f.kind === "textarea") && (
              <textarea className={`${inputCls} mt-1.5 resize-y`} rows={2}
                value={item.body ?? ""} maxLength={field.fields.find((f) => f.kind === "textarea")?.maxLength ?? 120}
                placeholder="Body"
                onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} />
            )}
            {field.fields?.some((f) => f.kind === "nested") && (
              <div className="mt-1.5">
                <NestedListEditor
                  field={field.fields.find((f) => f.kind === "nested")}
                  value={item.children ?? []}
                  onChange={(v) => onChange(value.map((x, j) => (j === i ? { ...x, children: v } : x)))} />
              </div>
            )}
          </div>
        ))}
        <AddButton label={`Add ${(field.itemLabel ?? "item").toLowerCase()}`}
          onClick={() => onChange([...value, {}])}
          disabled={field.maxItems != null && value.length >= field.maxItems} />
      </div>
    </Field>
  );
}

function MetricValueEditor({ field, value, onChange }) {
  const patch = (p) => onChange({ ...value, ...p });
  return (
    <Field label={field.label}>
      <div className="space-y-1.5 rounded-card border border-line bg-panel p-2.5">
        <input className={inputCls} placeholder="Value" maxLength={12} value={value.value ?? ""}
          onChange={(e) => patch({ value: e.target.value })} />
        <input className={inputCls} placeholder="Label" maxLength={30} value={value.label ?? ""}
          onChange={(e) => patch({ label: e.target.value })} />
      </div>
    </Field>
  );
}

function PairEditor({ field, value, onChange, fields }) {
  const patch = (p) => onChange({ ...value, ...p });
  return (
    <Field label={field.label}>
      <div className="space-y-1.5 rounded-card border border-line bg-panel p-2.5">
        {fields.map((f) => f.kind === "textarea" ? (
          <textarea key={f.key} className={`${inputCls} resize-y`} rows={2} maxLength={f.maxLength}
            placeholder={f.placeholder} value={value[f.key] ?? ""}
            onChange={(e) => patch({ [f.key]: e.target.value })} />
        ) : (
          <input key={f.key} className={inputCls} maxLength={f.maxLength} placeholder={f.placeholder}
            value={value[f.key] ?? ""}
            onChange={(e) => patch({ [f.key]: e.target.value })} />
        ))}
      </div>
    </Field>
  );
}

function AxesEditor({ field, value, onChange }) {
  const axis = (key, label) => {
    const a = value[key] ?? {};
    const patch = (p) => onChange({ ...value, [key]: { ...a, ...p } });
    return (
      <div className="rounded border border-line bg-sunken p-2">
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-fg-faint">{label}</div>
        <div className="space-y-1.5">
          <input className={inputCls} placeholder="Axis label" maxLength={20} value={a.label ?? ""}
            onChange={(e) => patch({ label: e.target.value })} />
          <div className="grid grid-cols-2 gap-1.5">
            <input className={inputCls} placeholder="Low" maxLength={16} value={a.low ?? ""}
              onChange={(e) => patch({ low: e.target.value })} />
            <input className={inputCls} placeholder="High" maxLength={16} value={a.high ?? ""}
              onChange={(e) => patch({ high: e.target.value })} />
          </div>
        </div>
      </div>
    );
  };
  return (
    <Field label={field.label}>
      <div className="space-y-2">
        {axis("x", "X axis")}
        {axis("y", "Y axis")}
      </div>
    </Field>
  );
}

/**
 * The chart's real data — kind, categories, series names and the values per
 * series. This was the one deliberate gap in the inline editor ("ask the chat
 * panel"); the numbers ARE the geometry, so editing them here re-renders the
 * chart, and grounding checks each value against the research.
 */
function ChartEditor({ field, value, onChange }) {
  const patch = (p) => onChange({ ...value, ...p });
  const c = value ?? {};
  const series = c.series ?? [];
  const kinds = ["bar", "hbar", "line", "pie", "doughnut", "area", "scatter", "radar", "stacked-bar"];
  return (
    <Field label={field.label} hint="The values are the data the chart draws — every one is checked against the research. One value per category, in the same order.">
      <div className="space-y-2.5 rounded-card border border-line bg-panel p-2.5">
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-fg-faint">Kind</div>
          <select className={inputCls} value={kinds.includes(c.kind) ? c.kind : "bar"} onChange={(e) => patch({ kind: e.target.value })}>
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-fg-faint">Categories</div>
          <ListEditor field={{ label: "Categories", item: "Category", maxLength: 40, maxItems: 12 }}
            value={c.categories ?? []} onChange={(v) => patch({ categories: v })} />
        </div>
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-fg-faint">Unit (optional)</div>
          <input className={inputCls} value={c.unit ?? ""} maxLength={16} placeholder="e.g. GW, %, ₹"
            onChange={(e) => patch({ unit: e.target.value })} />
        </div>
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-fg-faint">Series</div>
          <div className="space-y-2">
            {series.map((s, i) => (
              <div key={i} className="rounded border border-line bg-sunken p-2">
                <div className="flex items-center gap-1.5">
                  <input className={inputCls} placeholder="Series name" value={s.name ?? ""} maxLength={40}
                    onChange={(e) => patch({ series: series.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                  <RemoveButton onClick={() => patch({ series: series.filter((_, j) => j !== i) })} />
                </div>
                <div className="mt-1.5">
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-fg-faint">Values</div>
                  <input className={inputCls} placeholder="Numbers, comma or space separated — one per category"
                    value={(s.values ?? []).join(", ")}
                    onChange={(e) => {
                      const nums = e.target.value.split(/[\s,]+/).filter(Boolean).map(Number).filter((x) => !Number.isNaN(x));
                      patch({ series: series.map((x, j) => (j === i ? { ...x, values: nums } : x)) });
                    }} />
                </div>
              </div>
            ))}
            <AddButton label="Add series" disabled={series.length >= 4}
              onClick={() => patch({ series: [...series, { name: "", values: [] }] })} />
          </div>
        </div>
      </div>
    </Field>
  );
}

function SideEditor({ field, value, onChange }) {
  const patch = (p) => onChange({ ...value, ...p });
  const points = value.points ?? [];
  return (
    <Field label={field.label}>
      <div className="space-y-1.5 rounded-card border border-line bg-panel p-2.5">
        <input className={inputCls} placeholder="Title" maxLength={40} value={value.title ?? ""}
          onChange={(e) => patch({ title: e.target.value })} />
        <input className={inputCls} placeholder="Kicker (optional)" maxLength={60} value={value.kicker ?? ""}
          onChange={(e) => patch({ kicker: e.target.value })} />
        <textarea className={`${inputCls} resize-y`} rows={2} placeholder="Body" maxLength={320} value={value.body ?? ""}
          onChange={(e) => patch({ body: e.target.value })} />
        {points.map((p, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input className={inputCls} placeholder={`Point ${i + 1}`} maxLength={120} value={p ?? ""}
              onChange={(e) => patch({ points: points.map((x, j) => (j === i ? e.target.value : x)) })} />
            <RemoveButton onClick={() => patch({ points: points.filter((_, j) => j !== i) })} />
          </div>
        ))}
        <AddButton label="Add point" onClick={() => patch({ points: [...points, ""] })} disabled={points.length >= 4} />
      </div>
    </Field>
  );
}

function RowsEditor({ field, value, onChange }) {
  const cols = value.columns ?? [];
  const rows = value.rows ?? [];
  const patch = (p) => onChange({ ...value, ...p });
  // data-table rows are { text: string | string[] } objects; plain table rows
  // are arrays of strings.
  const textRows = field.textRows;
  const cellAt = (row, c) => {
    if (textRows) return Array.isArray(row.text) ? row.text[c] : c === 0 ? row.text : "";
    return row[c];
  };
  const setCell = (row, c, v) => {
    if (textRows) {
      const cells = Array.isArray(row.text) ? [...row.text] : [row.text ?? ""];
      while (cells.length <= c) cells.push("");
      cells[c] = v;
      return { ...row, text: cells };
    }
    const out = [...row];
    out[c] = v;
    return out;
  };
  return (
    <Field label={field.label}>
      <div className="space-y-1.5 rounded-card border border-line bg-panel p-2.5">
        {rows.map((row, r) => (
          <div key={r} className="flex items-center gap-1.5">
            {cols.map((col, c) => (
              <input key={c} className={inputCls} maxLength={field.colMaxLength}
                value={cellAt(row, c) ?? ""}
                onChange={(e) => patch({ rows: rows.map((x, j) => (j === r ? setCell(x, c, e.target.value) : x)) })} />
            ))}
            <RemoveButton onClick={() => patch({ rows: rows.filter((_, j) => j !== r) })} />
          </div>
        ))}
        <AddButton label="Add row"
          onClick={() => patch({
            rows: [...rows, textRows ? { text: cols.map(() => "") } : cols.map(() => "")],
          })}
          disabled={field.maxRows != null && rows.length >= field.maxRows} />
      </div>
    </Field>
  );
}
