# Review Language Directive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect the language of the task's user-provided review context and explicitly instruct the CQB expert to answer in that language.

**Architecture:** Add a small deterministic language detector beside review-packet construction. Use the existing goal, current state, and question as the user-context signal, classify Chinese versus English with a stable fallback, and add one explicit language directive to the packet before its evidence sections. Keep redaction, size limits, and routing unchanged.

**Tech Stack:** TypeScript, Node test runner, tsx, existing CQB packet compressor.

## Global Constraints

- Preserve compact packet limits and existing secret redaction.
- Do not add network calls, model calls, or browser automation.
- Keep Safe routing and reviewer-response handling unchanged.
- The directive must describe only the selected language and must not expose raw unrelated input.

---

### Task 1: Add deterministic review-language detection

**Files:**
- Modify: `src/core/compressor.ts`
- Test: `tests/compressor.test.ts`

**Interfaces:**
- Produces `detectReviewLanguage(input: string): 'zh-CN' | 'en'` for packet construction and direct unit testing.
- `buildReviewPacket` adds `# Response Language` with an explicit instruction based on the combined user-context fields.

- [ ] **Step 1: Write the failing tests**

Add tests that assert Chinese context produces a Chinese directive, English context produces an English directive, and the packet remains bounded:

```ts
test('adds an explicit Simplified Chinese response-language directive', () => {
  const packet = buildReviewPacket({
    goal: '检测用户输入语言并强调专家使用中文回复', currentState: '已经触发专家讨论',
    relevantFiles: [], relevantSymbols: [], evidence: [], errors: [], attempts: [],
    diffSummary: '无代码变更', constraints: [], question: '应该如何设计语言检测？',
  });

  assert.match(packet.markdown, /# Response Language/);
  assert.match(packet.markdown, /Respond in Simplified Chinese \(zh-CN\)/);
});

test('adds an explicit English response-language directive', () => {
  const packet = buildReviewPacket({
    goal: 'Detect the user input language and guide the expert response', currentState: 'Expert discussion is requested',
    relevantFiles: [], relevantSymbols: [], evidence: [], errors: [], attempts: [],
    diffSummary: 'No production change', constraints: [], question: 'How should language detection work?',
  });

  assert.match(packet.markdown, /# Response Language/);
  assert.match(packet.markdown, /Respond in English \(en\)/);
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `pnpm exec tsx --test tests/compressor.test.ts`

Expected: FAIL because the packet has no `# Response Language` section.

- [ ] **Step 3: Implement the minimal detector and packet section**

Count Han characters and Latin letters in the supplied context. Select `zh-CN` when Han characters are at least as frequent as Latin letters; otherwise select `en`. Add the directive as a packet section and include it in structural sizing.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `pnpm exec tsx --test tests/compressor.test.ts`

Expected: PASS, including the existing redaction and truncation tests.

- [ ] **Step 5: Run repository verification**

Run: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm demo`, and `pnpm verify:package`.

Expected: all available checks pass; if the host reproduces the known Node `uv_os_get_passwd ENOMEM` startup failure, record it as environment evidence rather than changing production code.

## Self-Review

- The feature is covered at the packet boundary where the expert actually receives instructions.
- Existing routing, browser, consent, and verification behavior remain outside the change scope.
- The implementation has no placeholder steps or new external dependency.
