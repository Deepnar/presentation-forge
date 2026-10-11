// @forge/model — headless command engine. The single authoritative
// path for every human and AI mutation of a presentation: browser
// interactions, server turns, tests, and future persistence adapters
// all execute envelopes here. No React, no Express, no AI SDK, no
// DOM, no renderer: element operations reuse packages/model/commands.ts
// primitives, slide operations reuse its pure deck functions, and
// results validate through the scene schema before commit.
//
// Guarantees: copy-on-write atomicity (a command lands wholly or not
// at all), optimistic revision checks (stale envelopes never rebase),
// inverse history with undo/redo, duplicate-envelope rejection, and
// input immutability (caller payloads are cloned on entry). See
// docs/V2-5A-EDITOR-ARCHITECTURE.md §§2–8 for the design record.
import {
  applyCommand,
  insertScene,
  deleteScene,
  duplicateScene,
  reorderScene,
  type DeckCommand,
} from "./commands.ts";
import { validateScene, findElement } from "./scene.ts";
import type { SlideScene, SceneElement } from "./scene.generated.ts";

export type SlideOp =
  | { type: "slide.insert"; scene: SlideScene; index?: number }
  | { type: "slide.delete"; id: string }
  | { type: "slide.duplicate"; id: string }
  | { type: "slide.reorder"; id: string; toIndex: number };

export type EngineOp = DeckCommand | SlideOp;

export interface PlacedOp {
  slideId: string | null;
  op: EngineOp;
}

export interface CommandEnvelope extends PlacedOp {
  id: string;
  baseRevision: number;
  actor: "human" | "agent";
  agentId?: string;
}

export interface BatchEnvelope {
  id: string;
  ops: PlacedOp[];
  baseRevision: number;
  actor: "human" | "agent";
  agentId?: string;
}

export type EngineCode =
  | "bad-envelope"
  | "duplicate-id"
  | "stale-revision"
  | "unknown-slide"
  | "unknown-element"
  | "locked"
  | "op-rejected"
  | "invalid-result"
  | "empty-history";

export interface EngineOk {
  ok: true;
  revision: number;
  noop?: boolean;
}

export interface EngineFailure {
  ok: false;
  code: EngineCode;
  message: string;
  expectedRevision?: number;
  actualRevision?: number;
}

export type EngineResult = EngineOk | EngineFailure;

interface HistoryEntry {
  envelopeId: string;
  actor: "human" | "agent";
  agentId?: string;
  baseRevision: number;
  resultingRevision: number;
  forward: PlacedOp[];
  inverse: PlacedOp[];
}

interface EngineState {
  scenes: SlideScene[];
  revision: number;
  history: HistoryEntry[];
  redo: HistoryEntry[];
  appliedIds: Set<string>;
}

export const MAX_HISTORY = 200;

const ELEMENT_TYPES = new Set(["element.move", "element.resize", "element.updateText", "element.add", "element.delete"]);
const SLIDE_TYPES = new Set(["slide.insert", "slide.delete", "slide.duplicate", "slide.reorder"]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function assertNoFunctions(v: unknown, where: string): string | null {
  if (typeof v === "function") return `${where}: functions are not commands`;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const bad = assertNoFunctions(v[i], `${where}[${i}]`);
      if (bad) return bad;
    }
  } else if (isRecord(v)) {
    for (const k of Object.keys(v)) {
      const bad = assertNoFunctions(v[k], `${where}.${k}`);
      if (bad) return bad;
    }
  }
  return null;
}

