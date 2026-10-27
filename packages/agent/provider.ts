import { cloneJson, type Json } from '../tools/json.ts';
import type { ToolRequest } from '../tools/request.generated.ts';
import { semanticToolCatalog, validatedToolRequest, validatedToolResult, type ToolResult } from '../tools/session.ts';
import type { ContextSuccess } from './context.ts';
import { CORE_POLICY } from '../skill/sections.ts';

export type ProviderFamily = 'openai-compatible' | 'anthropic';
export const FEATURES = ['toolCalling', 'structuredOutput', 'vision', 'reasoning', 'files', 'streaming'] as const;
export type Feature = typeof FEATURES[number];
export type ProviderProfile = {
  id: string; family: ProviderFamily; model: string;
  capabilities: Record<Feature, boolean> & { contextChars: number; maxOutputTokens: number };
};
export type ProviderCode = 'invalid-request' | 'unsupported-capability' | 'context-too-large' | 'invalid-response' | 'truncated' | 'unauthorized' | 'rate-limited' | 'provider-unavailable' | 'timeout' | 'cancelled' | 'response-too-large';
export type ProviderFailure = { ok: false; code: ProviderCode; message: string };
export type ProviderExchange = {
  ok: true; providerId: string; family: ProviderFamily; model: string;
  outcome: 'text' | 'tool-calls' | 'refusal'; text: string;
  calls: { id: string; request: ToolRequest }[];
  usage: null | { inputTokens: number; outputTokens: number; cacheReadInputTokens?: number; cacheWriteInputTokens?: number };
};
export type ReadRound = { exchange: ProviderExchange; results: ToolResult[] };
export type ExchangeOptions = { requires?: Feature[]; maxOutputTokens?: number; contextChars?: number; history?: ReadRound[] };
export interface ModelProvider {
  profile: ProviderProfile;
  exchange(context: ContextSuccess, options?: ExchangeOptions & { signal?: AbortSignal }): Promise<ProviderExchange | ProviderFailure>;
}
export const providerFailure = (code: ProviderCode): ProviderFailure => ({ ok: false, code, message: {
  'invalid-request': 'Provide a valid bounded instruction context and exchange options.',
  'unsupported-capability': 'The configured provider does not support a required capability.',
  'context-too-large': 'The request exceeds the configured context budget.',
  'invalid-response': 'The provider returned an invalid or unsupported response; no edit was applied.',
  truncated: 'The provider output was incomplete; no proposed tools were accepted.',
  unauthorized: 'The provider rejected its configured credentials.',
  'rate-limited': 'The provider rate limit was reached; no automatic retry was made.',
  'provider-unavailable': 'The provider request could not complete.',
  timeout: 'The bounded provider request timed out.',
  cancelled: 'The provider request was cancelled.',
  'response-too-large': 'The provider response exceeded its byte limit.',
}[code] });
const integer = (n: unknown, min: number, max: number): n is number => Number.isSafeInteger(n) && Number(n) >= min && Number(n) <= max;
const name = (s: unknown, max = 128): s is string => typeof s === 'string' && s.length > 0 && s.length <= max && !/[\s\x00-\x1f]/u.test(s);
const schemaKey = (value: Json): string => JSON.stringify(value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, schemaKey(value[k])]))
  : Array.isArray(value) ? value.map(schemaKey) : value);
const canonicalSchemas = new Map(semanticToolCatalog().map(t => [t.name, schemaKey(t.inputSchema)]));
const canonicalCatalog = (tools: ContextSuccess['tools']) => tools.every(t => canonicalSchemas.get(t.name) === schemaKey(t.inputSchema));

export function providerProfile(input: unknown): ProviderProfile {
  const p = cloneJson(input, 4096) as unknown as ProviderProfile;
  if (!p || !name(p.id) || !name(p.model) || !['openai-compatible', 'anthropic'].includes(p.family) ||
      Object.keys(p).sort().join(',') !== 'capabilities,family,id,model' || !p.capabilities) throw new Error('Invalid provider configuration.');
  const c = p.capabilities;
  if (Object.keys(c).sort().join(',') !== [...FEATURES, 'contextChars', 'maxOutputTokens'].sort().join(',') ||
      FEATURES.some(f => typeof c[f] !== 'boolean' || (f !== 'toolCalling' && c[f])) ||
      !integer(c.contextChars, 2048, 100000) || !integer(c.maxOutputTokens, 1, 32000)) throw new Error('Invalid provider capabilities.');
  Object.freeze(c); return Object.freeze(p);
}
export type PreparedExchange = { context: ContextSuccess; outputTokens: number; wire: Json };

