export type TaskStateName =
  | 'IDLE'
  | 'EXECUTING'
  | 'LOCAL_RETRY'
  | 'ESCALATING'
  | 'PREPARING_REVIEW'
  | 'WAITING_FOR_REVIEW'
  | 'REVIEW_RECEIVED'
  | 'APPLYING_REVIEW'
  | 'VERIFYING'
  | 'DONE'
  | 'PAUSED'
  | 'FAILED'
  | 'ABORTED';

export type ValidationStatus = 'pass' | 'failed' | 'skipped';

export interface ReviewEnvelope {
  type: 'CQB_REVIEW_REQUEST';
  task_id: string;
  created_at: string;
  state: 'WAITING_FOR_REVIEW';
  payload_hash: string;
  payload: string;
}

export interface EvidenceRecord {
  message: string;
  fingerprint: string;
  createdAt: string;
}

export interface ValidationResult {
  tests: ValidationStatus;
  typecheck: ValidationStatus;
  lint: ValidationStatus;
  build: ValidationStatus;
}

export interface TaskRecord {
  id: string;
  goal: string;
  workspaceRoot: string;
  state: TaskStateName;
  createdAt: string;
  updatedAt: string;
  stateHistory: Array<{ from: TaskStateName; to: TaskStateName; reason: string; at: string }>;
  executorRounds: number;
  localFailures: number;
  expertReviews: number;
  autoReviews: number;
  automaticReviewReservations: string[];
  reviewDelivery?: { payloadHash: string; outcome: string; updatedAt: string };
  retriesPrevented: number;
  evidence: EvidenceRecord[];
  consultedEvidenceFingerprints: string[];
  pendingReview?: ReviewEnvelope;
  reviewResponse?: string;
  changedFiles: string[];
  verification?: ValidationResult;
  diffInspected: boolean;
  remainingRisks: string[];
}

export function createTask(id: string, goal: string, workspaceRoot: string, now = new Date().toISOString()): TaskRecord {
  return {
    id,
    goal,
    workspaceRoot,
    state: 'IDLE',
    createdAt: now,
    updatedAt: now,
    stateHistory: [],
    executorRounds: 0,
    localFailures: 0,
    expertReviews: 0,
    autoReviews: 0,
    automaticReviewReservations: [],
    retriesPrevented: 0,
    evidence: [],
    consultedEvidenceFingerprints: [],
    changedFiles: [],
    diffInspected: false,
    remainingRisks: [],
  };
}
