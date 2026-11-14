// Tabular text -> chart data, for a CSV in the project's files or cells
// pasted from a spreadsheet (which arrive tab-separated). The first column
// names the categories and every numeric column becomes a series; a column
// with no numbers at all (notes, codes) is left out and named, never
// guessed at. A blank or unreadable cell inside a numeric column is an
// error naming the cell, the same rule the data grid applies: nothing is
// zero-filled.

export const CHART_TABLE_LIMITS = { categories: 40, series: 12 };

// RFC 4180-ish: quoted fields with doubled quotes and embedded newlines.
// The delimiter is a tab when the first line has one, else a semicolon
// when it outnumbers commas (European CSV), else a comma.
export function parseDelimited(text) {
  const src = String(text ?? "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const first = src.split("\n", 1)[0] ?? "";
  const count = (ch) => first.split(ch).length - 1;
  const delim = count("\t") ? "\t" : count(";") > count(",") ? ";" : ",";
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field.trim() === "") { quoted = true; field = ""; }
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const out = rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
  return Object.defineProperty(out, "delimiter", { value: delim });
}

// "1,234.5", "$12", "45%", "(3.2)", "−4" -> a number; anything else -> null.
// With decimalComma (a semicolon-separated file) "1.234,5" and "1,5" read
// the European way.
export function readNumber(raw, { decimalComma = false } = {}) {
  let s = String(raw ?? "").trim().replace(/[−‒–]/g, "-").replace(/[\s ]/g, "");
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/^[$€£¥₹]/, "").replace(/%$/, "");
  if (decimalComma) s = s.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

// rows -> { categories, series, notes } or { error }.
export function chartFromRows(rows, limits = CHART_TABLE_LIMITS) {
  const decimalComma = rows?.delimiter === ";";
  const num = (c) => readNumber(c, { decimalComma });
  const table = (rows ?? []).filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim()));
  if (table.length === 0) return { error: "there is no data to chart" };
  const width = Math.max(...table.map((r) => r.length));
  if (width < 2) return { error: "a chart needs a label column and at least one column of numbers" };
  const cell = (r, c) => String(table[r][c] ?? "").trim();
  // A header row is one whose value cells are not numbers — or are a run
  // of years ("Region, 2023, 2024"), which read as numbers but name columns.
  const top = table[0].slice(1).map((c) => String(c).trim()).filter(Boolean);
  const years = top.length > 1 && top.every((c, i) => /^(19|20|21)\d\d$/.test(c) && (i === 0 || Number(c) > Number(top[i - 1])));
  const header = table.length > 1 && (years || top.some((c) => num(c) === null));
  const body = header ? table.slice(1) : table;
  const bodyStart = header ? 1 : 0;
  const notes = [];
  const series = [];
  const skipped = [];
  for (let c = 1; c < width; c++) {
    const name = header ? cell(0, c) || `Series ${c}` : `Series ${c}`;
    const readable = body.filter((_, i) => num(cell(bodyStart + i, c)) !== null).length;
    if (readable === 0) { skipped.push(name); continue; }
    const values = [];
    for (let i = 0; i < body.length; i++) {
      const raw = cell(bodyStart + i, c);
      const n = num(raw);
      const label = cell(bodyStart + i, 0) || `row ${bodyStart + i + 1}`;
      if (n === null) {
        return { error: raw ? `"${name}", ${label}: "${raw}" is not a number` : `"${name}", ${label}: the cell is empty — fill it or remove the row` };
      }
      values.push(n);
    }
    series.push({ name, values });
  }
  if (series.length === 0) return { error: "no column holds numbers to chart" };
  if (skipped.length) notes.push(`left out (no numbers): ${skipped.join(", ")}`);
  const categories = body.map((r, i) => cell(bodyStart + i, 0) || `Category ${i + 1}`);
  if (categories.length > limits.categories) {
    return { error: `${categories.length} rows is more than a slide's chart can show (${limits.categories}) — chart a summary` };
  }
  if (series.length > limits.series) {
    return { error: `${series.length} number columns is more than a chart can tell apart (${limits.series})` };
  }
  return { categories, series, notes };
}

export const chartFromText = (text, limits) => chartFromRows(parseDelimited(text), limits);
