import type { CqbConfig } from '../config/schema.js';
import { evidenceFingerprint, normalizeEvidence } from './evidence.js';
import type { TaskRecord } from './types.js';

export interface EscalationSignal {
  confidence: number;
  failures: number;
  reason: string;
  evidence: string[];
  explicitReview?: boolean;
  architectureJudgment?: boolean;
  riskyCrossCutting?: boolean;
}

export interface EscalationDecision {
  escalate: boolean;
  code: 'continue-local' | 'explicit-review' | 'architecture-judgment' | 'local-failure-limit' | 'repeated-failure-pattern' | 'new-evidence-required' | 'review-limit-reached';
  newEvidence: string[];
}

export function evaluateEscalation(task: TaskRecord, signal: EscalationSignal, config: CqbConfig['routing']): EscalationDecision {
  const normalized = signal.evidence.map(normalizeEvidence).filter(Boolean);
  const fingerprints = signal.evidence.map(evidenceFingerprint);
  const newEvidence = normalized.filter((value, index) => {
    const fingerprint = fingerprints[index] ?? '';
    return !task.consultedEvidenceFingerprints.includes(fingerprint) && !task.consultedEvidenceFingerprints.includes(value);
  });
  if (task.expertReviews >= config.maxReviewsPerTask) return { escalate: false, code: 'review-limit-reached', newEvidence };
  if (task.expertReviews > 0 && config.requireNewEvidence && newEvidence.length === 0) return { escalate: false, code: 'new-evidence-required', newEvidence };
  if (signal.explicitReview) return { escalate: true, code: 'explicit-review', newEvidence };
  if ((signal.architectureJudgment || signal.riskyCrossCutting) && signal.confidence < config.confidenceThreshold) {
    return { escalate: true, code: 'architecture-judgment', newEvidence };
  }
  if (signal.failures >= config.maxLocalFailures) {
    const unique = new Set(fingerprints);
    return { escalate: true, code: unique.size < fingerprints.length ? 'repeated-failure-pattern' : 'local-failure-limit', newEvidence };
  }
  return { escalate: false, code: 'continue-local', newEvidence };
}
