#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv from 'ajv';

export const REQUIRED_FILES = [
  'AGENTS.md', 'docs/DEVELOPMENT-PROTOCOL.md', 'docs/PRODUCT-VISION.md',
  'docs/ACCEPTANCE-CRITERIA.md', 'docs/DECISIONS.md', 'docs/CONTINUATION.md',
  'docs/agents/PLANNER.md', 'docs/agents/IMPLEMENTER.md', 'docs/agents/REVIEWER.md',
  'docs/development-state.json', 'docs/development-state.schema.json',
  'docs/ROADMAP.md', 'docs/HANDOFF.md', 'docs/ARCHITECTURE.md',
  'docs/v2-7a-evidence/validation-plan.json',
];
const SHA = /^[0-9a-f]{40}$/;
const COUNTS = ['total', 'pass', 'fail', 'skip', 'cancelled'];
const KINDS = {
  '7a-chrome': 'tests', 'conversion-import': 'tests', 'browser-handoff': 'tests', 'project-covers': 'tests', 'project-catalog': 'tests', 'editor-toolbar': 'tests', 'agent-foundation': 'tests', 'durable-runtime': 'tests', 'model-provider': 'tests', 'provider-run': 'tests', 'tool-conversation': 'tests', 'search-provider': 'tests', 'native-pptx': 'tests', 'turn-approval': 'tests', 'non-browser-bulk': 'tests', 'serial-browser': 'tests',
  'conversation-http': 'tests', 'turn-worker': 'tests', 'turn-discovery': 'tests', 'postgres-contract': 'tests', 'cross-process-faults': 'tests',
  'production-build': 'command', typecheck: 'command',
  'benchmark-50': 'benchmark', 'frontend-visual': 'visual',
};

