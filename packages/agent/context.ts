import type { ToolSession } from '../tools/session.ts';
import { cloneJson, type Json } from '../tools/json.ts';
import { CORE_POLICY, instructionSection } from '../skill/sections.ts';

export type ContextFailure = { ok: false; code: 'invalid-context' | 'context-too-large' | 'tool-refused' | 'stale-context'; message: string };
export type ContextSuccess = {
  ok: true;
  revision: number;
  messages: { role: 'system' | 'user'; content: string }[];
  tools: { name: string; inputSchema: Json }[];
  skillIds: string[];
  measure: { chars: number; estimatedTokens: number; tokenEstimateMethod: 'ceil(chars/4)' };
};
const fail = (code: ContextFailure['code'], message: string): ContextFailure => ({ ok: false, code, message });

// Context is acquired through the same scoped tools, never supplied as a raw scene.
// Model content is isolated in a user data message; policy has no caller override.
export async function composeInstructions({ session, request, reads, maxChars = 24000 }: {
  session: ToolSession; request: string; reads: unknown; maxChars?: number;
}): Promise<ContextSuccess | ContextFailure> {
  if (!Number.isSafeInteger(maxChars) || maxChars < 2048 || maxChars > 100000) return fail('invalid-context', 'Invalid context budget.');
  if (typeof request !== 'string' || !request.trim() || request.length > maxChars) return fail('invalid-context', 'Provide a nonempty bounded user request.');
  let queries: Json;
  try { queries = cloneJson(reads, Math.min(maxChars, 16000)); }
  catch { return fail('invalid-context', 'Context reads must be bounded JSON data.'); }
  if (!Array.isArray(queries) || queries.length < 1 || queries.length > 4 || queries.some(q => !q || typeof q !== 'object' || Array.isArray(q) || !['get_project', 'get_slide', 'get_selected_elements'].includes(String(q.tool)))) return fail('invalid-context', 'Choose one to four read-only context queries.');
  try {
    const section = instructionSection(session.mode), tools = session.catalog();
    const context: Json[] = [];
    let revision: number | null = null;
    const messages = () => [{ role: 'system' as const, content: `${CORE_POLICY}\n\n${section.text}` }, { role: 'user' as const, content: JSON.stringify({ request, context }) }];
    const size = () => JSON.stringify({ messages: messages(), tools }).length;
    if (size() > maxChars) return fail('context-too-large', 'Policy, tools and request exceed the context budget.');
    for (const query of queries) {
      const result = await session.execute(query);
      if (!result.ok) return fail('tool-refused', 'A scoped context read was refused.');
      if (revision !== null && result.revision !== revision) return fail('stale-context', 'The document changed during context acquisition.');
      revision = result.revision;
      context.push({ query, revision: result.revision, data: result.data });
      if (size() > maxChars) return fail('context-too-large', 'Content exceeds the context budget. Request a smaller page or selection.');
    }
    if (revision === null || session.revision() !== revision) return fail('stale-context', 'The document changed during context acquisition.');
    const chars = size();
    return { ok: true, revision, messages: messages(), tools, skillIds: [section.id], measure: { chars, estimatedTokens: Math.ceil(chars / 4), tokenEstimateMethod: 'ceil(chars/4)' } };
  } catch { return fail('tool-refused', 'Context could not be acquired from the authoritative document.'); }
}