function num(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function idStr(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 200;
}

// Shape validation for one placed op. Untrusted runtime payloads
// fail here with field-level reasons, never inside apply.
function checkOp(placed: unknown): string | null {
  if (!isRecord(placed)) return "op must be an object";
  const { slideId, op } = placed;
  if (!isRecord(op) || typeof op.type !== "string") return "op.type must be a string";
  if (ELEMENT_TYPES.has(op.type) && !idStr(slideId)) return `${op.type} requires a slideId`;
  if (SLIDE_TYPES.has(op.type) && slideId !== null) return `${op.type} takes no slideId`;
  const fn = assertNoFunctions(op, "op");
  if (fn) return fn;
  switch (op.type) {
    case "element.move":
      if (!idStr(op.id) || !num(op.x) || !num(op.y)) return "element.move needs id, finite x/y";
      return null;
    case "element.resize":
      if (!idStr(op.id) || !num(op.w) || !num(op.h) || op.w <= 0 || op.h <= 0) {
        return "element.resize needs id and positive w/h";
      }
      return null;
    case "element.updateText":
      if (!idStr(op.id) || !Array.isArray(op.paragraphs) || op.paragraphs.length === 0) {
        return "element.updateText needs id and a non-empty paragraphs array";
      }
      for (const p of op.paragraphs) {
        if (!isRecord(p) || !Array.isArray(p.runs)) return "element.updateText paragraphs need runs arrays";
      }
      return null;
    case "element.add": {
      if (!isRecord(op.element) || typeof op.element.kind !== "string" || !num(op.element.x) || !num(op.element.y) || !num(op.element.w) || !num(op.element.h)) {
        return "element.add needs an element with kind and finite x/y/w/h";
      }
      if (op.element.w <= 0 || op.element.h <= 0) return "element.add needs positive w/h";
      if (op.index !== undefined && (!Number.isInteger(op.index) || (op.index as number) < 0)) {
        return "element.add index must be a non-negative integer";
      }
      return null;
    }
    case "element.delete":
      if (!idStr(op.id)) return "element.delete needs id";
      return null;
    case "slide.insert":
      if (!isRecord(op.scene)) return "slide.insert needs a scene";
      if (op.index !== undefined && (!Number.isInteger(op.index) || (op.index as number) < 0)) {
        return "slide.insert index must be a non-negative integer";
      }
      return null;
    case "slide.delete":
    case "slide.duplicate":
      if (!idStr(op.id)) return `${op.type} needs id`;
      return null;
    case "slide.reorder":
      if (!idStr(op.id) || !Number.isInteger(op.toIndex) || (op.toIndex as number) < 0) {
        return "slide.reorder needs id and a non-negative toIndex";
      }
      return null;
    default:
      return `unknown op type ${(op as { type: string }).type}`;
  }
}

function checkEnvelope(env: unknown): string | null {
  if (!isRecord(env)) return "envelope must be an object";
  if (!idStr(env.id)) return "envelope id must be a non-empty string";
  if (!Number.isInteger(env.baseRevision) || (env.baseRevision as number) < 0) {
    return "baseRevision must be a non-negative integer";
  }
  if (env.actor !== "human" && env.actor !== "agent") return 'actor must be "human" or "agent"';
  if (env.agentId !== undefined && !idStr(env.agentId)) return "agentId must be a non-empty string";
  return checkOp(env);
}

function checkBatch(env: unknown): string | null {
  if (!isRecord(env)) return "batch must be an object";
  if (!idStr(env.id)) return "batch id must be a non-empty string";
  if (!Number.isInteger(env.baseRevision) || (env.baseRevision as number) < 0) {
    return "baseRevision must be a non-negative integer";
  }
  if (env.actor !== "human" && env.actor !== "agent") return 'actor must be "human" or "agent"';
  if (env.agentId !== undefined && !idStr(env.agentId)) return "agentId must be a non-empty string";
  if (!Array.isArray(env.ops)) return "batch ops must be an array";
  for (let i = 0; i < env.ops.length; i++) {
    const bad = checkOp(env.ops[i]);
    if (bad) return `ops[${i}]: ${bad}`;
  }
  return null;
}

function walkIds(els: SceneElement[], out: string[] = []): string[] {
  for (const el of els ?? []) {
    out.push(el.id);
    walkIds(el.group?.children ?? [], out);
  }
  return out;
}

function fail(code: EngineCode, message: string, extra: Partial<EngineFailure> = {}): EngineFailure {
  return { ok: false, code, message, ...extra };
}

// A placed op that cannot change anything is skipped before apply:
// applyCommand marks ownership unconditionally, so post-hoc
// comparison alone would never observe a no-op. Slide ops always
// run (the post-compare backstop still catches identity reorders).
function isEffectiveOp(scenes: SlideScene[], placed: PlacedOp): boolean {
  const { slideId, op } = placed;
  if (ELEMENT_TYPES.has((op as { type: string }).type)) {
    const slide = scenes.find((s) => s.id === slideId);
    if (!slide) return true;
    const el = findElement(slide, (op as { id: string }).id);
    if (!el) return true;
    switch ((op as { type: string }).type) {
      case "element.move": {
        const { x, y } = op as { x: number; y: number };
        return el.x !== x || el.y !== y;
      }
      case "element.resize": {
        const { w, h } = op as { w: number; h: number };
        return el.w !== w || el.h !== h;
      }
      case "element.updateText": {
        const { paragraphs } = op as { paragraphs: unknown };
        return JSON.stringify(el.paragraphs ?? null) !== JSON.stringify(paragraphs ?? null);
      }
      default:
        return true;
    }
  }
  return true;
}

// Apply one placed op to a WORKING scenes array (cloned by the
// caller). Returns the inverse placed op. Throws EngineFailure-
// shaped Errors — caught at the transaction boundary, never
// leaking partial state.
function runPlaced(scenes: SlideScene[], placed: PlacedOp): PlacedOp {
  const { slideId, op } = placed;
  const reject = (code: EngineCode, message: string): never => {
    throw { ok: false, code, message } as EngineFailure;
  };
  if (ELEMENT_TYPES.has((op as { type: string }).type)) {
    const i = scenes.findIndex((s) => s.id === slideId);
    if (i < 0) reject("unknown-slide", `unknown slide ${slideId}`);
    const el = findElement(scenes[i], (op as { id: string }).id);
    if (!el && (op as { type: string }).type !== "element.add") reject("unknown-element", `unknown element ${(op as { id: string }).id}`);
    if (el?.locked) reject("locked", `element ${el.id} is locked`);
    if ((op as { type: string }).type === "element.add") {
      const input = (op as { element: SceneElement }).element;
      if (input.id && walkIds(scenes[i].elements).includes(input.id)) {
        reject("op-rejected", `element id ${input.id} already exists`);
      }
    }
    try {
      const inverse = applyCommand(scenes[i], structuredClone(op) as DeckCommand);
      return { slideId, op: inverse };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/locked/.test(message)) reject("locked", message);
      if (/unknown element/.test(message)) reject("unknown-element", message);
      reject("op-rejected", message);
    }
  }
  // Deck-level ops reuse the pure slide functions; the engine
  // synthesizes the inverses those functions do not return.
  switch ((op as { type: string }).type) {
    case "slide.insert": {
      const { scene, index } = op as { scene: SlideScene; index?: number };
      if (scenes.some((s) => s.id === scene.id)) reject("op-rejected", `slide id ${scene.id} already exists`);
      const at = index === undefined ? scenes.length : Math.min(index, scenes.length);
      const next = insertScene(scenes, structuredClone(scene), at);
      scenes.length = 0;
      scenes.push(...next);
      return { slideId: null, op: { type: "slide.delete", id: scene.id } };
    }
    case "slide.delete": {
      const { id } = op as { id: string };
      const i = scenes.findIndex((s) => s.id === id);
      if (i < 0) reject("unknown-slide", `unknown slide ${id}`);
      let removed: SlideScene | null = null;
      try {
        removed = structuredClone(scenes[i]);
        const next = deleteScene(scenes, id);
        scenes.length = 0;
        scenes.push(...next);
      } catch (err) {
        reject("op-rejected", err instanceof Error ? err.message : String(err));
      }
      if (!removed) reject("op-rejected", `could not remove slide ${id}`);
      return { slideId: null, op: { type: "slide.insert", scene: removed as SlideScene, index: i } };
    }
    case "slide.duplicate": {
      const { id } = op as { id: string };
      if (!scenes.some((s) => s.id === id)) reject("unknown-slide", `unknown slide ${id}`);
      if (scenes.some((s) => s.id === `${id}-copy`)) reject("op-rejected", `slide id ${id}-copy already exists`);
      const next = duplicateScene(scenes, id);
      scenes.length = 0;
      scenes.push(...next);
      return { slideId: null, op: { type: "slide.delete", id: `${id}-copy` } };
    }
    case "slide.reorder": {
      const { id, toIndex } = op as { id: string; toIndex: number };
      const from = scenes.findIndex((s) => s.id === id);
      if (from < 0) reject("unknown-slide", `unknown slide ${id}`);
      const next = reorderScene(scenes, id, toIndex);
      scenes.length = 0;
      scenes.push(...next);
      return { slideId: null, op: { type: "slide.reorder", id, toIndex: from } };
    }
    default:
      reject("bad-envelope", `unknown op type ${(op as { type: string }).type}`);
  }
}

