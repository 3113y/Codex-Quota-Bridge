import assert from 'node:assert/strict';
import test from 'node:test';
import { routeReview, type DesktopController } from '../src/reviewer/clipboard.js';
import { AUTOPILOT_CONSENT_STATEMENT, resolveAutomationPermissions } from '../src/automation/permissions.js';
import { createReviewEnvelope } from '../src/reviewer/validator.js';
import { createTask } from '../src/core/types.js';
import { defaultConfig } from '../src/config/schema.js';
import { WindowsDesktopController } from '../src/automation/windows.js';

class FakeDesktop implements DesktopController {
  actions: string[] = [];
  clipboard = '';
  target = { processName: 'chrome', title: 'CQB Reviewer - ChatGPT', processId: 42, windowHandle: '1001' };
  tamperClipboardOnRead = false;
  sentExpected = '';
  async openUrl() { this.actions.push('open'); }
  async findTarget() { return this.target; }
  async focus() { this.actions.push('focus'); return true; }
  async getForegroundTarget() { return this.target; }
  async pasteVerified() { this.actions.push('composer', 'paste'); return true; }
  async sendVerified(_target: unknown, _url: string, expected: string) { this.sentExpected = expected; this.actions.push('composer', 'send'); return true; }
  async setClipboard(value: string) { this.clipboard = value; this.actions.push('clipboard'); }
  async getClipboard() { return this.tamperClipboardOnRead ? 'unrelated clipboard content' : this.clipboard; }
  async notify() { this.actions.push('notify'); }
}

function pendingTask() {
  const task = createTask('task-1', 'g', 'C:\\repo');
  task.state = 'WAITING_FOR_REVIEW';
  task.pendingReview = createReviewEnvelope(task.id, '# Goal\n\nFix it');
  return task;
}

function localConfig() {
  const config = structuredClone(defaultConfig);
  config.reviewer.browserProvider = 'local';
  return config;
}

test('Safe mode can copy and open but never focuses, pastes, or sends', async () => {
  const desktop = new FakeDesktop();
  const result = await routeReview(pendingTask(), localConfig(), desktop);
  assert.equal(result.outcome, 'prepared');
  assert.deepEqual(desktop.actions, ['clipboard', 'open', 'notify']);
});

test('desktop host browser route returns an explicit Browser action without opening local Chrome', async () => {
  const desktop = new FakeDesktop();
  const config = structuredClone(defaultConfig);
  config.reviewer.conversationUrl = 'https://chatgpt.com/c/builtin-reviewer';
  const result = await routeReview(pendingTask(), config, desktop, { hostBrowser: true });
  assert.equal(result.outcome, 'host-browser-required');
  assert.equal(result.browserAction?.provider, 'builtin');
  assert.equal(result.browserAction?.conversationUrl, config.reviewer.conversationUrl);
  assert.match(result.browserAction?.instruction ?? '', /@Browser/);
  assert.match(result.browserAction?.selectionHint ?? '', /CQB Reviewer/);
  assert.deepEqual(desktop.actions, ['clipboard']);
});

test('built-in Browser provider is host-first even without an explicit routing hint', async () => {
  const config = structuredClone(defaultConfig);
  config.reviewer.conversationUrl = 'https://chatgpt.com/c/builtin-reviewer';
  const desktop = new FakeDesktop();
  const result = await routeReview(pendingTask(), config, desktop);
  assert.equal(result.outcome, 'host-browser-required');
  assert.deepEqual(desktop.actions, ['clipboard']);
});

test('built-in Browser provider returns setup action for an unbound reviewer home page', async () => {
  const result = await routeReview(pendingTask(), defaultConfig, new FakeDesktop());
  assert.equal(result.outcome, 'host-browser-required');
  assert.equal(result.browserAction?.setupRequired, true);
  assert.match(result.browserAction?.instruction ?? '', /cqb_bind_reviewer/i);
  assert.match(result.browserAction?.creationPrompt ?? '', /CQB Reviewer/);
});

test('Assisted mode verifies and pastes but leaves submission to the user', async () => {
  const desktop = new FakeDesktop();
  const config = localConfig();
  Object.assign(config.automation, { mode: 'assisted', autoFocus: true, autoPaste: true });
  const task = pendingTask();
  task.autoReviews = 1;
  task.automaticReviewReservations = [task.pendingReview!.payload_hash];
  const result = await routeReview(task, config, desktop);
  assert.equal(result.outcome, 'pasted');
  assert.deepEqual(desktop.actions, ['clipboard', 'open', 'focus', 'composer', 'paste', 'notify']);
});

