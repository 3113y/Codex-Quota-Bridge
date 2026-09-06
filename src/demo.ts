import type { ForegroundTarget } from './automation/target-verifier.js';
import { defaultConfig } from './config/schema.js';
import { CqbService } from './core/service.js';
import { FileTaskStore } from './core/store.js';
import type { DesktopController } from './reviewer/clipboard.js';
import type { VerificationRunner } from './verification/runner.js';

class DemoDesktop implements DesktopController {
  private clipboard = '';
  private readonly target = { processName: 'chrome', title: 'CQB Reviewer - ChatGPT', processId: 42, windowHandle: '1001' };
  async openUrl(): Promise<void> {}
  async findTarget(): Promise<ForegroundTarget> { return this.target; }
  async focus(): Promise<boolean> { return true; }
  async getForegroundTarget(): Promise<ForegroundTarget> { return this.target; }
  async pasteVerified(): Promise<boolean> { return true; }
  async sendVerified(): Promise<boolean> { return true; }
  async setClipboard(value: string): Promise<void> { this.clipboard = value; }
  async getClipboard(): Promise<string> { return this.clipboard; }
  async notify(): Promise<void> {}
}

export async function runMockDemo(stateRoot: string) {
  const verification: VerificationRunner = { async run() { return { changedFiles: ['src/worker.ts', 'tests/worker.test.ts'], diffInspected: true, diff: { statusHash: '', workingTreeHash: '', stagedHash: '', statusLines: 2 }, validation: { tests: 'pass', typecheck: 'pass', lint: 'pass', build: 'pass' }, commands: [] }; } };
  const service = new CqbService(defaultConfig, new FileTaskStore(stateRoot), new DemoDesktop(), undefined, verification);
  await service.status({ taskId: 'mock-difficult-task', goal: 'Repair duplicate worker scheduling', workspaceRoot: stateRoot });
  await service.shouldEscalate('mock-difficult-task', {
    confidence: 0.82, failures: 1, reason: 'Locking attempt failed', evidence: ['worker test reports duplicate job'],
  });
  await service.shouldEscalate('mock-difficult-task', {
    confidence: 0.42, failures: 2, reason: 'Queue ordering attempt failed', evidence: ['worker test reports duplicate job', 'runtime reports stale queue owner'],
  });
  await service.requestReview('mock-difficult-task', {
    goal: 'Repair duplicate worker scheduling',
    currentState: 'Two meaningful approaches failed and the circuit breaker opened.',
    relevantFiles: [{ path: 'src/worker.ts', relevance: 'Owns dequeue and job ownership' }],
    relevantSymbols: ['dequeue', 'claimJob'],
    evidence: ['worker test reports duplicate job', 'runtime reports stale queue owner'],
    errors: ['AssertionError: expected one job execution, received two'],
    attempts: ['Serialized the worker loop', 'Changed queue ordering'],
    diffSummary: 'No production change retained.',
    constraints: ['Preserve the current queue interface', 'Use a minimal diff'],
    question: 'Which ownership invariant should the Executor enforce?',
  });
  await service.getReview('mock-difficult-task', { response: '# Decision\n\nMake claimJob atomic per job id and verify ownership before dequeue.' });
  return service.reportResult('mock-difficult-task', { remainingRisks: [] });
}