export function normalizedExchange(profile: ProviderProfile, context: ContextSuccess, input: unknown, outputTokens: number): ProviderExchange | null {
  try {
    const data = cloneJson(input, 262144) as unknown as ProviderExchange;
    if (!data || data.ok !== true || data.providerId !== profile.id || data.family !== profile.family ||
        !name(data.model) || typeof data.text !== 'string' || data.text.length > 32000 ||
        !['text', 'refusal', 'tool-calls'].includes(data.outcome) || !Array.isArray(data.calls) || data.calls.length > 8 ||
        Object.keys(data).sort().join(',') !== 'calls,family,model,ok,outcome,providerId,text,usage') return null;
    const ids = new Set<string>(), allowed = new Set(context.tools.map(t => t.name));
    for (const call of data.calls) {
      if (!call || Object.keys(call).sort().join(',') !== 'id,request' || !name(call.id) || ids.has(call.id)) return null;
      ids.add(call.id);
      const canonical = validatedToolRequest(call.request);
      if (!canonical || !allowed.has(canonical.tool) || canonical.tool === 'edit_content' && canonical.args.baseRevision !== context.revision) return null;
      call.request = canonical;
    }
    if ((data.calls.length > 0) !== (data.outcome === 'tool-calls') || data.outcome === 'text' && !data.text.trim()) return null;
    if (data.usage !== null && (!data.usage || Object.keys(data.usage).some(k => !['inputTokens','outputTokens','cacheReadInputTokens','cacheWriteInputTokens'].includes(k)) ||
        !['inputTokens','outputTokens'].every(k => Object.hasOwn(data.usage!, k)) ||
        Object.values(data.usage).some(v => !integer(v, 0, 100000000)) || data.usage.outputTokens > outputTokens)) return null;
    return data;
  } catch { return null; }
}

function historyMessages(profile: ProviderProfile, context: ContextSuccess, input: ReadRound[]): Json[] | null {
  if (!Array.isArray(input) || input.length > 7) return null;
  const messages: Json[] = [], ids = new Set<string>();
  for (const round of input) {
    if (!round || Object.keys(round).sort().join(',') !== 'exchange,results') return null;
    const response = normalizedExchange(profile, context, round.exchange, profile.capabilities.maxOutputTokens);
    if (!response || response.outcome !== 'tool-calls' || !Array.isArray(round.results) || round.results.length !== response.calls.length) return null;
    const results: ToolResult[] = [];
    for (let i = 0; i < response.calls.length; i++) {
      const call = response.calls[i], result = validatedToolResult(round.results[i]);
      if (call.request.tool === 'edit_content' || ids.has(call.id) || !result?.ok || result.changed ||
          result.tool !== call.request.tool || result.revision !== context.revision) return null;
      ids.add(call.id); results.push(result);
    }
    if (profile.family === 'anthropic') {
      messages.push({ role: 'assistant', content: [
        ...(response.text ? [{ type: 'text', text: response.text }] : []),
        ...response.calls.map(c => ({ type: 'tool_use', id: c.id, name: c.request.tool, input: c.request.args })),
      ] });
      messages.push({ role: 'user', content: results.map((r, i) => ({ type: 'tool_result', tool_use_id: response.calls[i].id, content: JSON.stringify(r) })) });
    } else {
      messages.push({ role: 'assistant', content: response.text || null, tool_calls: response.calls.map(c => ({
        id: c.id, type: 'function', function: { name: c.request.tool, arguments: JSON.stringify(c.request.args) },
      })) });
      messages.push(...results.map((r, i) => ({ role: 'tool', tool_call_id: response.calls[i].id, content: JSON.stringify(r) })));
    }
  }
  return cloneJson(messages, 110000) as Json[];
}

