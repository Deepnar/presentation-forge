// @forge/projects — durable V2 project document helpers (pure, framework-free).
//
// The project document is the persistence contract for V2-6A: a versioned
// envelope around the authoritative SlideScene collection the command
// engine owns. This module never touches disk, network, or the DOM; the
// store adapter (src/projects/store.js) owns durability and the server
// routes own HTTP. Scenes are validated through the Layer-C scene
// contract; React-only state (selection, drafts, zoom) never enters here.
import { readFile } from "node:fs/promises";
import { Ajv } from "ajv";

export const PROJECT_SCHEMA_VERSION = 1;
export const PROJECT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export const MAX_SCENES = 120;
// Payload guard before schema work: ~6MB of JSON covers a 120-slide deck
// with room to spare while keeping a hostile body out of AJV and clone.
export const MAX_PROJECT_JSON_CHARS = 6 * 1024 * 1024;

let _validate = null;
async function envelopeValidator() {
  if (!_validate) {
    const url = new URL("./project-document.schema.json", import.meta.url);
    const schema = JSON.parse(await readFile(url, "utf8"));
    _validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
  }
  return _validate;
}

function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Prototype-pollution guard: persisted documents become plain state on
// load, so dangerous keys are refused at every boundary rather than
// scrubbed silently (a scrubbed document would load as different content).
export function findDangerousKey(value, path = "$") {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findDangerousKey(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (isRecord(value)) {
    for (const k of Object.keys(value)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") {
        return `${path}.${k}`;
      }
      const hit = findDangerousKey(value[k], `${path}.${k}`);
      if (hit) return hit;
    }
  }
  return null;
}

export function findFunction(value, path = "$") {
  if (typeof value === "function") return path;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findFunction(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (isRecord(value)) {
    for (const k of Object.keys(value)) {
      const hit = findFunction(value[k], `${path}.${k}`);
      if (hit) return hit;
    }
  }
  return null;
}

export function mintProjectId() {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return `p-${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function validProjectId(id) {
  return typeof id === "string" && PROJECT_ID_RE.test(id);
}

function isoNow() {
  return new Date().toISOString();
}

// Build a new document from authoritative scenes. The caller owns the
// scenes array; it is cloned here so later engine edits cannot mutate
// the stored copy through a shared reference.
export function buildProjectDocument({ title, scenes, theme = null, origin = null }) {
  const now = isoNow();
  return {
    id: mintProjectId(),
    title: String(title ?? "Untitled project"),
    schemaVersion: PROJECT_SCHEMA_VERSION,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    ...(theme ? { theme: structuredClone(theme) } : {}),
    ...(origin ? { origin: structuredClone(origin) } : {}),
    scenes: structuredClone(scenes),
  };
}

// Validate a full stored document: envelope shape first (cheap), then
// each scene through the Layer-C contract (authoritative). Returns
// {ok, errors[]} and never throws on domain input.
export async function validateProjectDocument(doc) {
  if (!isRecord(doc)) return { ok: false, errors: ["project: document must be an object"] };
  const dangerous = findDangerousKey(doc);
  if (dangerous) return { ok: false, errors: [`project: refused dangerous key ${dangerous}`] };
  const fn = findFunction(doc);
  if (fn) return { ok: false, errors: [`project: functions are not persistable (${fn})`] };
  let jsonLen = 0;
  try {
    jsonLen = JSON.stringify(doc).length;
  } catch {
    return { ok: false, errors: ["project: document is not JSON-serializable"] };
  }
  if (jsonLen > MAX_PROJECT_JSON_CHARS) {
    return { ok: false, errors: [`project: document too large (${jsonLen} chars, max ${MAX_PROJECT_JSON_CHARS})`] };
  }
  const validate = await envelopeValidator();
  if (!validate(doc)) {
    return {
      ok: false,
      errors: (validate.errors ?? []).map((e) => `project${e.instancePath || ""} ${e.message}`),
    };
  }
  if (doc.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    return { ok: false, errors: [`project: unsupported schemaVersion ${doc.schemaVersion} (this build reads 1)`] };
  }
  const { validateScene } = await import("../model/scene.ts");
  const errors = [];
  const slideIds = new Set();
  for (let i = 0; i < doc.scenes.length; i++) {
    const scene = doc.scenes[i];
    const verdict = await validateScene(scene);
    if (!verdict.ok) {
      errors.push(`project.scenes[${i}]: ${verdict.errors.join("; ")}`);
      continue;
    }
    if (slideIds.has(scene.id)) errors.push(`project.scenes[${i}]: duplicate slide id ${scene.id}`);
    slideIds.add(scene.id);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [] };
}

// Validate a save payload (client → store) without trusting its revision
// or timestamps: the store assigns those. Scenes are required in full —
// a save carries authoritative state, never a prompt or a DeckIntent.
export async function validateSavePayload(payload) {
  if (!isRecord(payload)) return { ok: false, errors: ["save: payload must be an object"] };
  const dangerous = findDangerousKey(payload);
  if (dangerous) return { ok: false, errors: [`save: refused dangerous key ${dangerous}`] };
  const fn = findFunction(payload);
  if (fn) return { ok: false, errors: [`save: functions are not persistable (${fn})`] };
  const { baseRevision, title, scenes, theme, origin } = payload;
  if (!Number.isInteger(baseRevision) || baseRevision < 0) {
    return { ok: false, errors: ["save: baseRevision must be a non-negative integer"] };
  }
  if (title !== undefined && (typeof title !== "string" || !title.trim() || title.length > 200)) {
    return { ok: false, errors: ["save: title must be a non-empty string up to 200 chars"] };
  }
  if (!Array.isArray(scenes) || scenes.length === 0 || scenes.length > MAX_SCENES) {
    return { ok: false, errors: [`save: scenes must be an array of 1..${MAX_SCENES}`] };
  }
  if (theme !== undefined && theme !== null) {
    if (!isRecord(theme) || typeof theme.name !== "string" || !theme.name.trim()) {
      return { ok: false, errors: ["save: theme.name must be a non-empty string"] };
    }
  }
  if (origin !== undefined && origin !== null && !isRecord(origin)) {
    return { ok: false, errors: ["save: origin must be an object"] };
  }
  let jsonLen = 0;
  try {
    jsonLen = JSON.stringify(payload).length;
  } catch {
    return { ok: false, errors: ["save: payload is not JSON-serializable"] };
  }
  if (jsonLen > MAX_PROJECT_JSON_CHARS) {
    return { ok: false, errors: [`save: payload too large (${jsonLen} chars, max ${MAX_PROJECT_JSON_CHARS})`] };
  }
  const { validateScene } = await import("../model/scene.ts");
  const errors = [];
  const slideIds = new Set();
  for (let i = 0; i < scenes.length; i++) {
    const verdict = await validateScene(scenes[i]);
    if (!verdict.ok) {
      errors.push(`save.scenes[${i}]: ${verdict.errors.join("; ")}`);
      continue;
    }
    if (slideIds.has(scenes[i].id)) errors.push(`save.scenes[${i}]: duplicate slide id ${scenes[i].id}`);
    slideIds.add(scenes[i].id);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [] };
}

// Project a stored document for list responses: identity + revision +
// counts, never scene bytes. The list stays small when decks grow.
export function projectSummary(doc) {
  return {
    id: doc.id,
    title: doc.title,
    revision: doc.revision,
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
    slideCount: Array.isArray(doc.scenes) ? doc.scenes.length : 0,
    ...(doc.theme ? { theme: structuredClone(doc.theme) } : {}),
  };
}