async function validateWorking(scenes: SlideScene[]): Promise<string | null> {
  const ids = new Set<string>();
  for (const s of scenes) {
    if (ids.has(s.id)) return `duplicate slide id ${s.id}`;
    ids.add(s.id);
    const verdict = await validateScene(s);
    if (!verdict.ok) return `slide ${s.id}: ${verdict.errors.join("; ")}`;
  }
  return null;
}

export interface EditorHandle {
  snapshot(): { scenes: SlideScene[]; revision: number };
  status(): { revision: number; canUndo: boolean; canRedo: boolean; historyLength: number };
  log(): { envelopeId: string; actor: string; baseRevision: number; resultingRevision: number; ops: number }[];
  apply(envelope: CommandEnvelope): Promise<EngineResult>;
  applyBatch(batch: BatchEnvelope): Promise<EngineResult>;
  undo(): Promise<EngineResult>;
  redo(): Promise<EngineResult>;
}

function freeze<T>(v: T): T {
  if (v && typeof v === "object") {
    for (const k of Object.keys(v)) freeze((v as Record<string, unknown>)[k]);
    Object.freeze(v);
  }
  return v;
}

export async function createDocument(scenes: SlideScene[]): Promise<EditorHandle> {
  const input = structuredClone(scenes);
  const failSeed = (message: string): never => {
    const err = new Error(message) as Error & { code: EngineCode };
    err.code = "bad-envelope";
    throw err;
  };
  if (!Array.isArray(input) || input.length === 0) failSeed("a document needs at least one slide");
  const bad = await validateWorking(input);
  if (bad) failSeed(`invalid seed scenes: ${bad}`);
  const state: EngineState = { scenes: input, revision: 0, history: [], redo: [], appliedIds: new Set() };

  function commit(entry: HistoryEntry): EngineOk {
    state.revision = entry.resultingRevision;
    state.history.push(entry);
    if (state.history.length > MAX_HISTORY) state.history.shift();
    state.redo = [];
    state.appliedIds.add(entry.envelopeId);
    return { ok: true, revision: state.revision };
  }

  // One transaction over cloned state: validate everything, then
  // swap the scenes reference. The committed array is never
  // mutated in place afterwards — later transactions clone from
  // it again — so earlier snapshots stay intact.
  async function transact(
    envelopeId: string, actor: "human" | "agent", agentId: string | undefined,
    baseRevision: number, forwards: PlacedOp[],
  ): Promise<EngineResult> {
    const working = structuredClone(state.scenes);
    const inverses: PlacedOp[] = [];
    const effective = forwards.filter((placed) => isEffectiveOp(working, placed));
    if (effective.length === 0) return { ok: true, revision: state.revision, noop: true };
    try {
      for (const placed of effective) {
        inverses.push(runPlaced(working, structuredClone(placed)));
      }
    } catch (err) {
      const failure = err as EngineFailure;
      return fail(failure.code ?? "op-rejected", failure.message ?? String(err));
    }
    const bad = await validateWorking(working);
    if (bad) return fail("invalid-result", bad);
    const before = JSON.stringify(state.scenes);
    if (JSON.stringify(working) === before) return { ok: true, revision: state.revision, noop: true };
    state.scenes = working;
    return commit({
      envelopeId, actor, agentId, baseRevision,
      resultingRevision: state.revision + 1,
      forward: structuredClone(effective),
      inverse: inverses.reverse(),
    });
  }

  return {
    snapshot() {
      return freeze(structuredClone({ scenes: state.scenes, revision: state.revision }));
    },
    status() {
      return {
        revision: state.revision,
        canUndo: state.history.length > 0,
        canRedo: state.redo.length > 0,
        historyLength: state.history.length,
      };
    },
    log() {
      return state.history.map((e) => ({
        envelopeId: e.envelopeId, actor: e.actor,
        baseRevision: e.baseRevision, resultingRevision: e.resultingRevision,
        ops: e.forward.length,
      }));
    },
    async apply(envelope: CommandEnvelope) {
      const shape = checkEnvelope(envelope);
      if (shape) return fail("bad-envelope", shape);
      if (state.appliedIds.has(envelope.id)) {
        return fail("duplicate-id", `envelope ${envelope.id} already applied`);
      }
      if (envelope.baseRevision !== state.revision) {
        return fail("stale-revision", `base ${envelope.baseRevision} does not match revision ${state.revision}`, {
          expectedRevision: state.revision, actualRevision: envelope.baseRevision,
        });
      }
      return transact(envelope.id, envelope.actor, envelope.agentId, envelope.baseRevision, [
        { slideId: envelope.slideId, op: envelope.op },
      ]);
    },
    async applyBatch(batch: BatchEnvelope) {
      const shape = checkBatch(batch);
      if (shape) return fail("bad-envelope", shape);
      if (state.appliedIds.has(batch.id)) {
        return fail("duplicate-id", `envelope ${batch.id} already applied`);
      }
      if (batch.baseRevision !== state.revision) {
        return fail("stale-revision", `base ${batch.baseRevision} does not match revision ${state.revision}`, {
          expectedRevision: state.revision, actualRevision: batch.baseRevision,
        });
      }
      if (batch.ops.length === 0) return { ok: true, revision: state.revision, noop: true };
      return transact(batch.id, batch.actor, batch.agentId, batch.baseRevision, batch.ops.map((o) => ({ slideId: o.slideId, op: o.op })));
    },
    async undo() {
      const entry = state.history[state.history.length - 1];
      if (!entry) return fail("empty-history", "nothing to undo");
      const working = structuredClone(state.scenes);
      try {
        for (const placed of entry.inverse) runPlaced(working, structuredClone(placed));
      } catch (err) {
        const failure = err as EngineFailure;
        return fail("op-rejected", `undo failed: ${failure.message ?? String(err)}`);
      }
      const bad = await validateWorking(working);
      if (bad) return fail("invalid-result", `undo failed: ${bad}`);
      state.history.pop();
      state.scenes = working;
      state.revision += 1;
      state.redo.push(entry);
      return { ok: true, revision: state.revision };
    },
    async redo() {
      const entry = state.redo[state.redo.length - 1];
      if (!entry) return fail("empty-history", "nothing to redo");
      const working = structuredClone(state.scenes);
      try {
        for (const placed of entry.forward) runPlaced(working, structuredClone(placed));
      } catch (err) {
        const failure = err as EngineFailure;
        return fail("op-rejected", `redo failed: ${failure.message ?? String(err)}`);
      }
      const bad = await validateWorking(working);
      if (bad) return fail("invalid-result", `redo failed: ${bad}`);
      state.redo.pop();
      state.scenes = working;
      state.revision += 1;
      state.history.push(entry);
      if (state.history.length > MAX_HISTORY) state.history.shift();
      return { ok: true, revision: state.revision };
    },
  };
}
