import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_FILES, checkGit, requiredTestFiles, run } from '../tools/dev-protocol-check.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const shipped = JSON.parse(readFileSync(path.join(ROOT, 'docs/development-state.json'), 'utf8'));

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'forge-protocol-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const state = structuredClone(shipped);
  // Each negative starts from pending fixture state, independent of whether the
  // repository currently has retained evidence or an acceptance decision.
  state.acceptedBaseline.sha = '1'.repeat(40);
  state.acceptedBaseline.provenance = 'human-supplied-baseline';
  state.implementationHead.sha = '2'.repeat(40);
  Object.assign(state.activeMilestone, { accepted: false, reviewStatus: 'pending', reviewRecord: null,
    implementationStatus: 'implemented-pending-validation' });
  for (const item of state.validation) Object.assign(item, { status: 'unexecuted', evidence: null, reason: 'Fixture pending' });
  const refs = [...REQUIRED_FILES, ...Object.values(state.docs), state.activeMilestone.evalDoc,
    state.activeMilestone.architectureDoc, state.acceptedBaseline.source.split('#')[0]];
  for (const ref of new Set(refs)) {
    const target = path.join(dir, ref);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(path.join(ROOT, ref), target);
  }
  const save = () => writeFileSync(path.join(dir, 'docs/development-state.json'), JSON.stringify(state));
  const check = () => { save(); return run(dir, { verifyGit: false }); };
  const evidence = (overrides = {}) => {
    const item = state.validation[0];
    item.status = 'passed'; item.evidence = 'docs/result.json';
    const files = requiredTestFiles(dir, item.id) ?? [];
    writeFileSync(path.join(dir, 'docs/output.tap'), '# tests 26\n# pass 26\n# fail 0\n# skipped 0\n# cancelled 0\n' + files.map(file => `# forge-test-file ${JSON.stringify(file)}\n`).join(''));
    const data = { id: item.id, implementationSha: state.implementationHead.sha, command: 'node --test fixture.test.js',
      kind: 'tests', log: 'docs/output.tap', exitCode: 0,
      tests: { total: 26, pass: 26, fail: 0, skip: 0, cancelled: 0 }, ...overrides };
    writeFileSync(path.join(dir, 'docs/result.json'), JSON.stringify(data));
  };
  return { dir, state, save, check, evidence };
}

const hasError = (result, pattern) => assert.ok(result.errors.some(e => pattern.test(e)), result.errors.join('\n'));

