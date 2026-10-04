// @forge/model — runtime validators for the Slice B domain contracts.
//
// Each validator compiles its JSON Schema once via AJV and returns
// {ok, errors[]}. Schemas stay the source of truth; generated types give
// compile-time shape. No storage, provider, auth, or agent concerns enter
// here: these validate domain shape only.

import { readFile } from "node:fs/promises";
import { Ajv, type ValidateFunction } from "ajv";

export type Validation = { ok: boolean; errors: string[] };

const cache = new Map<string, ValidateFunction>();

async function validator(name: string): Promise<ValidateFunction> {
  const hit = cache.get(name);
  if (hit) return hit;
  const url = new URL(`./${name}.schema.json`, import.meta.url);
  const schema = JSON.parse(await readFile(url, "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  cache.set(name, validate);
  return validate;
}

async function check(name: string, value: unknown, where: string): Promise<Validation> {
  const validate = await validator(name);
  if (validate(value)) return { ok: true, errors: [] };
  return {
    ok: false,
    errors: (validate.errors ?? []).map((e) => `${where}: ${e.instancePath || "(root)"} ${e.message}`),
  };
}

export function validateProject(value: unknown): Promise<Validation> {
  return check("project", value, "project");
}

export function validateArtifact(value: unknown): Promise<Validation> {
  return check("artifact", value, "artifact");
}

export function validateFileRef(value: unknown): Promise<Validation> {
  return check("file", value, "file");
}

export function validateSourceRef(value: unknown): Promise<Validation> {
  return check("source", value, "source");
}

export function validateDesign(value: unknown): Promise<Validation> {
  return check("design", value, "design");
}

// ReportSpec validation preserves the legacy report error wording
// exactly: "<path>: missing required field \"x\"", "<path>: unknown
// field \"y\"", otherwise "<path>: <ajv message>". The canonical schema
// compiles once here; legacy src/report.js delegates to this function.
export async function validateReport(value: unknown): Promise<Validation> {
  const validate = await validator("report");
  if (validate(value)) return { ok: true, errors: [] };
  return {
    ok: false,
    errors: (validate.errors ?? []).map((e) => {
      const at = e.instancePath || "(root)";
      if (e.keyword === "additionalProperties") return `${at}: unknown field "${e.params.additionalProperty}"`;
      if (e.keyword === "required") return `${at}: missing required field "${e.params.missingProperty}"`;
      return `${at}: ${e.message}`;
    }),
  };
}