export function prepareExchange(profile: ProviderProfile, input: unknown, options: unknown = {}): PreparedExchange | ProviderFailure {
  try {
    const context = cloneJson(input, 100000) as unknown as ContextSuccess;
    const opts = cloneJson(options, 262144) as ExchangeOptions;
    if (!opts || typeof opts !== 'object' || Array.isArray(opts) || Object.keys(opts).some(k => !['requires', 'maxOutputTokens', 'contextChars', 'history'].includes(k)) ||
        opts.requires !== undefined && (!Array.isArray(opts.requires) || opts.requires.length > FEATURES.length || opts.requires.some(f => !FEATURES.includes(f))) ||
        !context?.ok || !integer(context.revision, 0, Number.MAX_SAFE_INTEGER) ||
        !Array.isArray(context.messages) || context.messages.length !== 2 ||
        context.messages[0]?.role !== 'system' || context.messages[1]?.role !== 'user' ||
        context.messages.some(m => typeof m.content !== 'string' || !m.content.trim()) ||
        !context.messages[0].content.startsWith(CORE_POLICY) ||
        !Array.isArray(context.tools) || context.tools.length < 1 || context.tools.length > 4 ||
        new Set(context.tools.map(t => t.name)).size !== context.tools.length ||
        context.tools.some(t => !['get_project', 'get_slide', 'get_selected_elements', 'edit_content', 'web_search'].includes(t.name) || !t.inputSchema || typeof t.inputSchema !== 'object')) return providerFailure('invalid-request');
    if ([...(opts.requires ?? []), 'toolCalling' as const].some(f => !profile.capabilities[f])) return providerFailure('unsupported-capability');
    const outputTokens = opts.maxOutputTokens ?? profile.capabilities.maxOutputTokens;
    if (!integer(outputTokens, 1, profile.capabilities.maxOutputTokens)) return providerFailure('invalid-request');
    if (context.tools.some(t => t.name === 'web_search') && context.tools.some(t => t.name === 'edit_content')) return providerFailure('invalid-request');
    if (!canonicalCatalog(context.tools)) return providerFailure('invalid-request');
    const contextChars = opts.contextChars ?? profile.capabilities.contextChars;
    if (!integer(contextChars, 2048, profile.capabilities.contextChars)) return providerFailure('invalid-request');
    const history = historyMessages(profile, context, opts.history ?? []);
    if (!history) return providerFailure('invalid-request');
    // The request budget includes provider-specific tool wrappers, not just prompt text.
    const body = profile.family === 'anthropic' ? {
      model: profile.model, system: context.messages[0].content, messages: [context.messages[1], ...history], max_tokens: outputTokens, stream: false,
      tools: context.tools.map(t => ({ name: t.name, input_schema: t.inputSchema })), tool_choice: { type: 'auto', disable_parallel_tool_use: true },
    } : {
      model: profile.model, messages: [...context.messages, ...history], stream: false, n: 1, max_completion_tokens: outputTokens,
      tools: context.tools.map(t => ({ type: 'function', function: { name: t.name, parameters: t.inputSchema } })), tool_choice: 'auto', parallel_tool_calls: false,
    };
    if (JSON.stringify(body).length > contextChars) return providerFailure('context-too-large');
    const wire = cloneJson(body, 110000);
    return { context, outputTokens, wire };
  } catch { return providerFailure('invalid-request'); }
}

