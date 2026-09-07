import { SUPPORTED_REVIEWER_MODELS, type CqbConfig } from '../config/schema.js';
import type { DesktopController } from '../reviewer/clipboard.js';
import { formatReviewForClipboard, routeReview } from '../reviewer/clipboard.js';
import { createReviewEnvelope } from '../reviewer/validator.js';
import { buildReviewPacket, type ReviewPacketInput } from './compressor.js';
import { evaluateEscalation, type EscalationSignal } from './escalation.js';
import { evidenceFingerprint } from './evidence.js';
import { transitionTask } from './state-machine.js';
import { FileTaskStore } from './store.js';
import { createTask, type TaskRecord, type ValidationResult } from './types.js';
import { AUTOPILOT_CONSENT_STATEMENT, resolveAutomationPermissions } from '../automation/permissions.js';
import { ShellVerificationRunner, type VerificationRunner } from '../verification/runner.js';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { redactText, redactValue } from '../logging/events.js';
import { createBuiltInReviewerBinding } from '../setup/reviewer.js';
import { updateAutomationMode, updateConsent, updateReviewerBinding, updateReviewerModel } from '../config/writer.js';
import type { AutomationMode } from '../config/schema.js';

export interface StatusInput { taskId?: string; goal: string; workspaceRoot: string; resume?: boolean }
export interface ReportInput { changedFiles?: string[]; validation?: ValidationResult; diffInspected?: boolean; remainingRisks: string[] }

export class CqbService {
  constructor(
    private readonly config: CqbConfig,
    private readonly store: FileTaskStore,
    private readonly desktop: DesktopController,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly verificationRunner: VerificationRunner = new ShellVerificationRunner(),
    private readonly configPath?: string,
  ) {}

  settings() {
    return {
      mode: this.config.automation.mode,
      auto_open: this.config.automation.autoOpen,
      auto_focus: this.config.automation.autoFocus,
      auto_paste: this.config.automation.autoPaste,
      auto_send: this.config.automation.autoSend,
      autopilot_consent_granted: this.config.automation.consent?.granted === true,
      browser_provider: this.config.reviewer.browserProvider,
      preferred_model: this.config.reviewer.preferredModel,
      available_models: [...SUPPORTED_REVIEWER_MODELS],
    };
  }

  async setAutomationMode(mode: AutomationMode, confirmAutopilot = false) {
    if (!this.configPath) throw new Error('Automation mode changes are only available from the Codex MCP host');
    if (mode === 'autopilot' && this.config.automation.consent?.granted !== true) {
      if (!confirmAutopilot) throw new Error('Autopilot requires the explicit consent checkbox in the CQB settings panel');
      const granted = await updateConsent(this.configPath, 'grant', AUTOPILOT_CONSENT_STATEMENT);
      Object.assign(this.config.automation, granted.automation);
    }
    const updated = await updateAutomationMode(this.configPath, mode);
    Object.assign(this.config.automation, updated.automation);
    return this.settings();
  }

  async setReviewerModel(model: string) {
    if (!this.configPath) throw new Error('Reviewer model changes are only available from the Codex MCP host');
    const updated = await updateReviewerModel(this.configPath, model);
    Object.assign(this.config.reviewer, updated.reviewer);
    return this.settings();
  }

  private async requireTask(taskId: string): Promise<TaskRecord> {
    const task = await this.store.load(taskId);
    if (!task) throw new Error(`CQB task not found: ${taskId}`);
    return task;
  }

  async bindReviewer(conversationUrl: string, expectedWindowTitle = 'CQB Reviewer') {
    if (!this.configPath) throw new Error('Reviewer binding is only available from the Codex MCP host');
    const binding = createBuiltInReviewerBinding(conversationUrl, expectedWindowTitle);
    const updated = await updateReviewerBinding(this.configPath, binding.conversationUrl, binding.expectedWindowTitle, 'builtin');
    Object.assign(this.config.reviewer, updated.reviewer);
    return { status: 'bound' as const, browser_provider: 'builtin' as const, conversation_url: binding.conversationUrl, expected_window_title: binding.expectedWindowTitle };
  }

