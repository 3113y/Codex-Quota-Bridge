import { createHash } from 'node:crypto';

export function normalizeEvidence(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[a-f0-9]{12,}/g, '<id>')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, '<time>')
    .replace(/\b\d+\b/g, '<n>')
    .replace(/\s+/g, ' ');
}

export function evidenceFingerprint(value: string): string {
  return createHash('sha256').update(normalizeEvidence(value)).digest('hex');
}
