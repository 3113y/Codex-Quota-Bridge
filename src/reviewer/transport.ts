import type { TaskRecord } from '../core/types.js';

export type RouteOutcome = 'prepared' | 'host-browser-required' | 'pasted' | 'sent' | 'target-verification-failed' | 'payload-validation-failed' | 'permission-denied' | 'send-limit-reached';
export interface HostBrowserAction {
  provider: 'builtin';
  conversationUrl: string;
  packet: string;
  instruction: string;
  setupRequired?: boolean;
  selectionHint?: string;
  creationPrompt?: string;
}
export interface RouteResult { outcome: RouteOutcome; message: string; browserAction?: HostBrowserAction }

export interface ReviewerTransport {
  prepareReview(task: TaskRecord): Promise<RouteResult>;
  receiveReview(task: TaskRecord): Promise<string | undefined>;
}
