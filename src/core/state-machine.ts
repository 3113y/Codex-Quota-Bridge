import type { TaskRecord, TaskStateName } from './types.js';

const transitions: Record<TaskStateName, readonly TaskStateName[]> = {
  IDLE: ['EXECUTING', 'ABORTED'],
  EXECUTING: ['LOCAL_RETRY', 'ESCALATING', 'VERIFYING', 'PAUSED', 'FAILED', 'ABORTED'],
  LOCAL_RETRY: ['EXECUTING', 'ESCALATING', 'PAUSED', 'FAILED', 'ABORTED'],
  ESCALATING: ['PREPARING_REVIEW', 'EXECUTING', 'PAUSED', 'FAILED', 'ABORTED'],
  PREPARING_REVIEW: ['WAITING_FOR_REVIEW', 'FAILED', 'ABORTED'],
  WAITING_FOR_REVIEW: ['REVIEW_RECEIVED', 'PAUSED', 'FAILED', 'ABORTED'],
  REVIEW_RECEIVED: ['APPLYING_REVIEW', 'PAUSED', 'ABORTED'],
  APPLYING_REVIEW: ['VERIFYING', 'LOCAL_RETRY', 'ESCALATING', 'PAUSED', 'FAILED', 'ABORTED'],
  VERIFYING: ['DONE', 'LOCAL_RETRY', 'PAUSED', 'FAILED', 'ABORTED'],
  PAUSED: ['EXECUTING', 'WAITING_FOR_REVIEW', 'APPLYING_REVIEW', 'VERIFYING', 'ABORTED'],
  FAILED: ['EXECUTING', 'ABORTED'],
  DONE: [],
  ABORTED: [],
};

export class InvalidTransitionError extends Error {
  constructor(from: TaskStateName, to: TaskStateName) {
    super(`Invalid CQB transition: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition(from: TaskStateName, to: TaskStateName): boolean {
  return transitions[from].includes(to);
}

export function transitionTask(task: TaskRecord, to: TaskStateName, reason: string, now = new Date().toISOString()): TaskRecord {
  if (!canTransition(task.state, to)) throw new InvalidTransitionError(task.state, to);
  return {
    ...task,
    state: to,
    updatedAt: now,
    stateHistory: [...task.stateHistory, { from: task.state, to, reason, at: now }],
  };
}

export { transitions as validTransitions };
