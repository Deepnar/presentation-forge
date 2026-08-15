/**
 * Slash commands in the chat input bar. A line starting with `/` is parsed
 * BEFORE the turn runs — a command is not an instruction to the model, it is
 * a direct action (set the theme, switch density, jump to the report, toggle
 * papers, fix the slide count). Unknown commands get a helpful inline reply
 * rather than being forwarded to the AI.
 *
 * Only the FIRST line is inspected; `/theme warm-humanist` or
 * `/slides 16  add context` both parse, and the rest of the text is returned
 * as the turn instruction so a command plus a message can be combined.
 */

export const SLASH_COMMANDS = [
  { cmd: "theme", args: "<name>", help: "Set the deck's theme by name (e.g. /theme swiss-international)." },
  { cmd: "density", args: "sparse|balanced|dense", help: "Set or sweep the content density." },
  { cmd: "report", args: "", help: "Jump to the report: generate the deck's companion report." },
  { cmd: "papers", args: "", help: "Toggle the arXiv/Crossref papers pass for research." },
  { cmd: "slides", args: "<n>", help: "Set the deck's slide budget (e.g. /slides 16)." },
  { cmd: "help", args: "", help: "List every slash command." },
];

export const SLASH_HELP = SLASH_COMMANDS
  .map((c) => `/${c.cmd}${c.args ? ` ${c.args}` : ""} — ${c.help}`)
  .join("\n");

/**
 * Parse the first line of input as a slash command.
 * Returns { command, arg, rest } when the line is a command, else null.
 * `rest` is everything after the command line — a command followed by a
 * sentence still lets the sentence become the turn instruction.
 */
export function parseSlashCommand(text) {
  const t = String(text ?? "");
  const firstLine = t.split("\n")[0]?.trim() ?? "";
  const m = firstLine.match(/^\/([a-z]+)(?:\s+(.*))?$/i);
  if (!m) return null;
  const command = m[1].toLowerCase();
  const arg = (m[2] ?? "").trim();
  const rest = t.slice(firstLine.length).trim();
  return { command, arg, rest };
}

/** Is this line a slash command at all (even an unknown one)? */
export function looksLikeSlash(text) {
  return /^\s*\//.test(String(text ?? ""));
}
