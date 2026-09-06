import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { defaultConfig } from '../src/config/schema.js';
import { FileTaskStore } from '../src/core/store.js';
import { CqbService } from '../src/core/service.js';
import type { DesktopController } from '../src/reviewer/clipboard.js';
import type { VerificationRunner } from '../src/verification/runner.js';

class FakeDesktop implements DesktopController {
  clipboard = '';
  actions: string[] = [];
  target = { processName: 'chrome', title: 'CQB Reviewer - ChatGPT', processId: 42, windowHandle: '1001' };
  async openUrl() { this.actions.push('open'); }
  async findTarget() { return this.target; }
  async focus() { this.actions.push('focus'); return true; }
  async getForegroundTarget() { return this.target; }
  async pasteVerified() { this.actions.push('composer', 'paste'); return true; }
  async sendVerified() { this.actions.push('composer', 'send'); return true; }
  async setClipboard(value: string) { this.clipboard = value; this.actions.push('clipboard'); }
  async getClipboard() { return this.clipboard; }
  async notify() { this.actions.push('notify'); }
}

function localConfig() {
  const config = structuredClone(defaultConfig);
  config.reviewer.browserProvider = 'local';
  return config;
}

const passingVerification: VerificationRunner = {
  async run() {
    return {
      changedFiles: ['src/worker.ts', 'tests/worker.test.ts'], diffInspected: true,
      diff: { statusHash: '', workingTreeHash: '', stagedHash: '', statusLines: 2 },
      validation: { tests: 'pass', typecheck: 'pass', lint: 'pass', build: 'pass' }, commands: [],
    };
  },
};

test('mocked difficult task completes through one expert review and verification', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cqb-flow-'));
  const store = new FileTaskStore(root);
  const desktop = new FakeDesktop();
  const service = new CqbService(localConfig(), store, desktop, () => '2026-09-05T00:00:00.000Z', passingVerification);
  const started = await service.status({ taskId: 'demo-task', goal: 'Fix worker race', workspaceRoot: root });
  assert.equal(started.state, 'EXECUTING');

  const first = await service.shouldEscalate('demo-task', {
    confidence: 0.8, failures: 1, reason: 'locking attempt failed', evidence: ['test worker A failed'],
  });
  assert.equal(first.decision.escalate, false);

  const second = await service.shouldEscalate('demo-task', {
    confidence: 0.4, failures: 2, reason: 'queue attempt failed', evidence: ['test worker A failed', 'runtime queue B failed'],
  });
  assert.equal(second.decision.escalate, true);
  assert.equal(second.task.state, 'ESCALATING');

  const requested = await service.requestReview('demo-task', {
    goal: 'Fix worker race', currentState: 'Two approaches failed',
    relevantFiles: [{ path: 'src/worker.ts', relevance: 'owns scheduling' }], relevantSymbols: ['runWorker'],
    evidence: ['test worker A failed', 'runtime queue B failed'], errors: ['AssertionError: duplicate job'],
    attempts: ['Added lock', 'Reordered queue'], diffSummary: 'No retained production diff', constraints: ['Minimal change'],
    question: 'Which invariant should the worker enforce?',
  });
  assert.equal(requested.task.state, 'WAITING_FOR_REVIEW');
  assert.equal(requested.route.outcome, 'prepared');
  assert.ok(requested.metrics.compression_ratio >= 0 && requested.metrics.compression_ratio <= 1);
  assert.match((await readFile(join(root, 'tasks', 'demo-task', 'review-request.md'), 'utf8')), /Respond in English \(en\)/);

  const received = await service.getReview('demo-task', { response: '# Decision\n\nSerialize dequeue by job id.' });
  assert.equal(received.task.state, 'APPLYING_REVIEW');
  assert.match(received.advice, /Serialize dequeue/);

  const final = await service.reportResult('demo-task', { remainingRisks: [] });
  assert.equal(final.status, 'done');
  assert.equal(final.expert_reviews, 1);
  assert.equal(final.retries_prevented, 1);
  assert.equal((await store.load('demo-task'))?.state, 'DONE');
});

