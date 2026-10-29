import { createReadStream } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { closeDb } from '../db.js';
import { projectStore } from './backend.js';
import { createProjectCopier, COPY_INPUT_BYTES } from './copy.js';
import { copyOwnerForToken } from './copy-auth.js';

let usedStore;
export async function copyCli(argv) {
  const [id,option,file,...extra] = [...argv];
  const token = process.env.FORGE_PROJECT_TOKEN, supplied = token !== undefined;
  if (!id || option !== '--input' || !file || extra.length)
    return { ok: false, code: 'invalid-request', message: 'Usage: copy-project <source-id> --input <file|->' };
  try {
    const owner = await copyOwnerForToken(token,supplied);
    const chunks = []; let size = 0;
    for await (const chunk of file === '-' ? process.stdin : createReadStream(file)) {
      size += chunk.length;
      if (size > COPY_INPUT_BYTES) return { ok: false, code: 'capacity-exceeded', message: 'Copy input is too large.' };
      chunks.push(chunk);
    }
    let request;
    try { request = JSON.parse(new TextDecoder('utf-8',{ fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks))); }
    catch { return { ok: false, code: 'invalid-request', message: 'Copy input must be UTF-8 JSON.' }; }
    usedStore = await projectStore();
    return await createProjectCopier(usedStore).copy({ id, owner },request);
  } catch (error) {
    const code = ['unauthorized','email-unverified'].includes(error?.code) ? error.code : 'storage-unavailable';
    return { ok: false, code, message: code === 'storage-unavailable' ? 'Copy input or storage is unavailable.' : error.message };
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await copyCli(process.argv.slice(2));
    process.stdout.write(JSON.stringify(result) + '\n');
    if (!result.ok) process.exitCode = 1;
  } finally { await usedStore?.closeProjectStore(); closeDb(); }
}
