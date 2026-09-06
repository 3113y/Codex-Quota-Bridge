import type { CqbConfig } from '../config/schema.js';

export interface ForegroundTarget { processName: string; title: string; processId: number; windowHandle: string }

export function verifyTarget(target: ForegroundTarget, reviewer: CqbConfig['reviewer']): { valid: boolean; reason?: string } {
  let url: URL;
  try { url = new URL(reviewer.conversationUrl); } catch { return { valid: false, reason: 'invalid-conversation-url' }; }
  if (url.protocol !== 'https:' || url.hostname !== 'chatgpt.com') return { valid: false, reason: 'conversation-url-not-chatgpt' };
  if (!reviewer.allowedProcesses.some((name) => name.toLowerCase() === target.processName.toLowerCase())) return { valid: false, reason: 'unexpected-process' };
  if (!reviewer.expectedWindowTitle.trim()) return { valid: false, reason: 'missing-window-title' };
  if (!target.title.toLowerCase().includes(reviewer.expectedWindowTitle.toLowerCase())) return { valid: false, reason: 'unexpected-window-title' };
  if (!Number.isInteger(target.processId) || target.processId <= 0 || !/^\d+$/.test(target.windowHandle) || target.windowHandle === '0') return { valid: false, reason: 'missing-window-identity' };
  return { valid: true };
}

export function sameTarget(left: ForegroundTarget, right: ForegroundTarget): boolean {
  return left.processId === right.processId && left.windowHandle === right.windowHandle;
}
