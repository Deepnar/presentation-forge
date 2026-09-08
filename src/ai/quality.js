import { numericFactCount, familyFor } from "./catalog.js";

const DATA_FAMILIES = new Set(["Data & Stats", "Chart"]);
const DATA_TYPES = new Set(["chart", "stats", "big-number", "kpi-dashboard", "data-cards", "progress-bars", "ranking-list", "metric-comparison", "sparklines"]);

function isDataSlide(slide) {
  if (DATA_TYPES.has(slide.type)) return true;
  const fam = familyFor(slide.type);
  return fam && DATA_FAMILIES.has(fam);
}

export function analyzeQuality(deck, research = "") {
  const slides = Array.isArray(deck?.slides) ? deck.slides : [];
  const findings = [];

  const content = slides
    .map((s, idx) => ({ slide: s, idx }))
    .filter(({ slide }) => !["title", "section", "chapter", "closing", "epigraph"].includes(slide.type));

  if (content.length >= 5) {
    let streakType = content[0]?.slide.type;
    let streakLen = 1;
    let streakStart = 0;
    for (let i = 1; i < content.length; i++) {
      if (content[i].slide.type === streakType) {
        streakLen++;
      } else {
        if (streakLen >= 5) {
          findings.push({
            kind: "monotony",
            detail: `${streakLen} consecutive "${streakType}" slides (${streakStart + 1}-${streakStart + streakLen} of content) — vary families`,
            indices: content.slice(streakStart, streakStart + streakLen).map((c) => c.idx),
          });
        }
        streakType = content[i].slide.type;
        streakStart = i;
        streakLen = 1;
      }
    }
    if (streakLen >= 5) {
      findings.push({
        kind: "monotony",
        detail: `${streakLen} consecutive "${streakType}" slides — vary families`,
        indices: content.slice(streakStart, streakStart + streakLen).map((c) => c.idx),
      });
    }

    let streakFam = familyFor(content[0]?.slide.type);
    let famLen = 1;
    let famStart = 0;
    for (let i = 1; i < content.length; i++) {
      const fam = familyFor(content[i].slide.type);
      if (fam && fam === streakFam) {
        famLen++;
      } else {
        if (famLen >= 5 && streakFam) {
          findings.push({
            kind: "monotony",
            detail: `${famLen} consecutive "${streakFam}" family slides — mix families`,
            indices: content.slice(famStart, famStart + famLen).map((c) => c.idx),
          });
        }
        streakFam = fam;
        famStart = i;
        famLen = 1;
      }
    }
    if (famLen >= 5 && streakFam) {
      findings.push({
        kind: "monotony",
        detail: `${famLen} consecutive "${streakFam}" family slides — mix families`,
        indices: content.slice(famStart, famStart + famLen).map((c) => c.idx),
      });
    }

    const byType = new Map();
    for (const { slide } of content) byType.set(slide.type, (byType.get(slide.type) ?? 0) + 1);
    for (const [type, n] of byType) {
      if (n > content.length * 0.6 && n >= 5) {
        findings.push({
          kind: "monotony",
          detail: `"${type}" owns ${n}/${content.length} content slides (>60%) — vary types`,
          indices: content.filter((c) => c.slide.type === type).map((c) => c.idx),
        });
      }
    }
    const byFam = new Map();
    for (const { slide } of content) {
      const fam = familyFor(slide.type) ?? "Other";
      byFam.set(fam, (byFam.get(fam) ?? 0) + 1);
    }
    for (const [fam, n] of byFam) {
      if (n > content.length * 0.6 && n >= 5) {
        findings.push({
          kind: "monotony",
          detail: `"${fam}" family owns ${n}/${content.length} content slides (>60%) — mix families`,
          indices: content.filter((c) => (familyFor(c.slide.type) ?? "Other") === fam).map((c) => c.idx),
        });
      }
    }
  }

  const facts = numericFactCount(research);
  if (facts >= 5) {
    const hasData = content.some(({ slide }) => isDataSlide(slide));
    if (!hasData) {
      findings.push({
        kind: "data_unused",
        detail: `Research carries ${facts} numeric facts but deck uses zero data slides — add a chart/stats/data-cards slide`,
        indices: [],
      });
    }
  }

  findings.push(...chartLengthFindings(slides));

  return findings;
}

function chartLengthFindings(slides) {
  const out = [];
  for (const [i, s] of slides.entries()) {
    const c = s?.chart;
    if (!c || !Array.isArray(c.series) || !c.series.length || !Array.isArray(c.categories)) continue;
    const lengths = c.series.map((x) => (Array.isArray(x?.values) ? x.values.length : 0));
    const shortest = Math.min(...lengths);
    if (lengths.some((n) => n !== c.categories.length)) {
      out.push({
        kind: "chart_shape",
        detail:
          `slide ${i + 1} (${s.type}): ${c.categories.length} categor${c.categories.length === 1 ? "y" : "ies"} ` +
          `against series of ${lengths.join(", ")} — drawn at ${shortest}, so give every series one value per category`,
      });
    }
  }
  return out;
}

export function qualityProblems(findings) {
  return findings.map((f) => `[quality] ${f.kind}: ${f.detail}`);
}
