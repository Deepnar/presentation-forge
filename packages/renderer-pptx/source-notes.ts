import JSZip from 'jszip';
import type { SlideScene, SceneElement } from '../model/scene.generated.ts';

export interface SourceNotesReference {
  sceneIndex: number;
  citationIndex: number;
  title: string;
  url: string;
}
export interface QualifiedSourceNotes {
  scenes: readonly SlideScene[];
  title: string;
  references: readonly SourceNotesReference[];
}
export interface NativeEmitter {
  addText(...args: unknown[]): void;
  addShape(...args: unknown[]): void;
  addImage(...args: unknown[]): void;
  addChart(...args: unknown[]): void;
  addTable(...args: unknown[]): void;
}
export const SOURCE_NOTES_NOTICE = 'Complete retained source notes; claim support not assessed. Long notes may overflow printed notes pages.';
const encoder = new TextEncoder();
function invalid(): never { throw Object.assign(new Error('Source notes could not be safely rendered.'), { code: 'notes-unsafe' }); }
function capacity(): never { throw Object.assign(new Error('Complete source notes exceed the export limit.'), { code: 'notes-capacity' }); }
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export function sourceNotesSnapshot(input: QualifiedSourceNotes): QualifiedSourceNotes {
  const value = structuredClone(input);
  if (!value || Object.keys(value).sort().join(',') !== 'references,scenes,title' || typeof value.title !== 'string' ||
    !Array.isArray(value.scenes) || !value.scenes.length || value.scenes.length > 120 || !Array.isArray(value.references)) invalid();
  let index = 0;
  for (let si = 0; si < value.scenes.length; si++) {
    for (let ci = 0; ci < (value.scenes[si].citations?.length ?? 0); ci++) {
      const ref = value.references[index++];
      if (!ref || Object.keys(ref).sort().join(',') !== 'citationIndex,sceneIndex,title,url' ||
        ref.sceneIndex !== si || ref.citationIndex !== ci || typeof ref.title !== 'string' || !ref.title.length ||
        ref.title.length > 500 || typeof ref.url !== 'string' || ref.url.length > 2000) invalid();
      literal(ref.title); literal(ref.url);
      const url = new URL(ref.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.href !== ref.url) invalid();
    }
  }
  if (index !== value.references.length || index > 512) invalid();
  return freeze(value);
}

