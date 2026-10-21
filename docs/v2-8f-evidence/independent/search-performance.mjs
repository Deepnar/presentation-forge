import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createSearxngSearchProvider } from '../../../src/agent/search-provider.js';
const root = 'docs/v2-8f-evidence/independent';
const sha = JSON.parse(await readFile(`docs/v2-8f-evidence/validation-plan.json`, 'utf8')).implementationSha;
let requests = 0;
const server = createServer(async (req, res) => {
  let body = ''; for await (const chunk of req) body += chunk;
  const query = new URLSearchParams(body).get('q'), count = Number(query);
  assert.ok([1,20,1000].includes(count)); requests++;
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ results: Array.from({ length: count }, (_, i) => ({
    title: `Research ${i}`, url: `https://source-${i}.example.org/review`, content: 'A bounded public research excerpt.' })) }));
});
server.listen(0,'127.0.0.1'); await once(server,'listening');
try {
  const provider = createSearxngSearchProvider({ baseURL: `http://127.0.0.1:${server.address().port}` });
  const samples = [];
  for (const candidates of [1,20,1000]) {
    let prior;
    for (let i=0;i<10;i++) {
      const at = performance.now(), result = await provider.search({ projectId: 'search-performance-fixture' }, { query: String(candidates), limit: 20 });
      const durationMs = performance.now()-at;
      assert.equal(result.ok,true); assert.equal(result.sources.length,Math.min(candidates,20));
      const ids = result.sources.map(s=>s.id); if (prior) assert.deepEqual(ids,prior); prior=ids;
      samples.push({ candidates, iteration:i+1, durationMs, sources:result.sources.length, resultChars:JSON.stringify(result).length, warnings:result.warnings });
    }
  }
  assert.equal(requests,30);
  await writeFile(`${root}/search-performance.json`,JSON.stringify({implementationSha:sha,backend:'Actual loopback SearXNG HTTP protocol fixture',requests,samples,
    limitation:'Local sequential samples, not live SearXNG relevance/provider quality or production percentiles; retrieval metadata excluded from citation identity.'},null,2)+'\n');
  console.log('30 actual HTTP searches passed across1/20/1000candidate responses; IDs stable across retrievals.');
} finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
