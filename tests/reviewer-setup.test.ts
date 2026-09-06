import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { defaultConfig } from '../src/config/schema.js';
import { loadConfig } from '../src/config/loader.js';
import { updateReviewerBinding } from '../src/config/writer.js';
import { createBuiltInReviewerBinding, createReviewerBinding, parseReviewerBindingSnapshot, parseReviewerBindingSnapshots, selectReviewerBinding, validateReviewerBinding, type ReviewerBindingSnapshot } from '../src/setup/reviewer.js';

const snapshot: ReviewerBindingSnapshot = {
  processName: 'chrome',
  title: 'CQB Reviewer - ChatGPT',
  processId: 1234,
  windowHandle: '5678',
  conversationUrl: 'https://chatgpt.com/c/abc123',
};

test('reviewer setup accepts a verified ChatGPT conversation snapshot', () => {
  const result = validateReviewerBinding(snapshot, defaultConfig.reviewer);
  assert.deepEqual(result, { valid: true });
  assert.deepEqual(createReviewerBinding(snapshot, defaultConfig.reviewer), {
    conversationUrl: snapshot.conversationUrl,
    expectedWindowTitle: snapshot.title,
  });
});

test('reviewer setup accepts a user-confirmed built-in Browser conversation URL', () => {
  assert.deepEqual(createBuiltInReviewerBinding('https://chatgpt.com/c/builtin123', 'CQB Reviewer'), {
    conversationUrl: 'https://chatgpt.com/c/builtin123',
    expectedWindowTitle: 'CQB Reviewer',
  });
  assert.throws(() => createBuiltInReviewerBinding('https://chatgpt.com/', 'CQB Reviewer'), /conversation/i);
});

test('reviewer setup rejects the ChatGPT home page and unsafe targets', () => {
  for (const candidate of [
    { ...snapshot, conversationUrl: 'https://chatgpt.com/' },
    { ...snapshot, conversationUrl: 'https://example.com/c/abc123' },
    { ...snapshot, processName: 'notepad' },
    { ...snapshot, title: '' },
    { ...snapshot, processId: 0 },
    { ...snapshot, windowHandle: '0' },
  ]) {
    assert.equal(validateReviewerBinding(candidate, defaultConfig.reviewer).valid, false);
  }
});

test('reviewer setup accepts an explicit stable title only when it matches the window', () => {
  assert.deepEqual(createReviewerBinding(snapshot, defaultConfig.reviewer, 'CQB Reviewer'), {
    conversationUrl: snapshot.conversationUrl,
    expectedWindowTitle: 'CQB Reviewer',
  });
  assert.throws(() => createReviewerBinding(snapshot, defaultConfig.reviewer, 'Other Window'), /title/i);
});

test('reviewer setup parses only complete Windows UI Automation snapshots', () => {
  assert.deepEqual(parseReviewerBindingSnapshot(JSON.stringify(snapshot)), snapshot);
  assert.equal(parseReviewerBindingSnapshot(''), undefined);
  assert.equal(parseReviewerBindingSnapshot(JSON.stringify({ ...snapshot, conversationUrl: '' })), undefined);
  assert.deepEqual(parseReviewerBindingSnapshots(JSON.stringify([snapshot])), [snapshot]);
  assert.deepEqual(parseReviewerBindingSnapshots(''), []);
});

test('reviewer setup selects one valid browser candidate and rejects ambiguity', () => {
  const second = { ...snapshot, title: 'Other Reviewer - ChatGPT', windowHandle: '6789', conversationUrl: 'https://chatgpt.com/c/def456' };
  assert.deepEqual(selectReviewerBinding([snapshot], defaultConfig.reviewer), snapshot);
  assert.deepEqual(selectReviewerBinding([snapshot, second], defaultConfig.reviewer, 'CQB Reviewer'), snapshot);
  assert.throws(() => selectReviewerBinding([snapshot, second], defaultConfig.reviewer), /multiple/i);
  assert.throws(() => selectReviewerBinding([], defaultConfig.reviewer), /no valid/i);
});

test('reviewer binding persists only the verified URL and window title', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cqb-reviewer-setup-'));
  const path = join(root, 'config.yaml');
  await updateReviewerBinding(path, snapshot.conversationUrl, snapshot.title);
  const config = await loadConfig(path);
  assert.equal(config.reviewer.conversationUrl, snapshot.conversationUrl);
  assert.equal(config.reviewer.expectedWindowTitle, snapshot.title);
  assert.equal(config.automation.mode, 'safe');
  assert.match(await readFile(path, 'utf8'), /conversation_url:/);
});
