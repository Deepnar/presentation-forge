import { TYPE_FIELDS } from "../components/slideEditorFields.js";

// Minimal valid slide per type, for human-only manual add (no model).
// Derives shape from TYPE_FIELDS so a new type gets a sensible blank for free;
// counts honour schema minima (see test/blank-slides.test.js which validates
// every blank through validateDeck). No coordinates, colours or fonts —
// content only, theme still owns layout.

const IMAGE_PLACEHOLDER = "assets/add-your-image.png";

const ARRAY_MINIMA = {
  "agenda.items": 3,
  "attribution.items": 1,
  "bibliography.entries": 2,
  "branching-flow.branches": 2,
  "bullets.bullets": 4,
  "cards.cards": 2,
  "checklist.items": 4,
  "chronology.events": 2,
  "contact.items": 1,
  "data-cards.cards": 2,
  "data-source.sources": 2,
  "decision-matrix.criteria": 2,
  "decision-matrix.options": 2,
  "dependencies.nodes": 2,
  "diagram.nodes": 2,
  "equation.variables": 1,
  "faq.items": 2,
  "feature-grid.items": 2,
  "flow.steps": 2,
  "framework.elements": 2,
  "funnel.stages": 3,
  "glossary.entries": 2,
  "grid-items.items": 3,
  "icon-list.items": 4,
  "illustrated-points.points": 3,
  "image-grid.images": 2,
  "image-text.body": 1,
  "journey.stages": 3,
  "kpi-dashboard.kpis": 3,
  "layered-architecture.layers": 3,
  "matrix.quadrants": 4,
  "milestone.milestones": 1,
  "numbered-list.items": 4,
  "pipeline.stages": 3,
  "progress-bars.bars": 2,
  "pros-cons.pros": 1,
  "pros-cons.cons": 1,
  "pyramid.levels": 3,
  "ranking-list.items": 3,
  "roadmap.phases": 3,
  "scorecard.criteria": 2,
  "scorecard.options": 2,
  "sparklines.items": 2,
  "stacked-list.items": 4,
  "stats.stats": 2,
  "takeaway.points": 1,
  "team-grid.members": 2,
  "timeline.events": 2,
  "venn.sets": 2,
};

const LIST_POOL = ["First point", "Second point", "Third point", "Fourth point", "Fifth point", "Sixth point"];

function cut(s, max) {
  if (max == null) return s;
  return s.length > max ? s.slice(0, max) : s;
}

function textPlaceholder(key, max) {
  if (key === "headline") return cut("New slide", max);
  if (key === "image" || key === "src") return cut(IMAGE_PLACEHOLDER, max);
  if (key === "value") return cut("42", max);
  if (key === "formula") return cut("E = mc^2", max);
  if (key === "quote") return cut("A short quote to replace.", max);
  if (key === "html") return "<div style=\"padding:40px;font-family:sans-serif\"><h1>New slide</h1><p>Edit me.</p></div>";
  if (/^(left|right)(_|$)/.test(key)) return cut(IMAGE_PLACEHOLDER, max);
  if (key === "left" || key === "right") return cut(IMAGE_PLACEHOLDER, max);
  return cut("Title", max);
}

function textareaPlaceholder(key, max) {
  if (key === "body" || key === "definition" || key === "what") return cut("Details to replace.", max);
  if (key === "quote") return cut("A short quote to replace.", max);
  return cut("Details", max);
}

function subfieldBlank(f, index = 0) {
  switch (f.kind) {
    case "textarea":
      return textareaPlaceholder(f.key ?? "body", f.maxLength);
    case "bool":
      return true;
    case "select": {
      const opts = f.options ?? [];
      return opts.find((o) => o !== "") ?? opts[0] ?? "";
    }
    case "nums":
      return f.single ? 50 : [1, 2, 3];
    case "list":
      return [cut(`Item ${index + 1}`, f.maxLength ?? 40)];
    case "items":
      return [objectForFields(f.fields ?? [{ key: "title", maxLength: 30 }], index)];
    case "nested":
      return [objectForFields(f.fields ?? [{ key: "title", maxLength: 30 }], index)];
    default: {
      if (f.key === "image" || f.key === "src") return cut(IMAGE_PLACEHOLDER, f.maxLength);
      if (f.key === "icon") return cut("●", f.maxLength);
      if (f.key === "when" || f.key === "year") return cut("2026", f.maxLength);
      if (f.key === "id" || f.key === "from" || f.key === "to") return cut(`n${index + 1}`, f.maxLength);
      if (f.key === "rank") return 1;
      if (f.key === "weight") return cut("30%", f.maxLength);
      if (f.key === "change") return cut("+3%", f.maxLength);
      if (f.key === "trend") return "flat";
      if (f.key === "url") return cut("https://example.com", f.maxLength);
      if (f.key === "label" || f.key === "title" || f.key === "name") return cut(`Item ${index + 1}`, f.maxLength);
      return cut(`Item ${index + 1}`, f.maxLength);
    }
  }
}

