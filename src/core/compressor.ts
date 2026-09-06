import { containsPotentialSecret, redactText } from '../logging/events.js';

export interface ReviewPacketInput {
  userInput?: string;
  goal: string;
  currentState: string;
  relevantFiles: Array<{ path: string; relevance: string; excerpt?: string }>;
  relevantSymbols: string[];
  evidence: string[];
  errors: string[];
  attempts: string[];
  diffSummary: string;
  constraints: string[];
  question: string;
}

export interface CompressionLimits { maxChars: number; maxItemChars: number }

const reviewerPrompt = `You are the expert reasoning coprocessor for Codex Quota Bridge. Identify the likely root cause, make the smallest safe engineering decision, identify missing evidence, and define validation. Do not invent repository facts or recommend unnecessary rewrites. Respond with: # Diagnosis, # Decision, # Implementation Plan, # Files / Symbols, # Validation, # Risks, # Confidence. If evidence is insufficient, respond with # Need More Evidence and request only the minimum evidence.`;

export type ReviewLanguage = 'zh-CN' | 'en';

export function detectReviewLanguage(input: string): ReviewLanguage {
  const hanCharacters = input.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latinLetters = input.match(/[A-Za-z]/g)?.length ?? 0;
  const scriptCharacters = hanCharacters + latinLetters;
  return hanCharacters > 0 && (latinLetters === 0 || hanCharacters / scriptCharacters >= 0.2) ? 'zh-CN' : 'en';
}

function bounded(value: string, limit: number): string {
  const clean = redactText(value.trim());
  return clean.length <= limit ? clean : `${clean.slice(0, Math.max(0, limit - 17))}\n[truncated]`;
}

function list(values: string[], limit: number): string {
  return values.length ? values.map((value) => `- ${bounded(value, limit)}`).join('\n') : '- None';
}

export function buildReviewPacket(input: ReviewPacketInput, limits: CompressionLimits = { maxChars: 32_000, maxItemChars: 2_000 }) {
  const files = input.relevantFiles.map((file) => `${file.path} — ${file.relevance}${file.excerpt ? `\n  Excerpt: ${file.excerpt}` : ''}`);
  const responseLanguage = detectReviewLanguage(input.userInput ?? [input.goal, input.currentState, input.question].join('\n'));
  const languageDirective = responseLanguage === 'zh-CN'
    ? 'Respond in Simplified Chinese (zh-CN), matching the language of the user input.'
    : 'Respond in English (en), matching the language of the user input.';
  const content = [
    ['Response Language', languageDirective, 1], ['Goal', input.goal, 1], ['Current State', input.currentState, 1], ['Relevant Files', list(files, limits.maxItemChars), 1],
    ['Relevant Symbols', list(input.relevantSymbols, limits.maxItemChars), 1], ['Evidence', list(input.evidence, limits.maxItemChars), 2],
    ['Errors', list(input.errors, limits.maxItemChars), 2], ['Attempts', list(input.attempts, limits.maxItemChars), 1],
    ['Current Diff', input.diffSummary, 1], ['Constraints', list(input.constraints, limits.maxItemChars), 1.5], ['Question', input.question, 2],
  ] as const;
  const structural = reviewerPrompt.length + content.reduce((sum, [title]) => sum + `\n\n# ${title}\n\n`.length, 0);
  if (limits.maxChars <= structural + content.length * 8) throw new Error('Compression maxChars is too small to preserve the required packet structure');
  const totalWeight = content.reduce((sum, [, , weight]) => sum + weight, 0);
  const available = limits.maxChars - structural;
  const sections = content.map(([title, value, weight]) => `# ${title}\n\n${bounded(value, Math.min(limits.maxItemChars, Math.floor(available * weight / totalWeight)))}`);
  const markdown = [reviewerPrompt, ...sections].join('\n\n');
  if (containsPotentialSecret(markdown)) throw new Error('Review packet contains a high-confidence secret after redaction');
  return { markdown, estimatedTokens: Math.ceil(markdown.length / 4), sourceCharacters: JSON.stringify(input).length };
}
