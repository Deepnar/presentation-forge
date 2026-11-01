import { parsedWebSource, canonicalWebSource } from "../../packages/tools/web-source.ts";
import { citationMetadataError, hasCitations } from "../../packages/model/citations.ts";
import { SOURCE_LIMITS } from "./source-read.js";

const utf8 = value => Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value));

// A project may be born with citations only when it is born with the sources
// they cite: every citation names this project, generation 0 and a source in
// the seed. Anything else still needs the source-aware copy path.
export function seedSources(doc, sources) {
  if (!sources?.length) {
    if (hasCitations(doc.scenes)) throw Object.assign(new Error("Citation-bearing project creation requires source-aware copying."), { code: "invalid-document" });
    return null;
  }
  const canonical = sources.map(source => {
    const parsed = parsedWebSource(source, doc.id);
    if (!parsed) throw Object.assign(new Error("seed source is invalid"), { code: "invalid-document" });
    return canonicalWebSource(parsed);
  });
  const ids = new Set(canonical.map(s => s.id));
  const bytes = canonical.reduce((n, s) => n + utf8(s), 0);
  if (ids.size !== canonical.length || canonical.length > SOURCE_LIMITS.count || bytes > SOURCE_LIMITS.bytes || canonical.some(s => utf8(s) > SOURCE_LIMITS.sourceBytes)) {
    throw Object.assign(new Error("seed sources exceed the catalog limits"), { code: "invalid-document" });
  }
  const metadata = citationMetadataError(doc.scenes, doc.id);
  if (metadata) throw Object.assign(new Error(metadata), { code: "invalid-document" });
  for (const scene of doc.scenes) for (const citation of scene.citations ?? []) {
    if (citation.source.generation !== 0 || !ids.has(citation.source.id)) {
      throw Object.assign(new Error("a citation names a source the project is not created with"), { code: "invalid-document" });
    }
  }
  return { sources: canonical, bytes };
}

export const SEED_SOURCE_SQL = Object.freeze({
  catalog: "INSERT INTO v2_project_source_catalog(project_id,generation,revision,count,bytes,policy_version) VALUES(?,?,?,?,?,?)",
  source: "INSERT INTO v2_project_sources(project_id,source_id,payload,payload_bytes) VALUES(?,?,?,?)",
});
export const seedSourceBytes = utf8;
