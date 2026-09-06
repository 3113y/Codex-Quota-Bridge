const sensitiveKey = /(?:password|secret|token|cookie|authorization|api[_-]?key)/i;
const secretPatterns: RegExp[] = [
  /(?:Bearer|Basic)\s+[A-Za-z0-9+/._=-]{8,}/gi,
  /\b(?:sk-[A-Za-z0-9_-]{8,}|github_pat_[A-Za-z0-9_]{12,}|gh[oprsu]_[A-Za-z0-9]{12,}|AKIA[A-Z0-9]{12,})\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
  /\b(?:cookie|set-cookie|x-auth-token|x-session-token)\s*:\s*[^\r\n]+/gi,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@[^\s]+/gi,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi,
];

export function redactText(value: string): string {
  return secretPatterns.reduce((redacted, pattern) => redacted.replace(pattern, '[REDACTED]'), value);
}

export function containsPotentialSecret(value: string): boolean {
  return secretPatterns.some((pattern) => { pattern.lastIndex = 0; return pattern.test(value); });
}

export function redactValue(value: unknown, key = ''): unknown {
  if (sensitiveKey.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redactValue(child, childKey)]));
  }
  return value;
}

export function makeEvent(type: string, taskId: string, data: unknown, now = new Date().toISOString()): string {
  return JSON.stringify({ at: now, type, taskId, data: redactValue(data) });
}
