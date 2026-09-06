#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { AUTOPILOT_CONSENT_STATEMENT } from '../automation/permissions.js';
import { loadConfig } from '../config/loader.js';
import { FileTaskStore } from '../core/store.js';
import { updateConsent, updateReviewerBinding } from '../config/writer.js';
import { WindowsDesktopController } from '../automation/windows.js';
import { createBuiltInReviewerBinding, createReviewerBinding, selectReviewerBinding } from '../setup/reviewer.js';

const [command = 'help', ...args] = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const codexDataRoot = process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME) : resolve(homedir(), '.codex');
const stateDirectory = resolve(option('--state-dir') ?? resolve(codexDataRoot, 'cqb'));

switch (command) {
  case 'status': {
    const taskId = args.find((value) => !value.startsWith('--'));
    if (!taskId) throw new Error('Usage: cqb status <task-id> [--state-dir <path>]');
    const task = await new FileTaskStore(stateDirectory).load(taskId);
    process.stdout.write(`${JSON.stringify(task ?? { status: 'not-found', task_id: taskId }, null, 2)}\n`);
    break;
  }
  case 'settings': {
    const path = option('--config');
    process.stdout.write(`${JSON.stringify(await loadConfig(path), null, 2)}\n`);
    break;
  }
  case 'setup-reviewer': {
    const configPath = resolve(option('--config') ?? resolve(stateDirectory, 'config.yaml'));
    const config = await loadConfig(configPath);
    const browser = option('--browser') ?? 'local';
    if (browser === 'builtin') {
      const conversationUrl = option('--conversation-url');
      if (!conversationUrl) throw new Error('Built-in Browser setup requires --conversation-url from a user-confirmed @Browser conversation');
      const binding = createBuiltInReviewerBinding(conversationUrl, option('--window-title') ?? config.reviewer.expectedWindowTitle);
      await updateReviewerBinding(configPath, binding.conversationUrl, binding.expectedWindowTitle, 'builtin');
      process.stdout.write(`Built-in Browser reviewer bound: ${binding.conversationUrl}\nConfiguration: ${configPath}\n`);
      break;
    }
    if (browser !== 'local') throw new Error('Usage: cqb setup-reviewer [--browser builtin --conversation-url <url>]');
    const desktop = new WindowsDesktopController(config.reviewer);
    await desktop.openUrl('https://chatgpt.com/');
    process.stdout.write('CQB opened ChatGPT. Sign in if needed, create or select the dedicated reviewer conversation, then return here and press Enter to bind it. The browser may remain in the background.\n');
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    await prompt.question('Press Enter after the reviewer conversation is ready: ');
    prompt.close();
    const snapshots = await desktop.captureReviewerBindings();
    const snapshot = selectReviewerBinding(snapshots, config.reviewer, option('--window-title'));
    const binding = createReviewerBinding(snapshot, config.reviewer, option('--window-title'));
    await updateReviewerBinding(configPath, binding.conversationUrl, binding.expectedWindowTitle, 'local');
    process.stdout.write(`Reviewer conversation bound: ${binding.conversationUrl}\nConfiguration: ${configPath}\n`);
    break;
  }
  case 'review': {
    const taskId = args.find((value) => !value.startsWith('--'));
    if (!taskId) throw new Error('Usage: cqb review <task-id> [--state-dir <path>]');
    const path = resolve(stateDirectory, 'tasks', taskId, 'review-request.md');
    process.stdout.write(await readFile(path, 'utf8'));
    break;
  }
  case 'consent': {
    const action = args[0];
    const configPath = resolve(option('--config') ?? resolve(stateDirectory, 'config.yaml'));
    if (action === 'grant') {
      await updateConsent(configPath, 'grant', option('--statement'));
      process.stdout.write(`Autopilot consent was granted in ${configPath}. Automation remains subject to the runtime kill switch and configured mode.\n`);
    } else if (action === 'revoke') {
      await updateConsent(configPath, 'revoke');
      await new FileTaskStore(stateDirectory).setAutomationDisabled(true);
      process.stdout.write(`Autopilot consent was revoked and automatic input was disabled in ${stateDirectory}.\n`);
    } else {
      process.stdout.write(`Grant with: cqb consent grant --config <path> --statement ${JSON.stringify(AUTOPILOT_CONSENT_STATEMENT)}\nRevoke with: cqb consent revoke --config <path>\n`);
    }
    break;
  }
  case 'automation': {
    const action = args[0];
    if (!['disable', 'enable'].includes(action ?? '')) throw new Error('Usage: cqb automation <disable|enable> [--state-dir <path>]');
    await new FileTaskStore(stateDirectory).setAutomationDisabled(action === 'disable');
    process.stdout.write(`Automatic input is ${action === 'disable' ? 'disabled' : 'enabled'} in ${stateDirectory}.\n`);
    break;
  }
  default:
    process.stdout.write('Codex Quota Bridge\nCommands: status, settings, setup-reviewer, review, consent, automation\n');
}