const MILESTONES = {
  'V2-8I-4': {
    plan: 'docs/v2-8i-4-evidence/validation-plan.json',
    focused: 'turn-discovery',
    files: ['test/v2-turn-discovery-8i.test.js', 'test/v2-turn-discovery-sqlite-8i.test.js', 'test/v2-turn-discovery-postgres-8i.test.js', 'test/v2-turn-discovery-process-8i.test.js'],
  },
  'V2-8I-3': {
    plan: 'docs/v2-8i-3-evidence/validation-plan.json',
    focused: 'conversation-http',
    files: ['test/v2-conversation-http-8i.test.js', 'test/v2-conversation-http-postgres-8i.test.js'],
  },
  'V2-8I-2': {
    plan: 'docs/v2-8i-2-evidence/validation-plan.json',
    focused: 'turn-worker',
    files: ['test/v2-turn-worker-sqlite-8i.test.js', 'test/v2-turn-worker-postgres-8i.test.js', 'test/v2-turn-worker-process-8i.test.js'],
  },
  'V2-8I-1': {
    plan: 'docs/v2-8i-1-evidence/validation-plan.json',
    focused: 'conversation-http',
    files: ['test/v2-conversation-http-8i.test.js', 'test/v2-conversation-http-postgres-8i.test.js'],
  },
  'V2-8H': {
    plan: 'docs/v2-8h-evidence/validation-plan.json',
    focused: 'turn-approval',
    files: ['test/v2-turns-8h.test.js', 'test/v2-turns-sqlite-8h.test.js', 'test/v2-turns-postgres-8h.test.js', 'test/v2-turns-process-8h.test.js'],
  },
  'V2-PPTX-ID': {
    plan: 'docs/v2-pptx-id-evidence/validation-plan.json',
    focused: 'native-pptx',
    files: ['test/dev-protocol.test.js', 'test/v2-native-ids.test.js', 'test/v2-renderer-pptx.test.js', 'test/v2-scene-pptx.test.js', 'test/v2-export-preflight-5a.test.js', 'test/v2-chart-edit.test.js', 'test/v2-table-edit.test.js', 'test/v2-tables-3f4.test.js', 'test/v2-typography-4b.test.js', 'test/v2-engine-5b.test.js', 'test/v2-style-5e.test.js', 'test/v2-text-5d.test.js', 'test/v2-textformat-5f.test.js', 'test/v2-layers-5j.test.js', 'test/v2-layers-5j1.test.js', 'test/v2-slides-5i.test.js', 'test/v2-projects-6a.test.js', 'test/v2-projects-6b.test.js', 'test/v2-tools-8a.test.js'],
    required: ['native-pptx', 'typecheck', 'benchmark-50', 'frontend-visual'],
  },
  'V2-8G': {
    plan: 'docs/v2-8g-evidence/validation-plan.json',
    focused: 'model-provider',
    files: ['test/v2-provider-stream-8g.test.js', 'test/v2-provider-8c.test.js', 'test/v2-provider-durable-8c.test.js', 'test/v2-provider-postgres-8c.test.js'],
  },
  'V2-8F': {
    plan: 'docs/v2-8f-evidence/validation-plan.json',
    focused: 'search-provider',
    files: ['test/v2-search-8f.test.js', 'test/v2-search-http-8f.test.js'],
  },
  'V2-8E': {
    plan: 'docs/v2-8e-evidence/validation-plan.json',
    focused: 'tool-conversation',
    files: ['test/v2-conversation-8e.test.js', 'test/v2-conversation-sqlite-8e.test.js', 'test/v2-conversation-postgres-8e.test.js'],
  },
  'V2-8D': {
    plan: 'docs/v2-8d-evidence/validation-plan.json',
    focused: 'provider-run',
    files: ['test/v2-provider-run-8d.test.js', 'test/v2-provider-run-sqlite-8d.test.js', 'test/v2-provider-run-postgres-8d.test.js'],
  },
  'V2-8C': {
    plan: 'docs/v2-8c-evidence/validation-plan.json',
    focused: 'model-provider',
    files: ['test/v2-provider-8c.test.js', 'test/v2-provider-durable-8c.test.js', 'test/v2-provider-postgres-8c.test.js'],
  },
  'V2-8B': {
    plan: 'docs/v2-8b-evidence/validation-plan.json',
    focused: 'durable-runtime',
    files: ['test/v2-runtime-8b.test.js', 'test/v2-runtime-process-8b.test.js', 'test/v2-runtime-postgres-8b.test.js'],
  },
  'V2-8A': {
    plan: 'docs/v2-8a-evidence/validation-plan.json',
    focused: 'agent-foundation',
    files: ['test/v2-tools-8a.test.js', 'test/v2-context-8a.test.js'],
  },
  'V2-7C-3': {
    plan: 'docs/v2-7c-3-evidence/validation-plan.json',
    focused: 'editor-toolbar',
    files: ['test/v2-editor-toolbar-chrome-7c.test.js', 'test/v2-edit-chrome-7a.test.js'],
  },
  'V2-7C-2': {
    plan: 'docs/v2-7c-2-evidence/validation-plan.json',
    focused: 'project-catalog',
    files: ['test/v2-project-catalog-7c.test.js', 'test/v2-project-catalog-http-7c.test.js', 'test/v2-project-catalog-chrome-7c.test.js'],
  },
  'V2-7A': {
    plan: 'docs/v2-7a-evidence/validation-plan.json',
    focused: '7a-chrome',
    files: ['test/v2-edit-chrome-7a.test.js'],
  },
  'V2-7B-1': {
    plan: 'docs/v2-7b-1-evidence/validation-plan.json',
    focused: 'conversion-import',
    files: ['test/v2-import-conversion-7b.test.js', 'test/v2-import-service-7b.test.js', 'test/v2-import-http-7b.test.js'],
  },
  'V2-7B-2': {
    plan: 'docs/v2-7b-2-evidence/validation-plan.json',
    focused: 'browser-handoff',
    files: ['test/v2-handoff-7b.test.js', 'test/v2-handoff-chrome-7b.test.js'],
  },
  'V2-7C-1': {
    plan: 'docs/v2-7c-1-evidence/validation-plan.json',
    focused: 'project-covers',
    files: ['test/v2-project-covers-7c.test.js', 'test/v2-project-covers-http-7c.test.js', 'test/v2-project-covers-chrome-7c.test.js'],
  },
};