test('service routes a desktop reviewer request through the built-in Browser action', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cqb-host-browser-'));
  const config = structuredClone(defaultConfig);
  config.reviewer.conversationUrl = 'https://chatgpt.com/c/builtin-reviewer';
  const desktop = new FakeDesktop();
  const service = new CqbService(config, new FileTaskStore(root), desktop, undefined, passingVerification);
  await service.status({ taskId: 'host-browser-task', goal: 'g', workspaceRoot: root });
  await service.shouldEscalate('host-browser-task', { confidence: 0.2, failures: 1, reason: 'explicit review', evidence: ['failure'], explicitReview: true });
  const requested = await service.requestReview('host-browser-task', { goal: 'g', currentState: 's', relevantFiles: [], relevantSymbols: [], evidence: ['failure'], errors: [], attempts: [], diffSummary: '', constraints: [], question: 'q', hostBrowser: true });
  assert.equal(requested.route.outcome, 'host-browser-required');
  assert.equal(requested.route.browserAction?.provider, 'builtin');
  assert.deepEqual(desktop.actions, ['clipboard']);
});

test('completion gate derives evidence independently and returns to execution when it fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cqb-gate-'));
  const store = new FileTaskStore(root);
  const failingVerification: VerificationRunner = { async run() { return { changedFiles: ['src/a.ts'], diffInspected: false, diff: { statusHash: '', workingTreeHash: '', stagedHash: '', statusLines: 1 }, validation: { tests: 'pass', typecheck: 'pass', lint: 'pass', build: 'failed' }, commands: [] }; } };
  const service = new CqbService(localConfig(), store, new FakeDesktop(), undefined, failingVerification);
  await service.status({ taskId: 'gate-task', goal: 'g', workspaceRoot: root });
  const result = await service.reportResult('gate-task', { remainingRisks: [] });
  assert.equal(result.status, 'retry-required');
  assert.equal((await store.load('gate-task'))?.state, 'EXECUTING');
});

test('completion gate ignores executor-supplied completion claims', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cqb-evidence-gate-'));
  const failingVerification: VerificationRunner = { async run() { return { changedFiles: [], diffInspected: true, diff: { statusHash: '', workingTreeHash: '', stagedHash: '', statusLines: 0 }, validation: { tests: 'failed', typecheck: 'skipped', lint: 'skipped', build: 'skipped' }, commands: [] }; } };
  const service = new CqbService(localConfig(), new FileTaskStore(root), new FakeDesktop(), undefined, failingVerification);
  await service.status({ taskId: 'evidence-task', goal: 'g', workspaceRoot: root });
  const result = await service.reportResult('evidence-task', {
    changedFiles: ['claimed.ts'], diffInspected: true,
    validation: { tests: 'pass', typecheck: 'pass', lint: 'pass', build: 'pass' }, remainingRisks: [],
  });
  assert.equal(result.status, 'retry-required');
});

test('review response import requires explicit caller-provided content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cqb-response-'));
  const store = new FileTaskStore(root);
  const service = new CqbService(localConfig(), store, new FakeDesktop(), undefined, passingVerification);
  const task = await service.status({ taskId: 'response-task', goal: 'g', workspaceRoot: root });
  task.state = 'WAITING_FOR_REVIEW';
  task.pendingReview = { type: 'CQB_REVIEW_REQUEST', task_id: task.id, created_at: new Date().toISOString(), state: 'WAITING_FOR_REVIEW', payload_hash: 'x', payload: 'p' };
  await store.save(task);
  await assert.rejects(() => service.getReview('response-task'), /explicit reviewer response/i);
  const received = await service.getReview('response-task', { response: 'Decision\nCookie: sessionid=private-response-cookie' });
  assert.doesNotMatch(received.advice, /private-response-cookie/);
  assert.doesNotMatch(await readFile(join(root, 'tasks', 'response-task', 'review-response.md'), 'utf8'), /private-response-cookie/);
});

test('circuit breaker counts persisted distinct attempts instead of caller counters', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cqb-attempts-'));
  const service = new CqbService(localConfig(), new FileTaskStore(root), new FakeDesktop(), undefined, passingVerification);
  await service.status({ taskId: 'attempt-task', goal: 'g', workspaceRoot: root });
  const first = await service.shouldEscalate('attempt-task', { confidence: 0.2, failures: 99, reason: 'same attempt', evidence: ['same error'] });
  const duplicate = await service.shouldEscalate('attempt-task', { confidence: 0.2, failures: 99, reason: 'same attempt', evidence: ['same error'] });
  const second = await service.shouldEscalate('attempt-task', { confidence: 0.2, failures: 1, reason: 'different attempt', evidence: ['different error'] });
  assert.equal(first.decision.escalate, false);
  assert.equal(duplicate.decision.escalate, false);
  assert.equal(second.decision.escalate, true);
  assert.equal(second.task.localFailures, 2);
});

