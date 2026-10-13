// V2 project-store backend selection (V2-6C) — the one server-side
// configuration boundary for project durability.
//
// Neither React nor the command engine imports database code: routes
// resolve the store here, per request, and both adapters expose the
// same named functions with the same response semantics (saved,
// noop, stale; invalid-id, invalid-document, not-found,
// storage-unavailable, revision-pruned).
//
// Selection is explicit and predictable:
//
//   FORGE_PROJECTS_BACKEND unset or "sqlite" → local SQLite file
//     (WAL, CONFIG/forge.db or FORGE_DB_PATH). Default everywhere,
//     including hosted single-instance deployments on a volume.
//   FORGE_PROJECTS_BACKEND=postgres → shared PostgreSQL selected
//     via FORGE_PROJECTS_DATABASE_URL. The URL is required: without
//     it every project route answers 503 with an honest message.
//     There is deliberately NO silent fallback to an ephemeral
//     SQLite file — presenting the UI as durable cloud storage
//     while writing to a throwaway file is worse than refusing.
//   Anything else → misconfigured (503, honest message).
//
// Related knobs: FORGE_PROJECTS_PG_POOL_MAX (default 10, cap 50),
// FORGE_PROJECTS_PG_SSL (1 force TLS, 0 force plain, unset honors
// the URL's sslmode). See docs/V2-6C-HOSTED-STORAGE.md.
import * as sqliteStore from "./store.js";

let pgModule = null;

export function projectsBackend() {
  const sel = (process.env.FORGE_PROJECTS_BACKEND ?? "sqlite").trim().toLowerCase();
  if (sel === "" || sel === "sqlite") return { backend: "sqlite" };
  if (sel === "postgres" || sel === "postgresql" || sel === "pg") {
    if (!process.env.FORGE_PROJECTS_DATABASE_URL) {
      return {
        backend: "misconfigured",
        reason: "FORGE_PROJECTS_BACKEND=postgres but FORGE_PROJECTS_DATABASE_URL is not set",
      };
    }
    return { backend: "postgres" };
  }
  return { backend: "misconfigured", reason: `unknown FORGE_PROJECTS_BACKEND "${sel}" (want sqlite or postgres)` };
}

// Resolve the active store namespace. Throws store-misconfigured
// (mapped to 503 by the routes) when selection is invalid — never
// a fallback backend.
export async function projectStore() {
  const sel = projectsBackend();
  if (sel.backend === "postgres") {
    if (!pgModule) pgModule = await import("./store-postgres.js");
    return pgModule;
  }
  if (sel.backend === "misconfigured") {
    const err = new Error(`project storage is not configured on this host: ${sel.reason}`);
    err.code = "store-misconfigured";
    throw err;
  }
  return sqliteStore;
}

// Backend description for boot logs and status surfaces. Never
// includes URLs, credentials, or payload contents.
export function describeProjectsBackend() {
  const sel = projectsBackend();
  if (sel.backend === "sqlite") return { backend: "sqlite" };
  if (sel.backend === "postgres") {
    const max = Number.parseInt(process.env.FORGE_PROJECTS_PG_POOL_MAX ?? "10", 10);
    return { backend: "postgres", poolMax: Number.isInteger(max) && max > 0 ? Math.min(max, 50) : 10 };
  }
  return { backend: "misconfigured", reason: sel.reason };
}
