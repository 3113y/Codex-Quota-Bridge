import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultConfig } from '../src/config/schema.js';
import { evaluateEscalation } from '../src/core/escalation.js';
import { createTask } from '../src/core/types.js';

const baseSignal = {
  confidence: 0.8,
  failures: 1,
  reason: 'first failure',
  evidence: ['test A failed'],
};

test('keeps routine work local before the circuit breaker', () => {
  const decision = evaluateEscalation(createTask('t', 'g', 'C:\\repo'), baseSignal, defaultConfig.routing);
  assert.deepEqual(decision, { escalate: false, code: 'continue-local', newEvidence: ['test a failed'] });
});

test('escalates after two independent failures or a repeated failure pattern', () => {
  const task = createTask('t', 'g', 'C:\\repo');
  const independent = evaluateEscalation(task, { ...baseSignal, failures: 2, evidence: ['test A failed', 'runtime B failed'] }, defaultConfig.routing);
  const repeated = evaluateEscalation(task, { ...baseSignal, failures: 2, evidence: ['timeout at 10:01', 'timeout at 10:02'] }, defaultConfig.routing);
  assert.equal(independent.escalate, true);
  assert.equal(independent.code, 'local-failure-limit');
  assert.equal(repeated.escalate, true);
  assert.equal(repeated.code, 'repeated-failure-pattern');
});

test('explicit review and low-confidence architecture risk escalate immediately', () => {
  const task = createTask('t', 'g', 'C:\\repo');
  assert.equal(evaluateEscalation(task, { ...baseSignal, explicitReview: true }, defaultConfig.routing).escalate, true);
  assert.equal(evaluateEscalation(task, { ...baseSignal, confidence: 0.3, architectureJudgment: true }, defaultConfig.routing).escalate, true);
});

test('review limits and the new-evidence gate prevent loops', () => {
  const task = createTask('t', 'g', 'C:\\repo');
  task.expertReviews = 1;
  task.consultedEvidenceFingerprints = ['test a failed'];
  assert.equal(evaluateEscalation(task, { ...baseSignal, explicitReview: true }, defaultConfig.routing).code, 'new-evidence-required');
  task.expertReviews = defaultConfig.routing.maxReviewsPerTask;
  assert.equal(evaluateEscalation(task, { ...baseSignal, evidence: ['new fact'], explicitReview: true }, defaultConfig.routing).code, 'review-limit-reached');
});
