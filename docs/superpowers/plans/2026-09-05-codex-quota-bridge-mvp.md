# Codex Quota Bridge MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable Windows-first CQB plugin that detects diminishing-return retries, creates compact review packets, safely routes them to a ChatGPT Plus reviewer, resumes through imported advice, and gates completion on verification.

**Architecture:** A Codex plugin bundles one routing Skill, lifecycle hooks, and a dependency-light STDIO MCP server. Focused core modules own state, routing, packet creation, permissions, transport, automation, and final verification; filesystem and Windows UI effects are injected behind interfaces so all safety behavior can be tested without controlling a real desktop.

**Tech Stack:** TypeScript, Node.js 22, MCP over JSON-RPC/STDIO, pnpm, Node test runner, Windows PowerShell and Win32 APIs.

## Global Constraints

- Windows-first.
- Safe mode is the default.
- `max_local_failures: 2`, `max_reviews_per_task: 2`, and `max_auto_reviews_per_task: 2` by default.
- Automatic external submission is available only after explicit persisted consent.
- Never send arbitrary clipboard content or operate on an unverified target.
- Never forward a complete Codex transcript or repository.
- Keep the conceptual CQB tool surface stable.
- Do not claim exact quota savings.

---

### Task 1: Project and plugin shell

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `.codex-plugin/plugin.json`, `.mcp.json`
- Create: `skills/cqb-routing/SKILL.md`, `hooks/hooks.json`, `hooks/session-context.mjs`
- Test: `tests/plugin-package.test.ts`

**Interfaces:**
- Produces: an installable `codex-quota-bridge` plugin whose MCP command runs `dist/mcp/server.js` and whose hooks add CQB session context.

- [x] Write a package test that asserts the manifest points only to existing Skill, MCP, and hook paths.
- [x] Run `pnpm test tests/plugin-package.test.ts` and confirm the missing manifest failure.
- [x] Scaffold the plugin with the official plugin creator, then replace scaffold metadata with CQB metadata and add the project files.
- [x] Run the package test and the plugin validator.

### Task 2: Persistent state machine and event store

**Files:**
- Create: `src/core/types.ts`, `src/core/state-machine.ts`, `src/core/store.ts`, `src/logging/events.ts`
- Test: `tests/state-machine.test.ts`, `tests/store.test.ts`

**Interfaces:**
- Produces: `transitionTask(task, target, reason)`, `FileTaskStore.load/save/create`, and append-only redacted events.

- [x] Write tests for every accepted workflow edge, rejected transitions, restart persistence, and secret-field redaction.
- [x] Run the focused tests and confirm failures caused by missing modules.
- [x] Implement the explicit state graph, atomic JSON persistence, and JSONL event writer.
- [x] Run focused and full tests.

### Task 3: Escalation policy and circuit breaker

**Files:**
- Create: `src/core/escalation.ts`, `src/core/evidence.ts`
- Test: `tests/escalation.test.ts`

**Interfaces:**
- Produces: `evaluateEscalation(task, signal, config)` returning an explainable accept/reject decision and normalized evidence fingerprints.

- [x] Write failing tests for confidence, two independent failures, similar failures, explicit review, architecture risk, consultation limits, and new-evidence requirements.
- [x] Implement the smallest explainable policy that satisfies the tests.
- [x] Run focused and full tests.

### Task 4: Context compression and payload validation

**Files:**
- Create: `src/core/compressor.ts`, `src/reviewer/prompt.ts`, `src/reviewer/validator.ts`
- Test: `tests/compressor.test.ts`, `tests/payload-validator.test.ts`

**Interfaces:**
- Produces: `buildReviewPacket(input, limits)`, `createReviewEnvelope(taskId, packet)`, and `validatePendingEnvelope(envelope, task)`.

- [x] Write failing tests for the required packet sections, bounded excerpts/output, redaction, SHA-256 metadata, active-task binding, state binding, and tamper rejection.
- [x] Implement deterministic compression and envelope validation.
- [x] Run focused and full tests.

### Task 5: Reviewer transport and automation permissions

**Files:**
- Create: `src/reviewer/transport.ts`, `src/reviewer/clipboard.ts`, `src/automation/permissions.ts`, `src/automation/target-verifier.ts`, `src/automation/windows.ts`
- Test: `tests/automation.test.ts`, `tests/clipboard.test.ts`

**Interfaces:**
- Produces: `ClipboardReviewerTransport`, `resolveAutomationPermissions`, `verifyTarget`, and an injected `DesktopController` contract.

- [x] Write failing tests that prove Safe cannot paste/send, Assisted can paste but not send, Autopilot requires consent, validation failures fail closed, and send limits block additional input.
- [x] Implement Windows clipboard/open/focus/paste/send effects behind the controller while keeping tests fully simulated.
- [x] Run focused and full tests.

### Task 6: CQB service, MCP server, and CLI

**Files:**
- Create: `src/core/service.ts`, `src/config/schema.ts`, `src/config/loader.ts`, `src/mcp/protocol.ts`, `src/mcp/server.ts`, `src/cli/index.ts`
- Test: `tests/service-flow.test.ts`, `tests/mcp.test.ts`, `tests/cli.test.ts`

**Interfaces:**
- Produces: the seven stable MCP tools, administrative CLI commands, review response import, and a verification-gated final result.

- [x] Write an end-to-end failing test for create, two failures, accepted escalation, review request, response import, apply, verify, and `DONE`.
- [x] Write protocol tests for initialize, tools/list, valid tools/call, invalid arguments, and parse errors.
- [x] Implement the service orchestration, config loader, STDIO protocol loop, and CLI.
- [x] Run focused and full tests.

### Task 7: Mock acceptance flow and documentation

**Files:**
- Create: `scripts/demo.mjs`, `config.example.yaml`, `README.md`, `docs/windows-installation.md`, `docs/security.md`, `docs/limitations.md`, `docs/roadmap.md`
- Test: `tests/demo.test.ts`

**Interfaces:**
- Produces: `pnpm demo`, complete installation and mode configuration guidance, an architecture diagram, and status boundaries for the MVP.

- [x] Write a failing test that runs the mocked acceptance flow and inspects its structured final result.
- [x] Implement the demo and documentation with exact commands and expected state progression.
- [x] Run the demo, documentation checks, and full tests.

### Task 8: Release verification

**Files:**
- Modify: plan checkboxes and any files implicated by verification failures.

**Interfaces:**
- Consumes: all prior deliverables.
- Produces: a validated, runnable source tree.

- [x] Install dependencies with `pnpm install` and preserve the lockfile.
- [x] Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm demo`, and the plugin validator.
- [x] Inspect every user-facing file for final-state wording and every repository file for credentials or unrelated clipboard data.
- [x] Record the exact verification results in the handoff.