function objectForFields(fields, index) {
  const obj = {};
  for (const f of fields) {
    if (f.kind === "list") {
      obj[f.key] = [cut("Step one", f.maxLength ?? 24)];
    } else if (f.kind === "items" || f.kind === "nested") {
      const sub = f.fields ?? [{ key: "title", maxLength: 30 }];
      const count = Math.min(f.maxItems ?? 1, 2);
      obj[f.key] = Array.from({ length: Math.max(count, 1) }, (_, j) => objectForFields(sub, j));
      if (f.kind === "nested" && sub.length === 1 && (sub[0].key === "title" || sub[0].key === "label")) {
        // Nested descriptors vary (label vs title); objectForFields already honours the declared key.
      }
    } else {
      obj[f.key] = subfieldBlank(f, index);
    }
  }
  return obj;
}

function itemsBlank(field, type) {
  const min = ARRAY_MINIMA[`${type}.${field.key}`] ?? 2;
  const count = Math.min(min, field.maxItems ?? min);
  return Array.from({ length: count }, (_, i) => objectForFields(field.fields ?? [], i));
}

function listBlank(field, type) {
  const min = ARRAY_MINIMA[`${type}.${field.key}`] ?? 2;
  const count = Math.min(min, field.maxItems ?? min);
  return Array.from({ length: count }, (_, i) => cut(LIST_POOL[i % LIST_POOL.length], field.maxLength));
}

function fieldBlank(f, type) {
  switch (f.kind) {
    case "text":
      return textPlaceholder(f.key, f.maxLength);
    case "textarea":
      return textareaPlaceholder(f.key, f.maxLength);
    case "code":
      return textPlaceholder("html");
    case "select": {
      const opts = f.options ?? [];
      return opts.find((o) => o !== "") ?? opts[0] ?? "";
    }
    case "nums":
      return f.single ? 50 : [1, 2, 3];
    case "list":
      return listBlank(f, type);
    case "items":
      return itemsBlank(f, type);
    case "nested":
      return [objectForFields(field.fields ?? [{ key: "title", maxLength: 30 }], 0)];
    case "side":
      return { title: cut("Left panel", 27), body: cut("Details to replace.", 53) };
    case "mv":
      return { value: cut("42", 12), label: cut("Label", 30) };
    case "ba":
      return { title: cut("Before", 40), body: cut("Details to replace.", 200) };
    case "ct":
      return { title: cut("Concept", 40) };
    case "t":
      return { title: cut("Title", 30) };
    case "l":
      return { label: cut("Label", 30) };
    case "panelled":
      return { image: IMAGE_PLACEHOLDER, title: cut("Panel", 30), body: cut("Details to replace.", 99) };
    case "axes":
      return {
        x: { label: cut("X", 20), low: cut("Low", 16), high: cut("High", 16) },
        y: { label: cut("Y", 20), low: cut("Low", 16), high: cut("High", 16) },
      };
    case "chart":
      return { kind: "bar", categories: ["A", "B"], series: [{ name: "Series", values: [1, 2] }] };
    case "rows": {
      if (type === "data-table") {
        return [{ text: ["1", "2"] }];
      }
      return [["Cell 1", "Cell 2"]];
    }
    default:
      return cut("Title", f.maxLength);
  }
}

export function blankSlideForType(type) {
  if (type === "title") return { type: "title" };
  if (type === "table") {
    return { type, headline: "New slide", columns: ["Column A", "Column B"], rows: [["Cell 1", "Cell 2"]] };
  }
  if (type === "data-table") {
    return {
      type,
      headline: "New slide",
      columns: [{ label: "A" }, { label: "B" }],
      rows: [{ text: ["1", "2"] }],
    };
  }
  if (type === "illustrated-points") {
    return { type, headline: "New slide", points: ["First point", "Second point", "Third point"] };
  }
  if (type === "split-screen") {
    return {
      type,
      headline: "New slide",
      left: IMAGE_PLACEHOLDER,
      right: IMAGE_PLACEHOLDER,
      left_caption: "Left",
      right_caption: "Right",
      notes: "[image] Replace with real uploads via Add image.",
    };
  }
  if (type === "image") {
    return { type, image: IMAGE_PLACEHOLDER, caption: "Add a caption", notes: "[image] Replace with a real upload via Add image." };
  }
  if (type === "image-text") {
    return { type, headline: "New slide", image: IMAGE_PLACEHOLDER, body: ["First point"], notes: "[image] Replace with a real upload via Add image." };
  }
  if (type === "hero-image") {
    return { type, headline: "New slide", subtitle: "Subtitle", image: IMAGE_PLACEHOLDER, notes: "[image] Replace with a real upload via Add image." };
  }
  if (type === "image-grid") {
    return {
      type,
      headline: "New slide",
      images: [
        { src: IMAGE_PLACEHOLDER, caption: "First" },
        { src: IMAGE_PLACEHOLDER, caption: "Second" },
      ],
      notes: "[image] Replace with real uploads via Add image.",
    };
  }
  const fields = TYPE_FIELDS[type];
  if (!fields) return { type, headline: "New slide" };
  const slide = { type };
  for (const f of fields) {
    slide[f.key] = fieldBlank(f, type);
  }
  return slide;
}

export function blankSlideTypes() {
  return Object.keys(TYPE_FIELDS).filter((t) => t !== "title");
}
