import { execFileSync } from 'node:child_process';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { convertGeneratedDeck } from '../../src/projects/legacy-conversion.js';

const priorSha = '90faf8140c76d6bf95f72aff6baa6147df20ee2c';
const file = new URL(`../../src/projects/.preservation-probe-${randomBytes(8).toString('hex')}.mjs`, import.meta.url);
const records = [];
try {
  const historicalSource = execFileSync('git', ['show', `${priorSha}:src/projects/legacy-conversion.js`], { encoding: 'utf8' });
  await writeFile(file, historicalSource, { flag: 'wx' });
  const prior = (await import(file.href)).convertGeneratedDeck;
  const cases = [
    ['stat association', { title: 'Groups', slides: [{ type: 'stats', headline: 'Groups', stats: [{ value: '10', label: 'Treatment', sub: 'Only adults' }, { value: '20', label: 'Control', sub: 'Only children' }] }] }, intent => {
      assert.equal(intent.slides[0].blocks.length, 2);
      assert.equal(intent.slides[0].blocks[0].label, 'Treatment\nOnly adults');
      assert.equal(intent.slides[0].blocks[1].label, 'Control\nOnly children');
    }],
    ['context membership', { title: 'Method', sections: ['Method'], slides: [{ type: 'flow', headline: 'Method', section: 0, steps: [{ title: 'Start' }, { title: 'Finish' }] }] }, intent => {
      assert.equal(intent.slides[0].blocks.filter(block => block.kind === 'text').length, 2);
      assert.equal(intent.slides[0].blocks[0].emphasis, 'context');
    }],
    ['before/after identity', { title: 'Change', slides: [{ type: 'before-after', headline: 'Change', before: { title: 'Enrollment', body: '10' }, after: { title: 'Enrollment', body: '20' } }] }, intent => {
      assert.equal(intent.slides[0].blocks[0].label, 'Before: Enrollment');
      assert.equal(intent.slides[0].blocks[1].label, 'After: Enrollment');
    }],
  ];
  for (const [name, deck, check] of cases) {
    const old = await prior(deck), current = await convertGeneratedDeck(deck);
    let reproduced = false;
    try { check(old.intent); } catch (error) { if (error.code !== 'ERR_ASSERTION') throw error; reproduced = true; }
    assert.ok(reproduced, `historical defect reproduced: ${name}`); check(current.intent);
    records.push({ name, historicalDefectReproduced: true, correctedAssertionsPass: true, before: old.intent.slides[0].blocks, after: current.intent.slides[0].blocks });
  }
  await mkdir('out/v2-7b-1-validation', { recursive: true });
  await writeFile('out/v2-7b-1-validation/preservation-regressions.json', `${JSON.stringify({ historicalSource: priorSha, currentSource: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), records }, null, 2)}\n`);
  console.log('Three historical preservation defects reproduced; corrected assertions pass. Not added to Node test totals.');
} finally { await rm(file, { force: true }); }
