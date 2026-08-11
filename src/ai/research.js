/**
 * The model-facing research excerpt.
 *
 * The research artefact (decks/<slug>/research/notes.md) is first-class and
 * kept whole on disk; the model only ever sees a bounded excerpt of it. A
 * research pass can easily outgrow the author role's context window — 138 KB
 * of notes is ~40K tokens against a 32K num_ctx — and when the prompt
 * overflows, Ollama truncates and the model degrades to token loops or a
 * one-token reply. Capping well under the window keeps every prompt, schema
 * and output inside it.
 *
 * Every consumer (deck planning, slide writing, chat turns, report section
 * writing) reads research through this so the whole pipeline shares one
 * budget and one failure mode to think about.
 */

export const RESEARCH_EXCERPT = 80_000;

/** Cap to the excerpt budget, ending on a line boundary when truncated. */
export function excerptResearch(text) {
  if (!text) return "";
  if (text.length <= RESEARCH_EXCERPT) return text;
  const cut = text.lastIndexOf("\n", RESEARCH_EXCERPT);
  return text.slice(0, cut > 0 ? cut : RESEARCH_EXCERPT);
}