export function requiredTestFiles(root, id, milestoneId = 'V2-7A') {
  const milestone = MILESTONES[milestoneId];
  if (!milestone) throw new Error('unknown milestone validation contract');
  const plan = readJson(path.join(root, milestone.plan));
  const groups = {
    [milestone.focused]: milestone.files,
    'non-browser-bulk': plan.bulk,
    'serial-browser': plan.serial,
    'postgres-contract': milestoneId === 'V2-7A'
      ? ['test/v2-projects-6c-postgres.test.js']
      : ['test/v2-projects-6c-postgres.test.js', 'test/v2-import-postgres-7b.test.js'],
    'cross-process-faults': ['test/v2-projects-6c-concurrency.test.js', 'test/v2-projects-6c-faults.test.js'],
  };
  return groups[id];
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function reference(root, ref, errors, label) {
  const [name, anchor, ...extra] = ref.split('#');
  const full = path.resolve(root, name);
  if (!name || extra.length || path.isAbsolute(name) || name.includes('\\') ||
      path.relative(root, full).startsWith('..') || full === root) {
    errors.push(`${label}: invalid repository path ${ref}`);
    return null;
  }
  try {
    const actual = realpathSync(full);
    const relative = path.relative(realpathSync(root), actual);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !statSync(actual).isFile()) {
      throw new Error('reference leaves repository or is not a file');
    }
    if (anchor) {
      const text = readFileSync(actual, 'utf8');
      const explicit = text.includes(`id="${anchor}"`) || text.includes(`id='${anchor}'`);
      const heading = text.split('\n').filter(line => /^#{1,6} /.test(line)).some(line =>
        line.replace(/^#+ /, '').toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu, '').replace(/ /g, '-') === anchor);
      if (!explicit && !heading) throw new Error(`missing anchor #${anchor}`);
    }
    return actual;
  } catch (error) {
    errors.push(`${label}: ${ref}: ${error.message}`);
    return null;
  }
}

export function checkSchema(root, state) {
  try {
    const ajv = new Ajv({ allErrors: true, strict: true });
    const validate = ajv.compile(readJson(path.join(root, 'docs/development-state.schema.json')));
    return validate(state) ? [] : validate.errors.map(e => `schema ${e.instancePath || '/'}: ${e.message}`);
  } catch (error) {
    return [`state schema: ${error.message}`];
  }
}

function checkEvidence(root, state, item, errors) {
  if (!item.evidence) {
    if (['passed', 'failed', 'skipped', 'cancelled'].includes(item.status)) {
      errors.push(`${item.id}: ${item.status} without evidence`);
    }
    return;
  }
  const file = reference(root, item.evidence, errors, `${item.id} evidence`);
  if (!file) return;
  try {
    const data = readJson(file);
    if (data.id !== item.id || data.implementationSha !== state.implementationHead.sha ||
        typeof data.command !== 'string' || !data.command.trim() ||
        data.kind !== KINDS[item.id]) {
      throw new Error('evidence id, implementation SHA, command or kind does not match');
    }
    const log = typeof data.log === 'string' && reference(root, data.log, errors, `${item.id} log`);
    if (!log) {
      throw new Error('existing output/review log required');
    }
    if (!Number.isInteger(data.exitCode) || data.exitCode < 0 || data.exitCode > 255) {
      throw new Error('invalid exitCode');
    }
    if (data.kind === 'tests') {
      if (!data.tests || COUNTS.some(k => !Number.isInteger(data.tests[k]) || data.tests[k] < 0) ||
          data.tests.total === 0 || data.tests.total !== COUNTS.slice(1).reduce((n, k) => n + data.tests[k], 0)) {
        throw new Error('inconsistent or missing test totals');
      }
      if (item.status === 'passed' && (data.tests.fail || data.tests.cancelled || data.tests.skip)) {
        throw new Error('failed, cancelled or skipped tests cannot be marked passed');
      }
      const output = readFileSync(log, 'utf8');
      const observed = [...output.matchAll(/^# forge-test-file (.+)$/gm)].map(match => JSON.parse(match[1]));
      const required = requiredTestFiles(root, item.id, state.activeMilestone.id);
      if (required.some(file => !observed.includes(file)) || observed.some(file => !required.includes(file))) {
        throw new Error('executed test files do not cover the complete required scope');
      }
      if (/--test-(?:name-pattern|skip-pattern|only|shard)\b/.test(data.command)) {
        throw new Error('filtered test runs cannot satisfy a complete regression gate');
      }
      const minimum = { '7a-chrome': 28, 'postgres-contract': 17, 'cross-process-faults': 19 }[item.id] ?? 1;
      if (data.tests.total < minimum) throw new Error('test count below required suite inventory');
      for (const [key, label] of [['total', 'tests'], ['pass', 'pass'], ['fail', 'fail'], ['skip', 'skipped'], ['cancelled', 'cancelled']]) {
        const matches = [...output.matchAll(new RegExp(`^(?:#|ℹ) ${label} (\\d+)\\s*$`, 'gm'))];
        if (!matches.length || matches.reduce((sum, match) => sum + Number(match[1]), 0) !== data.tests[key]) {
          throw new Error(`test totals disagree with output log: ${key}`);
        }
      }
    }
    if (item.status === 'passed' && data.exitCode !== 0) throw new Error('nonzero exit marked passed');
    if (item.status === 'failed' && data.exitCode === 0) throw new Error('failed check has zero exit');
    if (item.status === 'passed' && data.kind === 'visual' && data.inspected !== true) {
      throw new Error('visual evidence has not been inspected');
    }
    if (item.status === 'passed' && data.kind === 'benchmark' && data.cells !== 50) {
      throw new Error('canonical benchmark requires 50 cells');
    }
  } catch (error) {
    errors.push(`${item.id}: ${error.message}`);
  }
}

export function checkSemantics(root, state) {
  const errors = [];
  const ids = state.validation.map(item => item.id);
  if (new Set(ids).size !== ids.length) errors.push('duplicate validation id');
  const milestone = state.activeMilestone;
  const contract = MILESTONES[milestone.id];
  if (!contract) errors.push('unknown milestone validation contract');
  else {
    reference(root, contract.plan, errors, 'validation plan');
    const focusedIds = Object.values(MILESTONES).map(value => value.focused);
    const requiredIds = contract.required ?? Object.keys(KINDS).filter(id => !focusedIds.includes(id)).concat(contract.focused);
    if (requiredIds.some(id => !ids.includes(id)) || ids.some(id => !requiredIds.includes(id))) {
      errors.push('validation inventory does not match the milestone contract');
    }
  }
  for (const [name, ref] of Object.entries(state.docs)) reference(root, ref, errors, `docs.${name}`);
  for (const key of ['roadmapRef', 'evalDoc', 'architectureDoc']) {
    reference(root, milestone[key], errors, `activeMilestone.${key}`);
  }
  reference(root, state.acceptedBaseline.source, errors, 'baseline source');
  reference(root, state.nextCandidate.roadmapRef, errors, 'next candidate');
  for (const failure of state.standingFailures) reference(root, failure.source, errors, failure.id);
  for (const item of state.validation) checkEvidence(root, state, item, errors);

  const accepted = milestone.reviewStatus === 'accepted';
  const waivedChecks = new Set();
  if (milestone.accepted !== accepted) errors.push('accepted flag and review status disagree');
  if (state.acceptedBaseline.sha === state.implementationHead.sha && !accepted) {
    errors.push('accepted baseline replaced by unaccepted implementation HEAD');
  }
  if (accepted || milestone.reviewStatus === 'held') {
    if (!milestone.reviewRecord) errors.push('review decision requires a committed decision record');
    else {
      const file = reference(root, milestone.reviewRecord, errors, 'review record');
      if (file) try {
        const review = readJson(file);
        if (review.decision !== (accepted ? 'ACCEPT' : 'HOLD') ||
            review.implementationSha !== state.implementationHead.sha ||
            !['human-approval', 'independent-review'].includes(review.kind) ||
            typeof review.reviewer !== 'string' || !review.reviewer.trim() ||
            typeof review.context !== 'string' || !review.context.trim() ||
            review.context === milestone.implementedBy || review.reviewer === milestone.implementedBy) {
          throw new Error('review must identify the exact SHA and a separate reviewer/context');
        }
        if (typeof review.evidence !== 'string') throw new Error('supporting review evidence missing');
        reference(root, review.evidence, errors, 'review evidence');
        if (accepted && (state.acceptedBaseline.sha !== review.implementationSha ||
            state.acceptedBaseline.provenance !== review.kind)) throw new Error('accepted baseline disagrees with review');
        for (const waiver of review.waivers ?? []) {
          const item = state.validation.find(entry => entry.id === waiver.checkId);
          if (!item || item.status !== 'failed' || waivedChecks.has(item.id) ||
              !state.standingFailures.some(failure => failure.id === waiver.standingFailureId) ||
              typeof waiver.reason !== 'string' || !waiver.reason.trim() ||
              typeof waiver.evidence !== 'string') throw new Error('invalid standing-failure waiver');
          reference(root, waiver.evidence, errors, 'waiver evidence');
          waivedChecks.add(item.id);
        }
      } catch (error) { errors.push(`review record: ${error.message}`); }
    }
  } else if (milestone.reviewRecord !== null) errors.push('pending review cannot carry a decision record');
  if (accepted && (milestone.implementationStatus !== 'validated' ||
      state.validation.some(item => item.status !== 'passed' && !waivedChecks.has(item.id)))) {
    errors.push('acceptance requires completed validation; standing failures need a recorded review waiver, not a pass');
  }
  return { errors, warnings: [] };
}

export function checkGit(root, state) {
  const errors = [];
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try { git(['rev-parse', '--is-inside-work-tree']); }
  catch { return { errors, warnings: ['Git unavailable: commit existence/ancestry not verified'] }; }
  for (const [label, sha] of [['accepted baseline', state.acceptedBaseline.sha], ['implementation', state.implementationHead.sha]]) {
    if (!SHA.test(sha)) continue;
    try { git(['rev-parse', '--verify', `${sha}^{commit}`]); }
    catch { errors.push(`${label} is not a local commit: ${sha}`); }
  }
  for (const [from, to, label] of [
    [state.acceptedBaseline.sha, state.implementationHead.sha, 'implementation does not descend from baseline'],
    [state.implementationHead.sha, 'HEAD', 'checkout does not contain implementation under validation'],
  ]) {
    try { git(['merge-base', '--is-ancestor', from, to]); }
    catch { errors.push(label); }
  }
  return { errors, warnings: [] };
}

export function run(root, { verifyGit = true } = {}) {
  root = path.resolve(root);
  const errors = [];
  for (const name of REQUIRED_FILES) reference(root, name, errors, 'required file');
  let state;
  try { state = readJson(path.join(root, 'docs/development-state.json')); }
  catch (error) { return { errors: [...errors, `state JSON: ${error.message}`], warnings: [] }; }
  const schemaErrors = checkSchema(root, state);
  if (schemaErrors.length) return { errors: [...errors, ...schemaErrors], warnings: [] };
  const semantic = checkSemantics(root, state);
  const git = verifyGit ? checkGit(root, state) : { errors: [], warnings: [] };
  return { errors: [...errors, ...semantic.errors, ...git.errors], warnings: [...semantic.warnings, ...git.warnings] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--root')) {
    console.error('Usage: node tools/dev-protocol-check.mjs [--root <repository>]');
    process.exitCode = 1;
  } else {
    const root = args[1] ?? fileURLToPath(new URL('..', import.meta.url));
    const result = run(root);
    for (const warning of result.warnings) console.warn(`warning: ${warning}`);
    for (const error of result.errors) console.error(`error: ${error}`);
    console.log(`dev-protocol-check: ${result.errors.length} error(s), ${result.warnings.length} warning(s)`);
    process.exitCode = result.errors.length ? 1 : 0;
  }
}
