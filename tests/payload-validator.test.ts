import assert from 'node:assert/strict';
import test from 'node:test';
import { createReviewEnvelope, validatePendingEnvelope } from '../src/reviewer/validator.js';
import { createTask } from '../src/core/types.js';

test('binds a review request to the active waiting task and hash', () => {
  const task = createTask('task-1', 'g', 'C:\\repo');
  task.state = 'WAITING_FOR_REVIEW';
  const envelope = createReviewEnvelope(task.id, '# Goal\n\nFix it', '2026-09-05T00:00:00.000Z');
  task.pendingReview = envelope;
  assert.equal(validatePendingEnvelope(envelope, task).valid, true);
});

test('rejects tampering, wrong task, and wrong state', () => {
  const task = createTask('task-1', 'g', 'C:\\repo');
  task.state = 'WAITING_FOR_REVIEW';
  const envelope = createReviewEnvelope(task.id, 'packet');
  task.pendingReview = envelope;
  assert.equal(validatePendingEnvelope({ ...envelope, payload: 'tampered' }, task).valid, false);
  assert.equal(validatePendingEnvelope({ ...envelope, task_id: 'other' }, task).valid, false);
  task.state = 'EXECUTING';
  assert.equal(validatePendingEnvelope(envelope, task).valid, false);
});
