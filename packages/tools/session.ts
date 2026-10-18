import { readFile } from 'node:fs/promises';
import { Ajv } from 'ajv';
import type { EditorHandle, PlacedOp } from '../model/engine.ts';
import type { SceneElement, SlideScene } from '../model/scene.generated.ts';
import type { ToolResult as WireToolResult, ElementProjection } from './result.generated.ts';
import type { ToolRequest } from './request.generated.ts';
import { cloneJson, type Json } from './json.ts';

const schema = JSON.parse(await readFile(new URL('./request.schema.json', import.meta.url), 'utf8'));
const validateResult = new Ajv({ strict: false }).compile<WireToolResult>(JSON.parse(await readFile(new URL('./result.schema.json', import.meta.url), 'utf8')));
const validate = new Ajv({ strict: false, allErrors: false }).compile(schema);
const MESSAGES = {
  forbidden: 'This project is not available to this caller.',
  'invalid-input': 'Provide a valid content-tool request within its input limits.',
  'budget-exceeded': 'The tool budget is exhausted or the requested result is too large. Request less context.',
  'unknown-slide': 'The requested slide is not available in this scope.',
  'unknown-element': 'The requested element is not available in this scope.',
  'not-editable': 'This target is not granted for this content edit.',
  locked: 'Locked, hidden or protected content cannot be edited by this tool.',
  'stale-revision': 'The document changed. Read its current content and revision before editing.',
  'duplicate-id': 'This call identifier has already been applied.',
  'invalid-edit': 'The edit does not match the existing content structure.',
  'engine-refused': 'The command engine refused this edit; no tool edit was committed.',
  unavailable: 'The authoritative document is unavailable.',
} as const;
export type ToolCode = keyof typeof MESSAGES;
export type ToolFailure = Extract<WireToolResult, { ok: false }>;
export type ToolSuccess = Extract<WireToolResult, { ok: true }>;
type ToolName = ToolSuccess['tool'];
type DataFor<T extends ToolName> = Extract<ToolSuccess, { tool: T }>['data'];
export type ToolResult = ToolFailure | ToolSuccess;
export type Target = { slideId: string; elementId: string };
export interface ToolBinding {
  document: EditorHandle;
  projectId: string;
  ownerId: string;
  actorId: string;
  agentId: string;
  mode: 'inspect' | 'edit';
  readableSlides: string[];
  editableTargets: Target[];
  selection: Target[];
  limits?: { maxCalls?: number; inputChars?: number; outputChars?: number };
}
export interface ToolSession {
  execute(request: unknown, callId?: string): Promise<ToolResult>;
  catalog(): { name: string; inputSchema: Json }[];
  readonly mode: 'inspect' | 'edit';
  revision(): number | null;
}
const failure = (code: ToolCode): ToolFailure => ({ ok: false, code, message: MESSAGES[code] });
const keyOf = ({ slideId, elementId }: Target) => JSON.stringify([slideId, elementId]);
const validId = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 128;
function bound(value: number | undefined, fallback: number, min: number, max: number) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('Invalid trusted tool limit');
  return value;
}
function flatten(elements: SceneElement[], protectedParent = false): { element: SceneElement; protected: boolean }[] {
  return elements.flatMap(element => {
    const protectedHere = protectedParent || element.locked === true || element.hidden === true;
    return [{ element, protected: protectedHere }, ...flatten(element.group?.children ?? [], protectedHere)];
  });
}
function projectElement(element: SceneElement, protectedTarget: boolean, editable: boolean): ElementProjection {
  const base = { elementId: element.id, locked: protectedTarget, editable, hidden: element.hidden === true };
  if (element.kind === 'text') return { ...base, kind: 'text', paragraphs: (element.paragraphs ?? []).map(p => ({ runs: p.runs.map(r => ({ text: r.text })) })) };
  if (element.kind === 'chart') return { ...base, kind: 'chart', chart: element.chart ? { chartKind: element.chart.chartKind, categories: [...element.chart.categories], series: element.chart.series.map(s => ({ name: s.name, values: [...s.values] })) } : null };
  if (element.kind === 'table') return { ...base, kind: 'table', table: element.table ? { header: element.table.header ?? null, rows: element.table.rows.map(r => [...r]) } : null };
  return { ...base, kind: element.kind };
}

