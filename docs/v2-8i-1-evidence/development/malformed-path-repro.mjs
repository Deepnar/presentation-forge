import assert from 'node:assert/strict';
import express from 'express';
import { installConversationBodyParser, registerV2ConversationRoutes } from '../../../app/server/v2-conversation-routes.js';
const app = express();
installConversationBodyParser(app);
app.use(express.json({ limit: '8mb' }));
registerV2ConversationRoutes(app);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
try {
  const result = await fetch(`http://127.0.0.1:${server.address().port}${process.argv[2] ?? '/api/v2/projects/DO_NOT_ECHO%E0%A4%A/conversation'}`);
  const text = await result.text();
  console.log(JSON.stringify({ status: result.status, cacheControl: result.headers.get('cache-control'), contentType: result.headers.get('content-type'), echoesFixture: text.includes('DO_NOT_ECHO') }));
  assert.equal(result.status, Number(process.argv[3] ?? 400));
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  assert.equal(text.includes('DO_NOT_ECHO'), false);
  assert.equal(JSON.parse(text).code, Number(process.argv[3] ?? 400) === 404 ? 'not-found' : 'invalid-request');
} finally { await new Promise(resolve => server.close(resolve)); }
