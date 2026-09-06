import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runMockDemo } from '../src/demo.js';

test('demo proves the complete mocked CQB acceptance flow', async () => {
  const result = await runMockDemo(await mkdtemp(join(tmpdir(), 'cqb-demo-')));
  assert.equal(result.status, 'done');
  assert.equal(result.local_failures, 2);
  assert.equal(result.expert_reviews, 1);
  assert.equal(result.validation.tests, 'pass');
  assert.deepEqual(result.remaining_risks, []);
});