// Literal fields cannot become notes headings, directions or executable markup.
export function literal(value: string): string {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) invalid();
    } else if (c >= 0xdc00 && c <= 0xdfff || c === 0xfffe || c === 0xffff) invalid();
  }
  return JSON.stringify(value).replace(/[\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g,
    c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}
const decode = (value: string): string => value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g, v => {
  const named: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
  return named[v] ?? String.fromCodePoint(Number(v.startsWith('&#x') ? '0x' + v.slice(3, -1) : v.slice(2, -1)));
});
function attrs(tag: string): Record<string, string> {
  return Object.fromEntries([...tag.matchAll(/([\w:]+)="([^"]*)"/g)].map(m => [m[1], decode(m[2])]));
}
function relationships(xml: string): Record<string, string>[] {
  return [...xml.matchAll(/<Relationship\b[^>]*\/>/g)].map(m => attrs(m[0]));
}
function targetPath(base: string, target: string): string {
  const out: string[] = [];
  for (const part of (target.startsWith('/') ? target.slice(1) : base + target).split('/')) {
    if (part === '..') { if (!out.length) invalid(); out.pop(); }
    else if (part && part !== '.') out.push(part);
  }
  return out.join('/');
}
export class SourceNotesTrace {
  private readonly rows: { names: string[]; targets: Map<SceneElement, string[]>; notes: string }[];
  private readonly snapshot: QualifiedSourceNotes;
  constructor(snapshot: QualifiedSourceNotes) {
    this.snapshot = snapshot;
    this.rows = snapshot.scenes.map(() => ({ names: [], targets: new Map(), notes: '' }));
  }
  emitter(slide: NativeEmitter, index: number, scope: readonly SceneElement[]): NativeEmitter {
    const row = this.rows[index];
    const call = (method: keyof NativeEmitter, args: unknown[]): void => {
      const name = `S${index + 1}-O${row.names.length + 1}`;
      const options = args.at(-1);
      if (!options || typeof options !== 'object' || Array.isArray(options)) invalid();
      row.names.push(name);
      for (const element of scope) {
        const names = row.targets.get(element) ?? []; names.push(name); row.targets.set(element, names);
      }
      args[args.length - 1] = { ...options, objectName: name };
      slide[method](...args);
    };
    return {
      addText: (...args) => call('addText', args), addShape: (...args) => call('addShape', args),
      addImage: (...args) => call('addImage', args), addChart: (...args) => call('addChart', args),
      addTable: (...args) => call('addTable', args),
    };
  }
  notes(index: number): string {
    const scene = this.snapshot.scenes[index], row = this.rows[index];
    const references = this.snapshot.references.filter(r => r.sceneIndex === index);
    if (!references.length) return '';
    const elements = new Map<string, SceneElement[]>();
    const stack = [...scene.elements];
    while (stack.length) {
      const e = stack.pop()!, prior = elements.get(e.id) ?? []; prior.push(e); elements.set(e.id, prior);
      stack.push(...(e.group?.children ?? []));
    }
    const lines = [SOURCE_NOTES_NOTICE];
    for (const ref of references) {
      const citation = scene.citations![ref.citationIndex];
      let target = `Slide ${index + 1}`;
      if (citation.target.kind === 'slide' && !row.targets.size) invalid();
      if (citation.target.kind === 'element') {
        const matches = elements.get(citation.target.elementId) ?? [];
        if (matches.length !== 1) invalid();
        const names = row.targets.get(matches[0]);
        if (!names?.length) invalid();
        target += ' / ' + names.join(', ');
      }
      const number = this.snapshot.references.indexOf(ref) + 1;
      lines.push(`C${number} — ${target}`, `Title: ${literal(ref.title)}`, `URL: ${literal(ref.url)}`);
    }
    const notes = lines.join('\n');
    if (encoder.encode(notes).length > 1048576) capacity();
    row.notes = notes;
    if (this.rows.reduce((n, r) => n + encoder.encode(r.notes).length, 0) > 4194304) capacity();
    return notes;
  }
  async verify(bytes: Uint8Array): Promise<void> {
    if (this.rows.reduce((n, r) => n + encoder.encode(r.notes).length, 0) > 4194304) capacity();
    const zip = await JSZip.loadAsync(bytes);
    const text = async (name: string): Promise<string> => { const part = zip.file(name); if (!part) invalid(); return part.async('string'); };
    const slides = zip.file(/^ppt\/slides\/slide\d+\.xml$/);
    if (slides.length !== this.rows.length) invalid();
    const presentation = await text('ppt/presentation.xml');
    const rels = relationships(await text('ppt/_rels/presentation.xml.rels'));
    const ids = [...presentation.matchAll(/<p:sldId\b[^>]*\/>/g)].map(m => attrs(m[0])['r:id']);
    if (ids.length !== this.rows.length) invalid();
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i], slideName = `ppt/slides/slide${i + 1}.xml`;
      const relation = rels.filter(r => r.Id === ids[i]);
      if (relation.length !== 1 || relation[0].TargetMode || targetPath('ppt/', relation[0].Target) !== slideName) invalid();
      const xml = await text(slideName);
      const objects = [...xml.matchAll(/<p:cNvPr\b[^>]*>/g)].map(m => attrs(m[0]));
      const names = objects.map(o => o.name).filter(Boolean), objectIds = objects.map(o => o.id);
      if (names.length !== row.names.length || new Set(names).size !== names.length ||
        row.names.some(n => !names.includes(n)) || new Set(objectIds).size !== objectIds.length) invalid();
      const slideRelations = relationships(await text(`ppt/slides/_rels/slide${i + 1}.xml.rels`));
      const notesRelations = slideRelations.filter(r => r.Type.endsWith('/notesSlide'));
      if (notesRelations.length !== 1 || notesRelations[0].TargetMode) invalid();
      const notesPath = targetPath('ppt/slides/', notesRelations[0].Target), notesXml = await text(notesPath);
      const body = [...notesXml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].find(m => /<p:ph\b[^>]*\btype="body"/.test(m[0]));
      if (!body) invalid();
      const actual = [...body[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m => decode(m[1])).join('').replace(/\r\n?/g, '\n');
      if (actual !== row.notes) invalid();
      const notesRels = relationships(await text(notesPath.replace(/([^/]+)$/, '_rels/$1.rels')));
      const back = notesRels.filter(r => r.Type.endsWith('/slide'));
      if (back.length !== 1 || back[0].TargetMode || targetPath('ppt/notesSlides/', back[0].Target) !== slideName) invalid();
      if (notesRelations.some(r => r.TargetMode) || notesRels.some(r => r.TargetMode)) invalid();
    }
  }
}