test('automatic delivery is persisted and reserved before desktop input', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cqb-reservation-'));
  const store = new FileTaskStore(root);
  const desktop = new FakeDesktop();
  const config = localConfig();
  Object.assign(config.automation, { mode: 'autopilot', autoFocus: true, autoPaste: true, autoSend: true, consent: { granted: true, statement: 'I understand CQB may focus ChatGPT, paste repository context, and submit a message.', grantedAt: new Date().toISOString() } });
  let observedReservation = false;
  desktop.setClipboard = async (value: string) => { desktop.clipboard = value; observedReservation = Boolean((await store.load('reserved-task'))?.automaticReviewReservations.length); };
  const service = new CqbService(config, store, desktop, undefined, passingVerification);
  await service.status({ taskId: 'reserved-task', goal: 'g', workspaceRoot: root });
  await service.shouldEscalate('reserved-task', { confidence: 0.2, failures: 1, reason: 'a', evidence: ['a'], explicitReview: true });
  await service.requestReview('reserved-task', { goal: 'g', currentState: 's', relevantFiles: [], relevantSymbols: [], evidence: ['a'], errors: [], attempts: ['a'], diffSummary: '', constraints: [], question: 'q' });
  assert.equal(observedReservation, true);
});

test('empty evidence does not count as a meaningful failed attempt and stored evidence is redacted', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cqb-redacted-attempt-'));
  const store = new FileTaskStore(root);
  const service = new CqbService(localConfig(), store, new FakeDesktop(), undefined, passingVerification);
  await service.status({ taskId: 'redacted-task', goal: 'g', workspaceRoot: root });
  const empty = await service.shouldEscalate('redacted-task', { confidence: 0.2, failures: 10, reason: 'no evidence', evidence: [] });
  assert.equal(empty.task.localFailures, 0);
  const recorded = await service.shouldEscalate('redacted-task', { confidence: 0.2, failures: 1, reason: 'password = hidden-value', evidence: ['Authorization: Basic dXNlcjpwYXNzd29yZA==', 'Cookie: sessionid=cookie-secret-value'] });
  assert.equal(recorded.task.localFailures, 1);
  assert.doesNotMatch(JSON.stringify(await store.load('redacted-task')), /hidden-value|dXNlcjpwYXNzd29yZA|cookie-secret/);
});

test('status creates unique unbound tasks and resumes paused tasks only when requested', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cqb-resume-'));
  const store = new FileTaskStore(root);
  const service = new CqbService(localConfig(), store, new FakeDesktop(), undefined, passingVerification);
  const first = await service.status({ goal: 'same', workspaceRoot: root });
  const second = await service.status({ goal: 'same', workspaceRoot: root });
  assert.notEqual(first.id, second.id);
  const paused = { ...first, state: 'PAUSED' as const };
  await store.save(paused);
  assert.equal((await service.status({ taskId: first.id, goal: 'same', workspaceRoot: root })).state, 'PAUSED');
  assert.equal((await service.status({ taskId: first.id, goal: 'same', workspaceRoot: root.toUpperCase(), resume: true })).state, 'EXECUTING');
});

test('verification artifacts redact cookie headers from command output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cqb-verification-redaction-'));
  const store = new FileTaskStore(root);
  const runner: VerificationRunner = { async run() { return { changedFiles: [], diffInspected: true, diff: { statusHash: '', workingTreeHash: '', stagedHash: '', statusLines: 0 }, validation: { tests: 'pass', typecheck: 'pass', lint: 'pass', build: 'pass' }, commands: [{ name: 'tests', command: 'test', exitCode: 0, output: 'Set-Cookie: session=private-cookie-value', timedOut: false }] }; } };
  const service = new CqbService(localConfig(), store, new FakeDesktop(), undefined, runner);
  await service.status({ taskId: 'verification-redaction', goal: 'password = private-goal-value', workspaceRoot: root });
  await service.reportResult('verification-redaction', { remainingRisks: ['Cookie: sessionid=private-risk-cookie'] });
  const artifact = await readFile(join(root, 'tasks', 'verification-redaction', 'verification.json'), 'utf8');
  assert.doesNotMatch(artifact, /private-cookie-value/);
  assert.match(artifact, /\[REDACTED\]/);
  const persisted = `${await readFile(join(root, 'tasks', 'verification-redaction', 'task.json'), 'utf8')}\n${await readFile(join(root, 'tasks', 'verification-redaction', 'final.json'), 'utf8')}`;
  assert.doesNotMatch(persisted, /private-goal-value|private-risk-cookie/);
});
