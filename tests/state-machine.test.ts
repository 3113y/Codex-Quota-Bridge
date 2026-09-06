import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FileTaskStore } from '../src/core/store.js';
import { InvalidTransitionError, transitionTask, validTransitions } from '../src/core/state-machine.js';
import { createTask } from '../src/core/types.js';

test('state machine accepts the complete reviewed workflow', () => {
  let task = createTask('task-1', 'Implement CQB', 'C:\\repo', '2026-09-05T00:00:00.000Z');
  for (const state of ['EXECUTING', 'ESCALATING', 'PREPARING_REVIEW', 'WAITING_FOR_REVIEW', 'REVIEW_RECEIVED', 'APPLYING_REVIEW', 'VERIFYING', 'DONE'] as const) {
    task = transitionTask(task, state, `enter ${state}`, '2026-09-05T00:00:01.000Z');
  }
  assert.equal(task.state, 'DONE');
});

test('state machine rejects invalid and terminal transitions', () => {
  const task = createTask('task-1', 'Implement CQB', 'C:\\repo', '2026-09-05T00:00:00.000Z');
  assert.throws(() => transitionTask(task, 'DONE', 'skip verification'), InvalidTransitionError);
  const aborted = transitionTask(task, 'ABORTED', 'user aborted');
  assert.throws(() => transitionTask(aborted, 'EXECUTING', 'restart'), InvalidTransitionError);
});

test('every declared valid transition is executable', () => {
  for (const [from, targets] of Object.entries(validTransitions)) {
    for (const to of targets) {
      const task = createTask('task-1', 'g', 'C:\\repo');
      task.state = from as typeof task.state;
      assert.equal(transitionTask(task, to, 'declared edge').state, to);
    }
  }
});

test('file store survives restart and writes redacted events', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cqb-store-'));
  const task = transitionTask(createTask('task-1', 'Goal', root), 'EXECUTING', 'start');
  await new FileTaskStore(root).save(task, 'task.saved', { apiKey: 'secret-value', result: 'ok' });

  const restored = await new FileTaskStore(root).load('task-1');
  assert.equal(restored?.state, 'EXECUTING');
  const events = await readFile(join(root, 'tasks', 'task-1', 'events.jsonl'), 'utf8');
  assert.match(events, /\[REDACTED\]/);
  assert.doesNotMatch(events, /secret-value/);
});

test('file store rejects dot-segment task identifiers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cqb-safe-id-'));
  const store = new FileTaskStore(root);
  await assert.rejects(() => store.load('..'), /task id/i);
  await assert.rejects(() => store.writeArtifact('.', 'x.txt', 'x'), /task id/i);
});

test('file store restores the latest durable checkpoint when task.json is damaged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cqb-checkpoint-'));
  const store = new FileTaskStore(root);
  const task = transitionTask(createTask('recover-task', 'Goal', root), 'EXECUTING', 'start');
  await store.save(task);
  await writeFile(join(root, 'tasks', 'recover-task', 'task.json'), '{damaged', 'utf8');
  assert.equal((await store.load('recover-task'))?.state, 'EXECUTING');
});

test('automation kill switch is durable and reversible', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cqb-kill-switch-'));
  const store = new FileTaskStore(root);
  assert.equal(await store.isAutomationDisabled(), false);
  await store.setAutomationDisabled(true);
  assert.equal(await new FileTaskStore(root).isAutomationDisabled(), true);
  await store.setAutomationDisabled(false);
  assert.equal(await store.isAutomationDisabled(), false);
});
