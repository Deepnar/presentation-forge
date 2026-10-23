import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTurnSubmission, TURN_LIMITS } from '../packages/agent/turn-state.ts';
import { spec } from './v2-runtime-fixture.js';
const input = () => ({ generation: 'server-generation', revision: 0, requestKey: 'client-1',
  projectRevision: 0, scope: spec().scope, request: 'Review wording.',
  reads: [{ tool: 'get_slide', args: { slideId: 's1' } }], contextChars: 100000,
  maxOutputTokens: 2048, limits: { maxExchanges: 8, maxToolCalls: 32, maxOutputTokensTotal: 16384 } });
test('turn submission requires explicit generation and revision; authority fields refuse', () => {
  assert.equal(parseTurnSubmission(input()).request, 'Review wording.');
  for (const key of ['generation', 'revision']) { const bad = input(); delete bad[key]; assert.throws(() => parseTurnSubmission(bad)); }
  for (const extra of [{ owner: 'foreign' }, { deadlineAt: Date.now()+9999999 }, { plan: spec() }])
    assert.throws(() => parseTurnSubmission({ ...input(), ...extra }));
});
test('turn admission preserves existing stricter bounds and refuses oversized visible input', () => {
  assert.throws(() => parseTurnSubmission({ ...input(), request: 'x'.repeat(16001) }));
  assert.throws(() => parseTurnSubmission({ ...input(), limits: { ...input().limits, maxExchanges: 9 } }));
  assert.equal(TURN_LIMITS.privateBytes, 4*1024*1024);
  assert.equal(TURN_LIMITS.settlements, 128);
});

test('submission rejects accessors, executable objects and duplicate scope without invoking them', () => {
  let invoked=0;const accessor={...input()};Object.defineProperty(accessor,'request',{enumerable:true,get(){invoked++;return 'unsafe';}});
  assert.throws(()=>parseTurnSubmission(accessor));assert.equal(invoked,0);
  assert.throws(()=>parseTurnSubmission({...input(),scope:{...input().scope,readableSlides:['s1','s1']}}));
  assert.throws(()=>parseTurnSubmission({...input(),revision:Number.MAX_SAFE_INTEGER+1}));
});

test('metadata schemas reject unbounded accounting maps and inconsistent attempt settlements', async () => {
  const {parseHeader,parseAttempt}=await import('../packages/agent/turn-state.ts');
  const accounting={reservedOutputTokens:0,knownInputTokens:0,knownOutputTokens:0,knownCacheReadTokens:0,knownCacheWriteTokens:0,knownAttempts:0,unknownAttempts:0};
  const header={version:1,generation:'server-generation',revision:0,createdAt:1,updatedAt:1,accounting};
  assert.deepEqual(parseHeader(header),header);
  assert.throws(()=>parseHeader({...header,accounting:{...accounting,models:{}}}));
  assert.throws(()=>parseHeader({...header,accounting:{...accounting,knownAttempts:-1}}));
  const attempt={version:1,id:'attempt',turnId:'turn',generation:'server-generation',fence:1,step:0,reservedOutputTokens:100,state:'dispatched',
    providerId:'fixture',family:'openai-compatible',model:'fixture',configurationDigest:'0'.repeat(64),instructionsVersion:'forge-context-v1',
    catalogVersion:'semantic-tools-v1',createdAt:1,settleBy:120001,usage:null};
  assert.deepEqual(parseAttempt(attempt),attempt);
  assert.throws(()=>parseAttempt({...attempt,settleBy:120002}));
  assert.throws(()=>parseAttempt({...attempt,state:'known'}));
  assert.throws(()=>parseAttempt({...attempt,state:'known',usage:{inputTokens:1,outputTokens:101,cacheReadInputTokens:0,cacheWriteInputTokens:0}}));
});
