
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

export function looksLikeSlash(text) {
  return /^\s*\//.test(String(text ?? ""));
}
