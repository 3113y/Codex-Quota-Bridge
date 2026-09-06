import type { CqbConfig } from '../config/schema.js';
import type { ForegroundTarget } from '../automation/target-verifier.js';

export interface ReviewerBindingSnapshot extends ForegroundTarget {
  conversationUrl: string;
}

function validateConversationUrl(conversationUrl: string): void {
  let url: URL;
  try { url = new URL(conversationUrl); } catch { throw new Error('Built-in Browser reviewer URL is invalid'); }
  if (url.protocol !== 'https:' || url.hostname !== 'chatgpt.com' || !/^\/c\/[^/]+/.test(url.pathname)) throw new Error('Built-in Browser reviewer URL must be an https://chatgpt.com/c/... conversation');
}

export function createBuiltInReviewerBinding(conversationUrl: string, expectedWindowTitle = 'CQB Reviewer'): { conversationUrl: string; expectedWindowTitle: string } {
  validateConversationUrl(conversationUrl);
  const title = expectedWindowTitle.trim();
  if (!title) throw new Error('Built-in Browser reviewer title must be non-empty');
  return { conversationUrl, expectedWindowTitle: title };
}

function parseSnapshot(value: unknown): ReviewerBindingSnapshot | undefined {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    if (typeof record.processName !== 'string' || typeof record.title !== 'string' || typeof record.processId !== 'number' || typeof record.windowHandle !== 'string' || typeof record.conversationUrl !== 'string' || !record.conversationUrl.trim()) return undefined;
    return {
      processName: record.processName,
      title: record.title,
      processId: record.processId,
      windowHandle: record.windowHandle,
      conversationUrl: record.conversationUrl,
    };
  } catch {
    return undefined;
  }
}

export function parseReviewerBindingSnapshot(output: string): ReviewerBindingSnapshot | undefined {
  try { return parseSnapshot(JSON.parse(output)); } catch { return undefined; }
}

export function parseReviewerBindingSnapshots(output: string): ReviewerBindingSnapshot[] {
  try {
    const value = JSON.parse(output);
    return (Array.isArray(value) ? value : [value]).map(parseSnapshot).filter((item): item is ReviewerBindingSnapshot => item !== undefined);
  } catch {
    return [];
  }
}

export function validateReviewerBinding(snapshot: ReviewerBindingSnapshot, reviewer: CqbConfig['reviewer']): { valid: boolean; reason?: string } {
  if (!reviewer.allowedProcesses.some((name) => name.toLowerCase() === snapshot.processName.toLowerCase())) return { valid: false, reason: 'unexpected-process' };
  if (!snapshot.title.trim()) return { valid: false, reason: 'missing-window-title' };
  if (!Number.isInteger(snapshot.processId) || snapshot.processId <= 0 || !/^\d+$/.test(snapshot.windowHandle) || snapshot.windowHandle === '0') return { valid: false, reason: 'missing-window-identity' };
  try { validateConversationUrl(snapshot.conversationUrl); } catch (error) { return { valid: false, reason: error instanceof Error ? error.message : 'invalid-conversation-url' }; }
  return { valid: true };
}

export function createReviewerBinding(snapshot: ReviewerBindingSnapshot, reviewer: CqbConfig['reviewer'], expectedWindowTitle?: string): { conversationUrl: string; expectedWindowTitle: string } {
  const validation = validateReviewerBinding(snapshot, reviewer);
  if (!validation.valid) throw new Error(`Reviewer setup target validation failed: ${validation.reason}`);
  const title = expectedWindowTitle?.trim() || snapshot.title.trim();
  if (!title || !snapshot.title.toLowerCase().includes(title.toLowerCase())) throw new Error('Configured reviewer title must match the active browser window title');
  return { conversationUrl: snapshot.conversationUrl, expectedWindowTitle: title };
}

export function selectReviewerBinding(snapshots: ReviewerBindingSnapshot[], reviewer: CqbConfig['reviewer'], expectedWindowTitle?: string): ReviewerBindingSnapshot {
  const title = expectedWindowTitle?.trim().toLowerCase();
  const valid = snapshots.filter((snapshot) => validateReviewerBinding(snapshot, reviewer).valid && (!title || snapshot.title.toLowerCase().includes(title)));
  if (valid.length === 0) throw new Error('No valid ChatGPT conversation window was found; keep the conversation open in Chrome or Edge and try again');
  if (valid.length > 1) throw new Error('Multiple valid ChatGPT conversation windows were found; use --window-title to select one');
  return valid[0] as ReviewerBindingSnapshot;
}
