/* DO NOT EDIT — generated from packages/model/report.schema.json by tools/v2-types.mjs.
 * JSON Schema is the source of truth; AJV owns runtime validation. */

/**
 * Content contract for a report drawn on the institutional .docx template. Unlike a deck there is no layout: the renderer injects these sections into the donor's body in the order `order` gives, and that order is what is graded. The eight named below are the default structure; a donor template that declares its own headings, or a topic that earns a section of its own, may add to them.
 */
export interface ReportSpec {
  /**
   * Appears on the cover page, plain text like the template's own title line.
   */
  title: string;
  subtitle?: string;
  /**
   * Section name -> content. The default graded structure is Abstract, Acknowledgement, Introduction, Theoretical Background, Application, Future Scope, Conclusion and References (see DEFAULT_REPORT_SECTIONS); a section the donor template declares, or one the topic earns, is accepted under its own name and positioned by `order`.
   */
  content: {
    [k: string]: Section;
  };
  /**
   * The section names in the order they are emitted, including any not in the default eight. Omitted on reports written before the structure became data; the renderer then falls back to the fixed graded order.
   *
   * @maxItems 20
   */
  order?: string[];
}
export interface Section {
  /**
   * @minItems 1
   * @maxItems 16
   */
  paragraphs?: [string, ...string[]];
  table?: Table;
  /**
   * A list rendered as plain paragraphs; the References section uses this for its numbered source lines.
   *
   * @minItems 1
   * @maxItems 40
   */
  entries?: [string, ...string[]];
}
export interface Table {
  /**
   * Rendered centred and italic above the table, like the template's figure captions.
   */
  caption?: string;
  /**
   * @minItems 1
   * @maxItems 8
   */
  header: [string, ...string[]];
  /**
   * @maxItems 40
   */
  rows: [string, ...string[]][];
}