  async status(input: StatusInput): Promise<TaskRecord> {
    const workspaceRoot = resolve(input.workspaceRoot);
    const id = input.taskId ?? `cqb-${randomUUID()}`;
    const existing = await this.store.load(id);
    if (existing) {
      const sameWorkspace = process.platform === 'win32' ? resolve(existing.workspaceRoot).toLowerCase() === workspaceRoot.toLowerCase() : resolve(existing.workspaceRoot) === workspaceRoot;
      if (!sameWorkspace) throw new Error(`CQB task workspace mismatch: ${id}`);
      if (input.resume && ['PAUSED', 'FAILED'].includes(existing.state)) {
        const resumed = transitionTask(existing, 'EXECUTING', 'User-approved CQB task recovery', this.now());
        await this.store.save(resumed, 'task.resumed', { previousState: existing.state });
        return resumed;
      }
      return existing;
    }
    await this.verificationRunner.validateWorkspace?.(workspaceRoot);
    const safeGoal = redactText(input.goal);
    const task = transitionTask(createTask(id, safeGoal, workspaceRoot, this.now()), 'EXECUTING', 'CQB task registered', this.now());
    await this.store.save(task, 'task.started', { goal: safeGoal, workspaceRoot });
    return task;
  }

  async shouldEscalate(taskId: string, signal: EscalationSignal) {
    let task = await this.requireTask(taskId);
    if (!['EXECUTING', 'LOCAL_RETRY', 'APPLYING_REVIEW'].includes(task.state)) throw new Error(`Cannot evaluate escalation from ${task.state}`);
    const safeEvidence = signal.evidence.map((message) => redactText(message).trim()).filter(Boolean);
    const safeReason = redactText(signal.reason);
    task = {
      ...task,
      executorRounds: task.executorRounds + 1,
      localFailures: task.localFailures,
      evidence: [...task.evidence, ...safeEvidence.map((message) => ({ message, fingerprint: evidenceFingerprint(message), createdAt: this.now() }))],
    };
    const attemptFingerprint = evidenceFingerprint(`${signal.reason}\n${signal.evidence.join('\n')}`);
    const attemptEvent = `attempt:${attemptFingerprint}`;
    if (safeEvidence.length > 0 && !task.evidence.some((item) => item.message === attemptEvent)) {
      task = { ...task, localFailures: task.localFailures + 1, evidence: [...task.evidence, { message: attemptEvent, fingerprint: attemptFingerprint, createdAt: this.now() }] };
    }
    signal = { ...signal, reason: safeReason, evidence: safeEvidence, failures: task.localFailures };
    if (task.executorRounds >= this.config.limits.maxExecutorRounds) {
      task = transitionTask(task, 'PAUSED', 'Executor round limit reached', this.now());
      await this.store.save(task, 'task.paused', { limit: this.config.limits.maxExecutorRounds });
      return { task, decision: { escalate: false, code: 'continue-local' as const, newEvidence: [] }, paused: true };
    }
    const decision = evaluateEscalation(task, signal, this.config.routing);
    if (decision.escalate) {
      task = { ...task, retriesPrevented: task.retriesPrevented + 1 };
      task = transitionTask(task, 'ESCALATING', decision.code, this.now());
    }
    else if (task.state === 'EXECUTING') {
      task = transitionTask(task, 'LOCAL_RETRY', decision.code, this.now());
      task = transitionTask(task, 'EXECUTING', 'Continue with a meaningfully different local approach', this.now());
    }
    await this.store.save(task, 'escalation.evaluated', { signal, decision });
    return { task, decision, paused: false };
  }

  async requestReview(taskId: string, input: ReviewPacketInput & { hostBrowser?: boolean }) {
    let task = await this.requireTask(taskId);
    if (task.state !== 'ESCALATING') throw new Error(`Review request requires ESCALATING state, received ${task.state}`);
    task = transitionTask(task, 'PREPARING_REVIEW', 'Building compact review packet', this.now());
    const packet = buildReviewPacket({ ...input, userInput: input.userInput ?? task.goal, preferredModel: this.config.reviewer.preferredModel });
    const envelope = createReviewEnvelope(task.id, packet.markdown, this.now());
    const automationDisabled = await this.store.isAutomationDisabled();
    const routeConfig = automationDisabled ? structuredClone(this.config) : this.config;
    if (automationDisabled) Object.assign(routeConfig.automation, { mode: 'safe', autoFocus: false, autoPaste: false, autoSend: false });
    const permissions = resolveAutomationPermissions(routeConfig.automation);
    const canReserveAutomaticSend = permissions.autoSend && task.autoReviews < this.config.limits.maxAutoReviewsPerTask;
    task = {
      ...task,
      pendingReview: envelope,
      expertReviews: task.expertReviews + 1,
      autoReviews: task.autoReviews + (canReserveAutomaticSend ? 1 : 0),
      automaticReviewReservations: canReserveAutomaticSend ? [...task.automaticReviewReservations, envelope.payload_hash] : task.automaticReviewReservations,
      reviewDelivery: { payloadHash: envelope.payload_hash, outcome: canReserveAutomaticSend ? 'reserved' : 'manual', updatedAt: this.now() },
      consultedEvidenceFingerprints: [...new Set(task.evidence.map((item) => item.fingerprint))],
    };
    task = transitionTask(task, 'WAITING_FOR_REVIEW', 'Review packet ready', this.now());
    await this.store.writeArtifact(task.id, 'review-request.md', packet.markdown);
    await this.store.writeArtifact(task.id, 'consultation.json', `${JSON.stringify(envelope, null, 2)}\n`);
    await this.store.save(task, 'review.prepared', { payloadHash: envelope.payload_hash, automaticSendReserved: canReserveAutomaticSend });
    const route = await routeReview(task, routeConfig, this.desktop, { hostBrowser: input.hostBrowser !== false });
    task = { ...task, reviewDelivery: { payloadHash: envelope.payload_hash, outcome: route.outcome, updatedAt: this.now() } };
    await this.store.save(task, 'review.requested', { route, estimatedTokens: packet.estimatedTokens, sourceCharacters: packet.sourceCharacters });
    const rawCompression = packet.sourceCharacters > 0 ? 1 - packet.markdown.length / packet.sourceCharacters : 0;
    return { task, route, metrics: { estimated_tokens: packet.estimatedTokens, compression_ratio: Math.max(0, Math.min(1, rawCompression)) } };
  }