// Authority is supplied by the application, not parsed from a model request.
// The injected handle is the same live document the human editor owns.
export function createToolSession(binding: ToolBinding): ToolSession {
  for (const value of [binding.projectId, binding.ownerId, binding.actorId, binding.agentId]) if (!validId(value)) throw new Error('Invalid trusted tool identity');
  if (!['inspect', 'edit'].includes(binding.mode)) throw new Error('Invalid trusted tool mode');
  const { document, projectId, ownerId, actorId, agentId, mode } = binding;
  const readable = new Set(binding.readableSlides);
  if ([...readable].some(id => !validId(id))) throw new Error('Invalid trusted slide grant');
  const targets = structuredClone(binding.editableTargets), selection = structuredClone(binding.selection);
  if ([...targets, ...selection].some(t => !validId(t.slideId) || !validId(t.elementId))) throw new Error('Invalid trusted target grant');
  const editable = new Set(targets.filter(t => readable.has(t.slideId)).map(keyOf));
  const maxCalls = bound(binding.limits?.maxCalls, 32, 1, 256);
  const inputChars = bound(binding.limits?.inputChars, 65536, 1024, 131072);
  const outputChars = bound(binding.limits?.outputChars, 16000, 1024, 64000);
  let calls = 0;
  const authorized = ownerId === actorId;
  function ok<T extends ToolName>(tool: T, revision: number, data: DataFor<T>, changed = false): ToolSuccess {
    const result = { ok: true, tool, revision, changed, preserved: ['geometry', 'styling', 'untargeted-content', 'tombstones'], warnings: [], data };
    if (!validateResult(result) || !result.ok) throw new Error('Invalid internal tool result');
    return result;
  }
  const fits = (r: ToolResult) => validateResult(r) && JSON.stringify(r).length <= outputChars;
  const inScope = (target: Target) => readable.has(target.slideId);
  function locate(scenes: SlideScene[], target: Target) {
    if (!inScope(target)) return null;
    const scene = scenes.find(s => s.id === target.slideId);
    const found = scene && flatten(scene.elements).find(row => row.element.id === target.elementId);
    return found ? { scene, ...found } : null;
  }
  return Object.freeze({
    mode: mode === 'edit' && editable.size > 0 ? 'edit' : 'inspect',
    revision: () => authorized ? document.status().revision : null,
    catalog() {
      if (!authorized) return [];
      return schema.oneOf.filter((branch: { properties: { tool: { const: string } } }) => branch.properties.tool.const !== 'edit_content' || (mode === 'edit' && editable.size > 0)).map((branch: { properties: { tool: { const: string }; args: unknown } }) => ({ name: branch.properties.tool.const, inputSchema: cloneJson(branch.properties.args) }));
    },
    async execute(input: unknown, callId?: string): Promise<ToolResult> {
      if (!authorized) return failure('forbidden');
      if (++calls > maxCalls) return failure('budget-exceeded');
      let request: ToolRequest;
      try { const copy = cloneJson(input, inputChars); if (!validate(copy)) return failure('invalid-input'); request = copy as ToolRequest; }
      catch { return failure('invalid-input'); }
      try {
        const { scenes, revision } = document.snapshot();
        let result: ToolSuccess;
        if (request.tool === 'get_project') {
          const slides = scenes.filter(s => readable.has(s.id)), offset = request.args.offset ?? 0, limit = request.args.limit ?? 20;
          result = ok('get_project', revision, { projectId, total: slides.length, slides: slides.slice(offset, offset + limit).map(s => ({ slideId: s.id, position: scenes.indexOf(s) + 1, elementCount: flatten(s.elements).length, layoutState: s.layoutState })), nextOffset: offset + limit < slides.length ? offset + limit : null });
        } else if (request.tool === 'get_slide') {
          const { slideId } = request.args;
          const scene = readable.has(slideId) && scenes.find(s => s.id === slideId);
          if (!scene) return failure('unknown-slide');
          const rows = flatten(scene.elements), offset = request.args.offset ?? 0, limit = request.args.limit ?? 20;
          result = ok('get_slide', revision, { slideId, total: rows.length, elements: rows.slice(offset, offset + limit).map(r => projectElement(r.element, r.protected, mode === 'edit' && editable.has(keyOf({slideId, elementId:r.element.id})) && !r.protected)), nextOffset: offset + limit < rows.length ? offset + limit : null });
        } else if (request.tool === 'get_selected_elements') {
          if (selection.length > 32) return failure('budget-exceeded');
          const rows = selection.map(t => ({ target: t, found: locate(scenes, t) }));
          if (rows.some(r => !r.found)) return failure('unknown-element');
          result = ok('get_selected_elements', revision, { elements: rows.map(r => ({ slideId: r.target.slideId, element: projectElement(r.found!.element, r.found!.protected, mode === 'edit' && editable.has(keyOf(r.target)) && !r.found!.protected) })) });
        } else {
          if (mode !== 'edit' || !validId(callId)) return failure('not-editable');
          if (request.args.baseRevision !== revision) return failure('stale-revision');
          const ops: PlacedOp[] = [], edits = new Map<string, { element: SceneElement; paragraphs: SceneElement['paragraphs']; cells: Set<string> }>();
          const touched = new Set<string>();
          for (const edit of request.args.edits) {
            const key = keyOf(edit);
            if (!editable.has(key) || !inScope(edit)) return failure('not-editable');
            const found = locate(scenes, edit);
            if (!found) return failure('unknown-element');
            if (found.protected) return failure('locked');
            if (found.element.kind !== edit.kind) return failure('invalid-edit');
            // Cell structure owns resolved layout; content tools cannot reflow it.
            if (edit.kind === 'table' && (!found.element.table || edit.rows.length !== found.element.table.rows.length || edit.rows.some((row, i) => row.length !== found.element.table!.rows[i].length))) return failure('invalid-edit');
            if (edit.kind === 'text') {
              if (touched.has(key) && !edits.has(key)) return failure('invalid-edit');
              const patch = edits.get(key) ?? { element: found.element, paragraphs: structuredClone(found.element.paragraphs), cells: new Set<string>() };
              const cell = `${edit.paragraphIndex}:${edit.runIndex}`, run = patch.paragraphs?.[edit.paragraphIndex]?.runs[edit.runIndex];
              if (!run || patch.cells.has(cell)) return failure('invalid-edit');
              run.text = edit.text; patch.cells.add(cell); edits.set(key, patch);
            } else {
              if (touched.has(key)) return failure('invalid-edit');
              ops.push({ slideId: edit.slideId, op: edit.kind === 'chart' ? { type: 'element.setChartData', id: edit.elementId, chart: { categories: edit.categories, series: edit.series } } : { type: 'element.setTableData', id: edit.elementId, table: { rows: edit.rows } } });
            }
            touched.add(key);
          }
          for (const [key, patch] of edits) ops.push({ slideId: (JSON.parse(key) as string[])[0], op: { type: 'element.updateText', id: patch.element.id, paragraphs: patch.paragraphs! } });
          const data: DataFor<'edit_content'> = { edited: [...touched].map(key => { const [slideId, elementId] = JSON.parse(key); return { slideId, elementId }; }) };
          // Refuse oversized acknowledgements before committing any edit.
          if (!fits(ok('edit_content', revision + 1, data, false))) return failure('budget-exceeded');
          const applied = await document.applyBatch({ id: callId, actor: 'agent', agentId, baseRevision: request.args.baseRevision, ops });
          if (!applied.ok) return failure(applied.code === 'stale-revision' || applied.code === 'duplicate-id' || applied.code === 'locked' ? applied.code : 'engine-refused');
          return ok('edit_content', applied.revision, data, !applied.noop);
        }
        return fits(result) ? result : failure('budget-exceeded');
      } catch { return failure('unavailable'); }
    },
  });
}
