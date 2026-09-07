import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseConfig } from '../src/config/loader.js';
import { updateAutomationMode, updateConsent, updateReviewerModel } from '../src/config/writer.js';
import { AUTOPILOT_CONSENT_STATEMENT } from '../src/automation/permissions.js';

test('configuration parser maps documented snake-case settings', () => {
  const config = parseConfig(`
reviewer:
  provider: chatgpt_plus
  preferred_model: sol
  conversation_url: https://chatgpt.com/c/example
  expected_window_title: CQB Reviewer
routing:
  confidence_threshold: 0.55
  max_local_failures: 3
automation:
  mode: assisted
  auto_open: true
  auto_focus: true
  auto_paste: true
  auto_send: false
limits:
  max_executor_rounds: 10
  max_auto_reviews_per_task: 1
`);
  assert.equal(config.routing.confidenceThreshold, 0.55);
  assert.equal(config.routing.maxLocalFailures, 3);
  assert.equal(config.automation.mode, 'assisted');
  assert.equal(config.automation.autoPaste, true);
  assert.equal(config.limits.maxAutoReviewsPerTask, 1);
});

test('configuration parser rejects unsafe mode and permission combinations', () => {
  assert.throws(() => parseConfig('automation:\n  mode: safe\n  auto_send: true'), /safe mode/i);
  assert.throws(() => parseConfig('reviewer:\n  conversation_url: https://example.com/chat'), /chatgpt.com/i);
  assert.throws(() => parseConfig('verification:\n  tests: false\n  typecheck: false\n  lint: false\n  build: false\n  diff_review: false'), /diff review|verification command/i);
  assert.throws(() => parseConfig('verification:\n  tests: true\n  diff_review: false'), /diff review/i);
  assert.throws(() => parseConfig('verification:\n  tests: false\n  typecheck: false\n  lint: false\n  build: false'), /verification command/i);
});

test('configuration parser rejects unknown keys and accepts nested exact consent', () => {
  assert.throws(() => parseConfig('automation:\n  typo_send: true'), /unknown configuration key/i);
  const config = parseConfig(`automation:
  mode: autopilot
  auto_focus: true
  auto_paste: true
  auto_send: true
  consent:
    granted: true
    statement: I understand CQB may focus ChatGPT, paste repository context, and submit a message.
    granted_at: 2026-09-05T00:00:00.000Z`);
  assert.equal(config.automation.consent?.granted, true);
});

test('all shipped permission-mode examples parse to their named mode', async () => {
  for (const [file, mode] of [['config.example.yaml', 'safe'], ['config.assisted.example.yaml', 'assisted'], ['config.autopilot.example.yaml', 'autopilot']] as const) {
    const config = parseConfig(await readFile(resolve(file), 'utf8'));
    assert.equal(config.automation.mode, mode);
  }
});

test('consent grant and revoke persist a parseable configuration', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'cqb-consent-'));
  const path = resolve(root, 'config.yaml');
  await writeFile(path, await readFile(resolve('config.autopilot.example.yaml'), 'utf8'), 'utf8');
  await updateConsent(path, 'grant', AUTOPILOT_CONSENT_STATEMENT);
  assert.equal(parseConfig(await readFile(path, 'utf8')).automation.consent?.granted, true);
  await updateConsent(path, 'revoke');
  const revoked = parseConfig(await readFile(path, 'utf8'));
  assert.equal(revoked.automation.mode, 'safe');
  assert.equal(revoked.automation.consent, undefined);
});

test('automation mode changes persist the matching permission envelope', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'cqb-mode-'));
  const path = resolve(root, 'config.yaml');
  await writeFile(path, await readFile(resolve('config.example.yaml'), 'utf8'), 'utf8');
  const assisted = await updateAutomationMode(path, 'assisted');
  assert.deepEqual({ mode: assisted.automation.mode, focus: assisted.automation.autoFocus, paste: assisted.automation.autoPaste, send: assisted.automation.autoSend }, { mode: 'assisted', focus: true, paste: true, send: false });
  const safe = await updateAutomationMode(path, 'safe');
  assert.deepEqual({ mode: safe.automation.mode, focus: safe.automation.autoFocus, paste: safe.automation.autoPaste, send: safe.automation.autoSend }, { mode: 'safe', focus: false, paste: false, send: false });
});

test('reviewer model changes persist and reject unsupported models', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'cqb-model-'));
  const path = resolve(root, 'config.yaml');
  await writeFile(path, await readFile(resolve('config.example.yaml'), 'utf8'), 'utf8');
  const updated = await updateReviewerModel(path, 'terra');
  assert.equal(updated.reviewer.preferredModel, 'terra');
  assert.equal(parseConfig(await readFile(path, 'utf8')).reviewer.preferredModel, 'terra');
  await assert.rejects(() => updateReviewerModel(path, 'gpt-unknown'), /unsupported reviewer model/i);
});
