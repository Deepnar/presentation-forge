import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { caps } from './v2-provider-fixture.js';
export const lookup = submitted => ({ generation: submitted.generation, turnId: submitted.turn.id });
export const targetRequest = (e, input) => ({ ...e.identity, target: { projectId: e.doc.id, ...input } });
export async function targetConfiguration(e) {
  await writeFile(path.join(e.dir, 'agent-host.json'), JSON.stringify({ version: 1, model: 'operator-model', capabilities: caps(), timeoutMs: 3000 }));
  await writeFile(path.join(e.dir, 'models.yaml'), JSON.stringify({ providers: { auto: { type: 'openai-compatible', baseURL: e.baseURL, models: ['operator-model'] } } }));
}
export async function targetCli(t, e, input, { enabled = true, owner = e.owner, raw, extra = [] } = {}) {
  const file = path.join(e.dir, crypto.randomUUID() + '.json'); await writeFile(file, raw ?? JSON.stringify(input));
  const args = ['src/agent/turn-cli.js', 'work-auto', '--project', e.doc.id, '--input', file];
  if (owner !== null) args.push('--owner', owner); args.push(...extra);
  const child = spawn(process.execPath, args, { env: { ...process.env, ...e.env, FORGE_HOSTED: '1',
    FORGE_AGENT_HOST_ENABLED: enabled ? '1' : '0', FORGE_AUTO_API_KEY: 'fixture-private-key', FORGE_SMTP_HOST: '',
    FORGE_OLLAMA_HOST: 'http://127.0.0.1:1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', b => { stdout += b; if (stdout.length > 131073) child.kill('SIGKILL'); });
  child.stderr.on('data', b => { stderr += b; if (stderr.length > 131073) child.kill('SIGKILL'); });
  const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
  const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); }); });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await done; } });
  const result = await done; assert.equal(result.signal, null, stderr);
  return { ...result, stdout, stderr, value: stdout ? JSON.parse(stdout) : null };
}
