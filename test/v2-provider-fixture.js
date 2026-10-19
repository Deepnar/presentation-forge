import { createServer } from 'node:http';
import { createModelProvider } from '../src/agent/model-provider.js';
import { composeInstructions } from '../packages/agent/context.ts';
import { rig, edit } from './v2-tool-fixture.js';
export const caps = () => ({ toolCalling: true, structuredOutput: false, vision: false, reasoning: false, files: false, streaming: false, contextChars: 100000, maxOutputTokens: 2048 });
export function wire(family, requests = [edit()]) {
  return family === 'anthropic' ? { id: 'msg-1', type: 'message', role: 'assistant', model: 'fixture-resolved-model', stop_reason: 'tool_use', content: requests.map((r,i) => ({ type: 'tool_use', id: `call-${i}`, name: r.tool, input: r.args })), usage: { input_tokens: 42, output_tokens: 20, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 } }
    : { model: 'fixture-resolved-model', choices: [{ index: 0, finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: requests.map((r,i) => ({ id: `call-${i}`, type: 'function', function: { name: r.tool, arguments: JSON.stringify(r.args) } })) } }], usage: { prompt_tokens: 42, completion_tokens: 20, total_tokens: 62 } };
}
export async function context(overrides = {}) {
  const { tools, document } = await rig(overrides);
  return { document, context: await composeInstructions({ session: tools, request: 'Review the selected text and measured data.', reads: [{ tool: 'get_selected_elements', args: {} }] }) };
}
export async function endpoint(t, family, handler, overrides = {}) {
  const seen = []; let notify;
  const arrived = new Promise(r => { notify = r; });
  const server = createServer(async (req,res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    seen.push({ url: req.url, headers: req.headers, body: JSON.parse(body) }); notify();
    if (handler) return handler(req,res,seen.at(-1));
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(wire(family)));
  });
  await new Promise(r => server.listen(0,'127.0.0.1',r));
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); });
  const provider = createModelProvider({ family, id: 'fixture-provider', model: 'operator-model', baseURL: `http://127.0.0.1:${server.address().port}/v1`, apiKey: 'fixture-private-key', capabilities: caps(), ...overrides });
  return { provider, seen, arrived };
}
