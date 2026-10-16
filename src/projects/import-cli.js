import { pathToFileURL } from "node:url";
import path from "node:path";
import { userForToken, verificationRequired } from "../auth.js";
import { closeDb } from "../db.js";
import { projectStore } from "./backend.js";
import { importGeneratedProject } from "./import-generated.js";
import { importError } from "./legacy-conversion.js";

export async function importCli(argv) {
  const [slug, ...options] = argv;
  const args = { slug };
  for (let i = 0; i < options.length; i += 2) {
    const key = { "--request-id": "requestId", "--mode": "mode" }[options[i]];
    if (!key || !options[i + 1] || args[key] !== undefined) throw importError("bad-import-request", "usage: import-project <slug> --request-id <stable-id> [--mode light|dark]");
    args[key] = options[i + 1];
  }
  const token = process.env.FORGE_IMPORT_TOKEN;
  const principal = token ? await userForToken(token) : null;
  if (token && !principal) throw importError("unauthorized", "invalid import session");
  if (principal && !principal.verified && verificationRequired()) throw importError("email-unverified", "confirm your email before importing");
  return importGeneratedProject({ ...args, principal, localOperator: !token });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await importCli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, code: error.code ?? "import-failed", error: error.message, details: error.details ?? [] })}\n`);
    process.exitCode = 1;
  } finally {
    try { await (await projectStore()).closeProjectStore(); } catch { /* no configured store was opened */ }
    closeDb();
  }
}
