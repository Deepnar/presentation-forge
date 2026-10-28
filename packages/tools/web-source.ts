import { readFile } from 'node:fs/promises';
import { Ajv } from 'ajv';
import { cloneJson } from './json.ts';
import { webSourceId } from '../model/source-identity.ts';
import type { WebSource } from './result.generated.ts';
export type { WebSource };
const schema = JSON.parse(await readFile(new URL('./result.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv({ strict: false }).compile<WebSource>(schema.definitions.WebSource);

// The canonical search result owns shape; every consumer shares its identity rules.
export function parsedWebSource(input: unknown, projectId: string, providerId?: string): WebSource | null {
  try {
    const copy: unknown = JSON.parse(JSON.stringify(cloneJson(input)));
    if (!validate(copy) || copy.projectId !== projectId || providerId !== undefined && copy.searchProvider !== providerId ||
      copy.id !== webSourceId(copy) || !Number.isFinite(Date.parse(copy.retrievedAt))) return null;
    const url = new URL(copy.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.href !== copy.url) return null;
    return copy;
  } catch { return null; }
}
export function sameWebMeaning(a: WebSource, b: WebSource): boolean {
  return a.projectId === b.projectId && a.url === b.url && a.title === b.title && a.excerpt === b.excerpt &&
    (a.publishedAt ?? '') === (b.publishedAt ?? '');
}
export function canonicalWebSource(source: WebSource): WebSource {
  return { id: source.id, projectId: source.projectId, kind: 'web', title: source.title, url: source.url,
    excerpt: source.excerpt, searchProvider: source.searchProvider, retrievedAt: source.retrievedAt,
    ...(source.publishedAt !== undefined ? { publishedAt: source.publishedAt } : {}) };
}
