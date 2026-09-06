import { createHash, timingSafeEqual } from 'node:crypto';
import type { ReviewEnvelope, TaskRecord } from '../core/types.js';

export function hashPayload(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

export function createReviewEnvelope(taskId: string, payload: string, now = new Date().toISOString()): ReviewEnvelope {
  return { type: 'CQB_REVIEW_REQUEST', task_id: taskId, created_at: now, state: 'WAITING_FOR_REVIEW', payload_hash: hashPayload(payload), payload };
}

export function validatePendingEnvelope(envelope: ReviewEnvelope, task: TaskRecord): { valid: boolean; reason?: string } {
  if (envelope.type !== 'CQB_REVIEW_REQUEST') return { valid: false, reason: 'unsupported-payload-type' };
  if (envelope.task_id !== task.id) return { valid: false, reason: 'inactive-task' };
  if (task.state !== 'WAITING_FOR_REVIEW' || envelope.state !== 'WAITING_FOR_REVIEW') return { valid: false, reason: 'invalid-state' };
  const actual = Buffer.from(hashPayload(envelope.payload), 'hex');
  const claimed = Buffer.from(envelope.payload_hash, 'hex');
  if (actual.length !== claimed.length || !timingSafeEqual(actual, claimed)) return { valid: false, reason: 'payload-hash-mismatch' };
  if (!task.pendingReview || task.pendingReview.payload_hash !== envelope.payload_hash) return { valid: false, reason: 'not-pending-payload' };
  return { valid: true };
}
