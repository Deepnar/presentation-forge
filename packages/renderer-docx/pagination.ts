// @forge/renderer-docx — pure pagination-text search. Locates the page
// each numbered section heading landed on inside pdftotext output (pages
// split on form feeds). Obtaining that text via LibreOffice/Poppler is
// external orchestration, never this module.
export function locatePages(text: string, present: readonly string[]): Record<string, number | null> {
  const pages = text.split("\f");
  const norm = (s: string): string => s.replace(/\s+/g, " ").trim();
  const out: Record<string, number | null> = {};
  present.forEach((name, i) => {
    const target = norm(`${i + 1}. ${name}`);
    const idx = pages.findIndex((p) => p.split("\n").some((l) => norm(l) === target));
    out[name] = idx >= 0 ? idx + 1 : null;
  });
  return out;
}
