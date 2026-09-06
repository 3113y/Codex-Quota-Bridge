import type { CqbConfig } from '../config/schema.js';
import type { ReviewEnvelope, TaskRecord } from '../core/types.js';
import { resolveAutomationPermissions } from '../automation/permissions.js';
import { sameTarget, verifyTarget, type ForegroundTarget } from '../automation/target-verifier.js';
import type { HostBrowserAction, RouteResult } from './transport.js';
import { validatePendingEnvelope } from './validator.js';

export interface DesktopController {
  openUrl(url: string): Promise<void>;
  findTarget(): Promise<ForegroundTarget | undefined>;
  focus(target: ForegroundTarget): Promise<boolean>;
  getForegroundTarget(): Promise<ForegroundTarget>;
  pasteVerified(target: ForegroundTarget, conversationUrl: string, expectedClipboard: string): Promise<boolean>;
  sendVerified(target: ForegroundTarget, conversationUrl: string, expectedComposer: string): Promise<boolean>;
  setClipboard(value: string): Promise<void>;
  getClipboard(): Promise<string>;
  notify(title: string, message: string): Promise<void>;
}

export function formatReviewForClipboard(envelope: ReviewEnvelope): string {
  return `<!-- CQB_REVIEW_REQUEST task_id=${envelope.task_id} payload_hash=${envelope.payload_hash} -->\n\n${envelope.payload}`;
}

async function verifiedForeground(config: CqbConfig, desktop: DesktopController, expected: ForegroundTarget): Promise<boolean> {
  const foreground = await desktop.getForegroundTarget();
  return sameTarget(foreground, expected) && verifyTarget(foreground, config.reviewer).valid;
}

export async function routeReview(task: TaskRecord, config: CqbConfig, desktop: DesktopController, options: { hostBrowser?: boolean } = {}): Promise<RouteResult> {
  const envelope = task.pendingReview;
  if (!envelope || !validatePendingEnvelope(envelope, task).valid) return { outcome: 'payload-validation-failed', message: 'Pending review validation failed; no external input was performed.' };
  const permissions = resolveAutomationPermissions(config.automation);
  const outgoing = formatReviewForClipboard(envelope);
  await desktop.setClipboard(outgoing);
  if (options.hostBrowser !== false && config.reviewer.browserProvider === 'builtin') {
    let boundConversation = false;
    try { boundConversation = new URL(config.reviewer.conversationUrl).protocol === 'https:' && new URL(config.reviewer.conversationUrl).hostname === 'chatgpt.com' && /^\/c\/[^/]+/.test(new URL(config.reviewer.conversationUrl).pathname); } catch {}
    if (config.automation.mode !== 'safe') return { outcome: 'permission-denied', message: 'Built-in Browser routing currently supports Safe mode only; use the local browser provider for Assisted or Autopilot.' };
    const browserAction: HostBrowserAction = {
      provider: 'builtin',
      conversationUrl: boundConversation ? config.reviewer.conversationUrl : 'https://chatgpt.com/',
      packet: outgoing,
      instruction: boundConversation
        ? 'Use the in-app @Browser capability to open the conversation URL; do not use Chrome or Edge. Keep the packet available for user review and do not submit it without explicit user approval.'
        : 'Use the in-app @Browser capability to open ChatGPT, sign in if needed, and create or select the dedicated reviewer conversation; do not use Chrome or Edge. Then call cqb_bind_reviewer with the confirmed /c/... URL before continuing. Do not submit the packet without explicit user approval.',
      selectionHint: boundConversation
        ? `Find the dedicated ChatGPT conversation titled or labeled "${config.reviewer.expectedWindowTitle}" in the in-app Browser and open the existing conversation at the configured URL.`
        : `Search the in-app ChatGPT history for a dedicated conversation titled or labeled "${config.reviewer.expectedWindowTitle}" before creating anything new.`,
      ...(boundConversation ? {} : {
        setupRequired: true,
        creationPrompt: `If no dedicated reviewer conversation exists, create a new ChatGPT conversation named "${config.reviewer.expectedWindowTitle}". Ask the user to approve the creation if ChatGPT requests confirmation, then report the resulting /c/... URL to cqb_bind_reviewer.`,
      }),
    };
    return { outcome: 'host-browser-required', message: boundConversation ? 'Codex desktop must fulfill the reviewer request with @Browser; no local browser input was performed.' : 'Reviewer initialization is required in the built-in Browser; no external browser was opened.', browserAction };
  }
  if (permissions.autoOpen) await desktop.openUrl(config.reviewer.conversationUrl);

  if (config.automation.mode === 'autopilot' && !permissions.autoSend) {
    await desktop.notify('CQB Autopilot inactive', 'Exact Autopilot consent and all input permissions are required.');
    return { outcome: 'permission-denied', message: 'Autopilot consent or permissions are incomplete.' };
  }

  if (!permissions.autoPaste) {
    await desktop.notify('CQB review ready', 'The validated review packet is available for manual submission.');
    return { outcome: 'prepared', message: 'Review packet copied for manual submission.' };
  }
  if (config.automation.mode === 'autopilot' && (!task.automaticReviewReservations.includes(envelope.payload_hash) || task.autoReviews > config.limits.maxAutoReviewsPerTask)) {
    await desktop.notify('CQB review paused', 'The automatic review limit was reached.');
    return { outcome: 'send-limit-reached', message: 'Automatic review limit reached; manual approval is required.' };
  }
  const target = await desktop.findTarget();
  if (!target || !verifyTarget(target, config.reviewer).valid || !(await desktop.focus(target)) || !(await verifiedForeground(config, desktop, target))) {
    await desktop.notify('CQB needs attention', 'ChatGPT target verification failed; the packet remains on the clipboard.');
    return { outcome: 'target-verification-failed', message: 'Target verification failed closed.' };
  }
  if (!validatePendingEnvelope(envelope, task).valid || await desktop.getClipboard() !== outgoing || !(await verifiedForeground(config, desktop, target))) {
    return { outcome: 'payload-validation-failed', message: 'Payload or focus changed before paste; no input was performed.' };
  }
  if (!(await desktop.pasteVerified(target, config.reviewer.conversationUrl, outgoing))) {
    await desktop.notify('CQB needs attention', 'ChatGPT composer verification failed; no input was performed.');
    return { outcome: 'target-verification-failed', message: 'Composer verification failed closed.' };
  }
  if (!permissions.autoSend) {
    await desktop.notify('CQB review pasted', 'Review the request and press Enter to submit.');
    return { outcome: 'pasted', message: 'Validated review pasted; user submission required.' };
  }
  if (!validatePendingEnvelope(envelope, task).valid || await desktop.getClipboard() !== outgoing || !(await verifiedForeground(config, desktop, target))) {
    return { outcome: 'target-verification-failed', message: 'Target changed before send; submission cancelled.' };
  }
  if (!(await desktop.sendVerified(target, config.reviewer.conversationUrl, outgoing))) return { outcome: 'target-verification-failed', message: 'Composer changed before send; submission cancelled.' };
  await desktop.notify('CQB review sent', 'The validated CQB review request was submitted.');
  return { outcome: 'sent', message: 'Validated CQB review request submitted.' };
}
