import { createHash } from 'node:crypto';

// Retrieval time, query and backend rank do not change a snippet's meaning.
export function webSourceId(source: { projectId: string; url: string; title: string; excerpt: string; publishedAt?: string }): string {
  return 'src_' + createHash('sha256').update(JSON.stringify(['forge-web-source-v1', source.projectId,
    source.url, source.title, source.excerpt, source.publishedAt ?? ''])).digest('hex');
}
