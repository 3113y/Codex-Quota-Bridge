import { copyFile, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { AUTOPILOT_CONSENT_STATEMENT } from '../automation/permissions.js';
import type { CqbConfig } from './schema.js';
import { loadConfig } from './loader.js';

const scalar = (value: string) => JSON.stringify(value);
const list = (values: string[]) => `[${values.map(scalar).join(', ')}]`;

export function serializeConfig(config: CqbConfig): string {
  const consent = config.automation.consent;
  return `reviewer:
  provider: ${config.reviewer.provider}
  browser_provider: ${config.reviewer.browserProvider}
  preferred_model: ${scalar(config.reviewer.preferredModel)}
  conversation_url: ${scalar(config.reviewer.conversationUrl)}
  expected_window_title: ${scalar(config.reviewer.expectedWindowTitle)}
  allowed_processes: ${list(config.reviewer.allowedProcesses)}
routing:
  confidence_threshold: ${config.routing.confidenceThreshold}
  max_local_failures: ${config.routing.maxLocalFailures}
  max_reviews_per_task: ${config.routing.maxReviewsPerTask}
  require_new_evidence: ${config.routing.requireNewEvidence}
automation:
  mode: ${config.automation.mode}
  auto_open: ${config.automation.autoOpen}
  auto_focus: ${config.automation.autoFocus}
  auto_paste: ${config.automation.autoPaste}
  auto_send: ${config.automation.autoSend}${consent ? `
  consent:
    granted: ${consent.granted}
    statement: ${scalar(consent.statement)}
    granted_at: ${scalar(consent.grantedAt)}` : ''}
verification:
  tests: ${config.verification.tests}
  typecheck: ${config.verification.typecheck}
  lint: ${config.verification.lint}
  build: ${config.verification.build}
  diff_review: ${config.verification.diffReview}
  commands:
    tests: ${scalar(config.verification.commands.tests)}
    typecheck: ${scalar(config.verification.commands.typecheck)}
    lint: ${scalar(config.verification.commands.lint)}
    build: ${scalar(config.verification.commands.build)}
limits:
  max_executor_rounds: ${config.limits.maxExecutorRounds}
  max_auto_reviews_per_task: ${config.limits.maxAutoReviewsPerTask}
storage:
  state_directory: ${scalar(config.storage.stateDirectory)}
`;
}

export async function updateConsent(path: string, action: 'grant' | 'revoke', statement?: string): Promise<CqbConfig> {
  const absolute = resolve(path);
  const config = await loadConfig(absolute);
  if (action === 'grant') {
    if (statement !== AUTOPILOT_CONSENT_STATEMENT) throw new Error('Autopilot grant requires the exact documented consent statement');
    config.automation.consent = { granted: true, statement, grantedAt: new Date().toISOString() };
  } else {
    delete config.automation.consent;
    Object.assign(config.automation, { mode: 'safe', autoFocus: false, autoPaste: false, autoSend: false });
  }
  await mkdir(dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.tmp`;
  await writeFile(temporary, serializeConfig(config), 'utf8');
  try { await rename(temporary, absolute); }
  catch (error) {
    if (!['EEXIST', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    await copyFile(temporary, absolute);
    await unlink(temporary).catch(() => undefined);
  }
  return config;
}

export async function updateReviewerBinding(path: string, conversationUrl: string, expectedWindowTitle: string, browserProvider: CqbConfig['reviewer']['browserProvider'] = 'local'): Promise<CqbConfig> {
  const absolute = resolve(path);
  const config = await loadConfig(absolute);
  config.reviewer.conversationUrl = conversationUrl;
  config.reviewer.expectedWindowTitle = expectedWindowTitle;
  config.reviewer.browserProvider = browserProvider;
  await mkdir(dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.tmp`;
  await writeFile(temporary, serializeConfig(config), 'utf8');
  try { await rename(temporary, absolute); }
  catch (error) {
    if (!['EEXIST', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    await copyFile(temporary, absolute);
    await unlink(temporary).catch(() => undefined);
  }
  return config;
}