test('Autopilot requires exact consent and respects the send limit', async () => {
  const denied = localConfig();
  Object.assign(denied.automation, { mode: 'autopilot', autoFocus: true, autoPaste: true, autoSend: true });
  assert.equal(resolveAutomationPermissions(denied.automation).autoSend, false);
  const deniedDesktop = new FakeDesktop();
  const deniedRoute = await routeReview(pendingTask(), denied, deniedDesktop);
  assert.equal(deniedRoute.outcome, 'permission-denied');
  assert.doesNotMatch(deniedDesktop.actions.join(','), /paste|send/);

  denied.automation.consent = { granted: true, statement: AUTOPILOT_CONSENT_STATEMENT, grantedAt: new Date().toISOString() };
  const task = pendingTask();
  task.autoReviews = denied.limits.maxAutoReviewsPerTask;
  const desktop = new FakeDesktop();
  const result = await routeReview(task, denied, desktop);
  assert.equal(result.outcome, 'send-limit-reached');
  assert.doesNotMatch(desktop.actions.join(','), /paste|send/);
});

test('clipboard mutation cancels automatic paste and send', async () => {
  const desktop = new FakeDesktop();
  desktop.tamperClipboardOnRead = true;
  const config = localConfig();
  Object.assign(config.automation, {
    mode: 'autopilot', autoFocus: true, autoPaste: true, autoSend: true,
    consent: { granted: true, statement: AUTOPILOT_CONSENT_STATEMENT, grantedAt: new Date().toISOString() },
  });
  const task = pendingTask();
  task.autoReviews = 1;
  task.automaticReviewReservations = [task.pendingReview!.payload_hash];
  const result = await routeReview(task, config, desktop);
  assert.equal(result.outcome, 'payload-validation-failed');
  assert.doesNotMatch(desktop.actions.join(','), /paste|send/);
});

test('Autopilot sends a validated CQB payload after repeated target checks', async () => {
  const desktop = new FakeDesktop();
  const config = localConfig();
  Object.assign(config.automation, {
    mode: 'autopilot', autoFocus: true, autoPaste: true, autoSend: true,
    consent: { granted: true, statement: AUTOPILOT_CONSENT_STATEMENT, grantedAt: new Date().toISOString() },
  });
  const task = pendingTask();
  task.autoReviews = 1;
  task.automaticReviewReservations = [task.pendingReview!.payload_hash];
  const result = await routeReview(task, config, desktop);
  assert.equal(result.outcome, 'sent');
  assert.deepEqual(desktop.actions, ['clipboard', 'open', 'focus', 'composer', 'paste', 'composer', 'send', 'notify']);
  assert.equal(desktop.sentExpected, desktop.clipboard);
});

test('Autopilot cancels when exact composer readback cannot be verified', async () => {
  const desktop = new FakeDesktop();
  desktop.sendVerified = async () => false;
  const config = localConfig();
  Object.assign(config.automation, { mode: 'autopilot', autoFocus: true, autoPaste: true, autoSend: true, consent: { granted: true, statement: AUTOPILOT_CONSENT_STATEMENT, grantedAt: new Date().toISOString() } });
  const task = pendingTask();
  task.autoReviews = 1;
  task.automaticReviewReservations = [task.pendingReview!.payload_hash];
  const result = await routeReview(task, config, desktop);
  assert.equal(result.outcome, 'target-verification-failed');
  assert.doesNotMatch(desktop.actions.join(','), /send/);
});

test('automatic input fails closed without a verified ChatGPT composer', async () => {
  const desktop = new FakeDesktop();
  desktop.pasteVerified = async () => false;
  const config = localConfig();
  Object.assign(config.automation, { mode: 'assisted', autoFocus: true, autoPaste: true });
  const result = await routeReview(pendingTask(), config, desktop);
  assert.equal(result.outcome, 'target-verification-failed');
  assert.doesNotMatch(desktop.actions.join(','), /paste|send/);
});

test('foreground window identity must remain stable', async () => {
  const desktop = new FakeDesktop();
  desktop.getForegroundTarget = async () => ({ ...desktop.target, windowHandle: 'different' });
  const config = localConfig();
  Object.assign(config.automation, { mode: 'assisted', autoFocus: true, autoPaste: true });
  const result = await routeReview(pendingTask(), config, desktop);
  assert.equal(result.outcome, 'target-verification-failed');
  assert.doesNotMatch(desktop.actions.join(','), /paste|send/);
});

test('target mismatch fails closed before input', async () => {
  const desktop = new FakeDesktop();
  desktop.target = { processName: 'Slack', title: 'General', processId: 7, windowHandle: '9' };
  const config = localConfig();
  Object.assign(config.automation, { mode: 'assisted', autoFocus: true, autoPaste: true });
  const result = await routeReview(pendingTask(), config, desktop);
  assert.equal(result.outcome, 'target-verification-failed');
  assert.doesNotMatch(desktop.actions.join(','), /paste|send/);
});

test('Windows controller parses the bounded UI Automation action and rejects a fake HWND', { skip: process.platform !== 'win32' }, async () => {
  const controller = new WindowsDesktopController(defaultConfig.reviewer);
  assert.equal(await controller.pasteVerified({ processName: 'chrome', title: 'CQB Reviewer', processId: 1, windowHandle: '1' }, 'https://chatgpt.com/c/test', 'payload'), false);
});