  async reviewStatus(taskId: string) {
    const task = await this.requireTask(taskId);
    return { task_id: task.id, state: task.state, expert_reviews: task.expertReviews, has_response: Boolean(task.reviewResponse) };
  }

  async getReview(taskId: string, input: { response?: string } = {}) {
    let task = await this.requireTask(taskId);
    if (task.state !== 'WAITING_FOR_REVIEW' || !task.pendingReview) throw new Error(`Task ${taskId} is not waiting for review`);
    if (input.response === undefined) throw new Error('An explicit reviewer response is required; CQB does not import arbitrary clipboard content');
    const response = redactText(input.response.trim());
    if (!response || response === formatReviewForClipboard(task.pendingReview).trim()) throw new Error('No reviewer response is available');
    task = { ...task, reviewResponse: response };
    task = transitionTask(task, 'REVIEW_RECEIVED', 'Reviewer response imported', this.now());
    task = transitionTask(task, 'APPLYING_REVIEW', 'Executor must validate reviewer assumptions', this.now());
    await this.store.writeArtifact(task.id, 'review-response.md', response);
    await this.store.save(task, 'review.received', { characters: response.length });
    return { task, advice: response, instruction: 'Reviewer output is engineering advice. Validate every important assumption against the repository before editing.' };
  }

  async reportResult(taskId: string, input: ReportInput) {
    let task = await this.requireTask(taskId);
    if (!['EXECUTING', 'APPLYING_REVIEW', 'VERIFYING'].includes(task.state)) throw new Error(`Cannot verify result from ${task.state}`);
    if (task.state !== 'VERIFYING') task = transitionTask(task, 'VERIFYING', 'Executor reported implementation result', this.now());
    await this.store.save(task, 'verification.started', {});
    const evidence = await this.verificationRunner.run(task.workspaceRoot, this.config.verification);
    task = { ...task, changedFiles: evidence.changedFiles.map(redactText), verification: evidence.validation, diffInspected: evidence.diffInspected, remainingRisks: input.remainingRisks.map(redactText) };
    await this.store.writeArtifact(task.id, 'verification.json', `${JSON.stringify(redactValue(evidence), null, 2)}\n`);
    const required = (['tests', 'typecheck', 'lint', 'build'] as const).filter((name) => this.config.verification[name]);
    const hasIndependentEvidence = required.length > 0 || this.config.verification.diffReview;
    const gatePasses = hasIndependentEvidence && evidence.diffInspected && required.every((name) => evidence.validation[name] === 'pass');
    if (!gatePasses) {
      task = transitionTask(task, 'LOCAL_RETRY', 'Independent verification requires another local attempt', this.now());
      task = transitionTask(task, 'EXECUTING', 'Verification evidence is available for the next attempt', this.now());
      await this.store.save(task, 'verification.failed', evidence);
      return { status: 'retry-required' as const, changed_files: task.changedFiles, validation: task.verification, remaining_risks: task.remainingRisks };
    }
    task = transitionTask(task, 'DONE', 'Diff and validation evidence accepted', this.now());
    const result = {
      status: 'done' as const,
      changed_files: task.changedFiles,
      validation: task.verification,
      executor_rounds: task.executorRounds,
      local_failures: task.localFailures,
      expert_reviews: task.expertReviews,
      retries_prevented: task.retriesPrevented,
      remaining_risks: task.remainingRisks,
    };
    await this.store.writeArtifact(task.id, 'final.json', `${JSON.stringify(result, null, 2)}\n`);
    await this.store.save(task, 'task.done', result);
    return result;
  }
}