// Wire data can propose semantic arguments only. The command engine remains final authority.
export function parseProviderExchange(profile: ProviderProfile, prepared: PreparedExchange, input: unknown): ProviderExchange | ProviderFailure {
  try {
    const raw = cloneJson(input, 262144) as any;
    if (!raw || !name(raw.model) || profile.family === 'anthropic' && raw.role !== 'assistant') return providerFailure('invalid-response');
    let text = '', calls: { id: unknown; name: unknown; args: unknown }[] = [], refusal = false;
    let usage: ProviderExchange['usage'] = null;
    let reason: string;
    if (profile.family === 'openai-compatible') {
      if (!Array.isArray(raw.choices) || raw.choices.length !== 1 || raw.choices[0]?.index !== 0 || raw.choices[0]?.message?.role !== 'assistant') return providerFailure('invalid-response');
      const { message, finish_reason } = raw.choices[0]; reason = finish_reason;
      if (message.function_call != null || message.audio != null || message.reasoning_content) return providerFailure('invalid-response');
      if (reason === 'length') return providerFailure('truncated');
      if (reason === 'content_filter') refusal = true;
      else if (!['stop', 'tool_calls'].includes(reason)) return providerFailure('invalid-response');
      if (message.content !== null && typeof message.content !== 'string') return providerFailure('invalid-response');
      text = message.content ?? '';
      if (message.refusal != null) { if (typeof message.refusal !== 'string') return providerFailure('invalid-response'); refusal = true; text = message.refusal; }
      if (message.tool_calls !== undefined) {
        if (!Array.isArray(message.tool_calls)) return providerFailure('invalid-response');
        calls = message.tool_calls.map((c: any) => {
          if (c?.type !== 'function' || typeof c.function?.arguments !== 'string' || c.function.arguments.length > 65536) throw new Error();
          return { id: c.id, name: c.function.name, args: JSON.parse(c.function.arguments) };
        });
      }
      if (raw.usage != null) {
        const u = raw.usage;
        if (!integer(u.prompt_tokens, 0, 100000000) || !integer(u.completion_tokens, 0, 100000000) ||
            u.total_tokens !== undefined && u.total_tokens !== u.prompt_tokens + u.completion_tokens) throw new Error();
        usage = { inputTokens: u.prompt_tokens, outputTokens: u.completion_tokens };
        if (u.prompt_tokens_details != null) {
          const details = u.prompt_tokens_details;
          if (typeof details !== 'object' || Array.isArray(details)) throw new Error();
          for (const [from, to] of [['cached_tokens', 'cacheReadInputTokens'], ['cache_write_tokens', 'cacheWriteInputTokens']] as const) {
            if (details[from] != null) { if (!integer(details[from], 0, u.prompt_tokens)) throw new Error(); usage[to] = details[from]; }
          }
          if ((usage.cacheReadInputTokens ?? 0) + (usage.cacheWriteInputTokens ?? 0) > usage.inputTokens) throw new Error();
        }
      }
    } else {
      if (raw.type !== 'message' || !Array.isArray(raw.content) || raw.content.length > 32) return providerFailure('invalid-response');
      reason = raw.stop_reason;
      if (reason === 'max_tokens' || reason === 'model_context_window_exceeded') return providerFailure('truncated');
      if (!['end_turn', 'tool_use', 'refusal'].includes(reason)) return providerFailure('invalid-response');
      refusal = reason === 'refusal' || raw.stop_details?.type === 'refusal';
      for (const part of raw.content) {
        if (part?.type === 'text' && typeof part.text === 'string') text += part.text;
        else if (part?.type === 'tool_use') calls.push({ id: part.id, name: part.name, args: part.input });
        else return providerFailure('invalid-response');
      }
      if (raw.usage != null) {
        const u = raw.usage;
        if (!integer(u.input_tokens, 0, 100000000) || !integer(u.output_tokens, 0, 100000000)) throw new Error();
        usage = { inputTokens: u.input_tokens, outputTokens: u.output_tokens };
        for (const [from, to] of [['cache_read_input_tokens', 'cacheReadInputTokens'], ['cache_creation_input_tokens', 'cacheWriteInputTokens']] as const) {
          if (u[from] != null) { if (!integer(u[from], 0, 100000000)) throw new Error(); usage[to] = u[from]; }
        }
        // Anthropic excludes cache reads/writes from input_tokens; Chat Completions includes them.
        usage.inputTokens += (usage.cacheReadInputTokens ?? 0) + (usage.cacheWriteInputTokens ?? 0);
        if (!integer(usage.inputTokens, 0, 100000000)) throw new Error();
      }
    }
    if (text.length > 32000 || calls.length > 8 || new Set(calls.map(c => c.id)).size !== calls.length ||
        calls.some(c => !name(c.id) || !name(c.name)) ||
        calls.length > 0 && !['tool_calls', 'tool_use'].includes(reason) ||
        calls.length === 0 && ['tool_calls', 'tool_use'].includes(reason) ||
        refusal && calls.length > 0 || !refusal && calls.length === 0 && !text.trim() ||
        usage && usage.outputTokens > prepared.outputTokens) return providerFailure('invalid-response');
    if (!canonicalCatalog(prepared.context.tools)) return providerFailure('invalid-response');
    const allowed = new Set(prepared.context.tools.map(t => t.name));
    const normalized = calls.map(c => {
      if (typeof c.name !== 'string' || !allowed.has(c.name)) throw new Error();
      const request = validatedToolRequest({ tool: c.name, args: c.args });
      if (!request) throw new Error();
      if (request.tool === 'edit_content' && request.args.baseRevision !== prepared.context.revision) throw new Error();
      return { id: c.id as string, request };
    });
    return { ok: true, providerId: profile.id, family: profile.family, model: raw.model, outcome: refusal ? 'refusal' : calls.length ? 'tool-calls' : 'text', text, calls: normalized, usage };
  } catch { return providerFailure('invalid-response'); }
}
