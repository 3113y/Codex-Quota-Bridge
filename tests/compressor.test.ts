import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReviewPacket } from '../src/core/compressor.js';

test('builds the required compact packet and redacts common secrets', () => {
  const packet = buildReviewPacket({
    goal: 'Fix the worker',
    currentState: 'Two approaches failed',
    relevantFiles: [{ path: 'src/worker.ts', relevance: 'owns retry logic' }],
    relevantSymbols: ['runWorker'],
    evidence: ['API returned 409'],
    errors: ['Authorization: Bearer abcdef1234567890'],
    attempts: ['Changed retry order'],
    diffSummary: 'One test added',
    constraints: ['Minimal diff'],
    question: 'What invariant is broken?',
  }, { maxChars: 8_000, maxItemChars: 1_000 });

  for (const section of ['# Goal', '# Current State', '# Relevant Files', '# Relevant Symbols', '# Evidence', '# Errors', '# Attempts', '# Current Diff', '# Constraints', '# Question']) {
    assert.match(packet.markdown, new RegExp(section));
  }
  assert.match(packet.markdown, /\[REDACTED\]/);
  assert.doesNotMatch(packet.markdown, /abcdef1234567890/);
  assert.ok(packet.estimatedTokens > 0);
  assert.ok(packet.markdown.length <= 8_000);
});

test('truncates oversized packet content deterministically', () => {
  const input = {
    goal: 'g', currentState: 's', relevantFiles: [], relevantSymbols: [], evidence: ['x'.repeat(10_000)],
    errors: [], attempts: [], diffSummary: 'd', constraints: [], question: 'q',
  };
  const first = buildReviewPacket(input, { maxChars: 2_000, maxItemChars: 500 });
  const second = buildReviewPacket(input, { maxChars: 2_000, maxItemChars: 500 });
  assert.equal(first.markdown, second.markdown);
  assert.ok(first.markdown.length <= 2_000);
  assert.match(first.markdown, /truncated/);
  for (const section of ['# Goal', '# Current State', '# Relevant Files', '# Relevant Symbols', '# Evidence', '# Errors', '# Attempts', '# Current Diff', '# Constraints', '# Question']) {
    assert.match(first.markdown, new RegExp(section));
  }
});

test('redacts common credential forms before external routing', () => {
  const packet = buildReviewPacket({
    goal: 'g', currentState: 's', relevantFiles: [], relevantSymbols: [],
    evidence: ['password = hunter2-secret', 'github_pat_11AA22BB33CC44DD55EE'],
    errors: ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signaturevalue', 'Cookie: sessionid=abcdef1234567890; csrf=zyx987654321'], attempts: [],
    diffSummary: 'postgres://alice:supersecret@db.example/test', constraints: [], question: 'q',
  });
  assert.doesNotMatch(packet.markdown, /hunter2|github_pat_|eyJhbGci|supersecret|sessionid|csrf=/);
  assert.match(packet.markdown, /\[REDACTED\]/);
});

test('adds an explicit Simplified Chinese response-language directive', () => {
  const packet = buildReviewPacket({
    userInput: '检测用户输入语言，并让 CQB 专家使用中文回复',
    goal: '检测用户输入语言并强调专家使用中文回复', currentState: '已经触发专家讨论',
    relevantFiles: [], relevantSymbols: [], evidence: [], errors: [], attempts: [],
    diffSummary: '无代码变更', constraints: [], question: '应该如何设计语言检测？',
  });

  assert.match(packet.markdown, /# Response Language/);
  assert.match(packet.markdown, /Respond in Simplified Chinese \(zh-CN\)/);
});

test('includes the configured reviewer model in the packet', () => {
  const packet = buildReviewPacket({
    preferredModel: 'terra', goal: 'g', currentState: 's', relevantFiles: [], relevantSymbols: [], evidence: [], errors: [], attempts: [],
    diffSummary: 'd', constraints: [], question: 'q',
  });
  assert.match(packet.markdown, /# Reviewer Model/);
  assert.match(packet.markdown, /Preferred ChatGPT reviewer model: terra/);
});

test('adds an explicit English response-language directive', () => {
  const packet = buildReviewPacket({
    userInput: 'Detect the user input language and ask the CQB expert to respond in English',
    goal: 'Detect the user input language and guide the expert response', currentState: 'Expert discussion is requested',
    relevantFiles: [], relevantSymbols: [], evidence: [], errors: [], attempts: [],
    diffSummary: 'No production change', constraints: [], question: 'How should language detection work?',
  });

  assert.match(packet.markdown, /# Response Language/);
  assert.match(packet.markdown, /Respond in English \(en\)/);
});

test('uses the explicit user input for mixed-language requests', () => {
  const packet = buildReviewPacket({
    userInput: '请修复 CQB reviewer 的语言检测问题',
    goal: 'Implement the language detector', currentState: 'The implementation is ready for review',
    relevantFiles: [], relevantSymbols: [], evidence: [], errors: [], attempts: [],
    diffSummary: 'No production change', constraints: [], question: 'What should be validated?',
  });

  assert.match(packet.markdown, /Respond in Simplified Chinese \(zh-CN\)/);
});