test('repository state, document references and real Git ancestry validate', () => {
  assert.deepEqual(run(ROOT), { errors: [], warnings: [] });
});
test('missing required role document fails closed', t => {
  const f = fixture(t); rmSync(path.join(f.dir, 'docs/agents/REVIEWER.md'));
  hasError(f.check(), /REVIEWER/);
});
test('malformed state JSON returns diagnostics instead of crashing', t => {
  const f = fixture(t); writeFileSync(path.join(f.dir, 'docs/development-state.json'), '{');
  hasError(run(f.dir, { verifyGit: false }), /state JSON/);
});
test('unknown review state, malformed SHA and extra properties are rejected', t => {
  const f = fixture(t); f.state.activeMilestone.reviewStatus = 'green'; f.state.acceptedBaseline.sha = '97a12de'; f.state.acceptAll = true;
  const result = f.check(); assert.ok(result.errors.length >= 3);
});
test('known pending validation cannot disappear or be duplicated', t => {
  const f = fixture(t); f.state.validation.pop(); hasError(f.check(), /schema/);
  f.state.validation.push(f.state.validation[0]); hasError(f.check(), /duplicate validation/);
});
test('unaccepted implementation cannot replace the accepted baseline', t => {
  const f = fixture(t); f.state.acceptedBaseline.sha = f.state.implementationHead.sha;
  hasError(f.check(), /baseline replaced/);
});
test('passed validation needs existing matching evidence and its output log', t => {
  const f = fixture(t); f.state.validation[0].status = 'passed';
  hasError(f.check(), /without evidence/);
  f.state.validation[0].evidence = 'docs/missing.json'; hasError(f.check(), /missing.json/);
  f.evidence(); assert.deepEqual(f.check().errors, []);
  rmSync(path.join(f.dir, 'docs/output.tap')); hasError(f.check(), /output.*log|output.tap/);
});
test('stale evidence from another implementation SHA is refused', t => {
  const f = fixture(t); f.evidence({ implementationSha: f.state.acceptedBaseline.sha });
  hasError(f.check(), /SHA/);
});
test('self-reported totals must match the retained test output', t => {
  const f = fixture(t); f.evidence({ tests: { total: 27, pass: 27, fail: 0, skip: 0, cancelled: 0 } });
  hasError(f.check(), /disagree with output log/);
});
test('nonzero, cancelled, skipped and inconsistent totals never become passes', t => {
  const f = fixture(t);
  for (const data of [
    { exitCode: 1 },
    { tests: { total: 1, pass: 0, fail: 0, skip: 0, cancelled: 1 } },
    { tests: { total: 1, pass: 0, fail: 0, skip: 1, cancelled: 0 } },
    { tests: { total: 2, pass: 1, fail: 0, skip: 0, cancelled: 0 } },
  ]) { f.evidence(data); assert.ok(f.check().errors.length > 0); }
});
test('existing output cannot substitute for actual visual inspection or 50 benchmark cells', t => {
  const f = fixture(t);
  f.evidence({ kind: 'command' }); hasError(f.check(), /kind does not match/);
  const original = f.state.validation[0].id;
  f.state.validation[0].id = 'frontend-visual'; f.state.validation[8].id = original;
  f.evidence({ kind: 'visual', inspected: false }); hasError(f.check(), /not been inspected/);
  f.state.validation[0].id = 'benchmark-50'; f.state.validation[7].id = 'frontend-visual';
  f.evidence({ kind: 'benchmark', cells: 49 }); hasError(f.check(), /50 cells/);
});
test('renaming a reviewer cannot substitute for a separate decision record', t => {
  const f = fixture(t); f.state.activeMilestone.reviewStatus = 'accepted'; f.state.activeMilestone.accepted = true;
  hasError(f.check(), /decision record/);
  f.state.activeMilestone.reviewRecord = 'docs/review.json';
  writeFileSync(path.join(f.dir, 'docs/review.json'), JSON.stringify({ decision: 'ACCEPT',
    implementationSha: f.state.implementationHead.sha, kind: 'independent-review', reviewer: 'second name',
    context: f.state.activeMilestone.implementedBy, evidence: 'docs/DECISIONS.md' }));
  hasError(f.check(), /separate reviewer/);
});
test('legitimate recorded acceptance can advance the baseline after completed validation', t => {
  const f = fixture(t); f.evidence();
  const source = JSON.parse(readFileSync(path.join(f.dir, 'docs/result.json'), 'utf8'));
  for (const item of f.state.validation) {
    item.status = 'passed'; item.evidence = `docs/${item.id}.json`;
    const kind = item.id === 'benchmark-50' ? 'benchmark' : item.id === 'frontend-visual' ? 'visual' :
      ['typecheck', 'production-build'].includes(item.id) ? 'command' : 'tests';
    const log = `docs/${item.id}.tap`;
    writeFileSync(path.join(f.dir, log), '# tests 26\n# pass 26\n# fail 0\n# skipped 0\n# cancelled 0\n' + (kind === 'tests' ? requiredTestFiles(f.dir, item.id).map(file => `# forge-test-file ${JSON.stringify(file)}\n`).join('') : ''));
    writeFileSync(path.join(f.dir, item.evidence), JSON.stringify({ ...source, id: item.id, kind, log, cells: 50, inspected: true }));
  }
  f.state.activeMilestone.reviewStatus = 'accepted'; f.state.activeMilestone.accepted = true;
  f.state.activeMilestone.implementationStatus = 'validated'; f.state.activeMilestone.reviewRecord = 'docs/review.json';
  f.state.acceptedBaseline.sha = f.state.implementationHead.sha; f.state.acceptedBaseline.provenance = 'independent-review';
  writeFileSync(path.join(f.dir, 'docs/review.json'), JSON.stringify({ decision: 'ACCEPT', implementationSha: f.state.implementationHead.sha,
    kind: 'independent-review', reviewer: 'fixture reviewer', context: 'separate-context', evidence: 'docs/DECISIONS.md' }));
  assert.deepEqual(f.check().errors, []);
  f.state.validation[0].status = 'unexecuted'; hasError(f.check(), /completed validation/);
  const failed = f.state.validation[0];
  failed.status = 'failed';
  writeFileSync(path.join(f.dir, 'docs/failed.tap'), '# tests 26\n# pass 25\n# fail 1\n# skipped 0\n# cancelled 0\n' + requiredTestFiles(f.dir, failed.id).map(file => `# forge-test-file ${JSON.stringify(file)}\n`).join(''));
  writeFileSync(path.join(f.dir, failed.evidence), JSON.stringify({ ...source, id: failed.id,
    exitCode: 1, log: 'docs/failed.tap', tests: { total: 26, pass: 25, fail: 1, skip: 0, cancelled: 0 } }));
  hasError(f.check(), /completed validation/);
  const reviewFile = path.join(f.dir, 'docs/review.json');
  const review = JSON.parse(readFileSync(reviewFile, 'utf8'));
  review.waivers = [{ checkId: failed.id, standingFailureId: f.state.standingFailures[0].id,
    reason: 'Fixture: independently acknowledged standing failure', evidence: 'docs/DECISIONS.md' }];
  writeFileSync(reviewFile, JSON.stringify(review));
  assert.deepEqual(f.check().errors, []);
  failed.status = 'unexecuted'; hasError(f.check(), /invalid standing-failure waiver/);
});
test('document paths, anchors and symlinks cannot leave the repository or point nowhere', t => {
  const f = fixture(t); f.state.docs.protocol = '../outside.md'; hasError(f.check(), /invalid repository path/);
  f.state.docs.protocol = 'docs/ROADMAP.md#missing-anchor'; hasError(f.check(), /missing anchor/);
  f.state.docs.protocol = 'docs/external.md'; symlinkSync('/etc/hosts', path.join(f.dir, 'docs/external.md'));
  hasError(f.check(), /leaves repository/);
});
test('Git verification rejects well-shaped nonexistent commits', () => {
  const state = structuredClone(shipped); state.implementationHead.sha = '0'.repeat(40);
  hasError(checkGit(ROOT, state), /not a local commit/);
});

test('a passing subset cannot substitute for the full required file scope', t => {
  const f = fixture(t); f.evidence();
  f.state.validation[1].status = 'passed'; f.state.validation[1].evidence = 'docs/subset.json';
  const source = JSON.parse(readFileSync(path.join(f.dir, 'docs/result.json'), 'utf8'));
  writeFileSync(path.join(f.dir, 'docs/subset.json'), JSON.stringify({ ...source, id: 'non-browser-bulk' }));
  hasError(f.check(), /complete required scope/);
});
test('name-filtered runs and implausibly small suite counts fail closed', t => {
  const f = fixture(t); f.evidence({ command: 'node --test --test-name-pattern=one test/v2-edit-chrome-7a.test.js' });
  hasError(f.check(), /filtered test runs/);
  f.evidence({ tests: { total: 1, pass: 1, fail: 0, skip: 0, cancelled: 0 } });
  hasError(f.check(), /below required suite inventory/);
});
