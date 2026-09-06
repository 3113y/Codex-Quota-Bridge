# Built-in Browser First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CQB request the Codex desktop host's built-in `@Browser` for reviewer setup and delivery when available, while preserving a verified Chrome/Edge fallback for CLI and unsupported hosts.

**Architecture:** CQB's local MCP server cannot directly invoke a sibling host tool, so it will expose a host-browser action request as structured routing output. The CQB Skill will instruct the Codex Executor to fulfill that request with `@Browser` and return the confirmed conversation URL/response explicitly. Local Windows UI Automation remains the deterministic fallback and the only path available to Codex CLI.

**Tech Stack:** TypeScript, Node.js 22, Codex plugin Skill, local STDIO MCP, Windows UI Automation, Node test runner.

## Global Constraints

- Safe mode remains the default and never sends keyboard input.
- Built-in Browser setup requires explicit user confirmation and a validated `https://chatgpt.com/c/...` URL.
- The built-in Browser profile is separate from the user's normal Chrome/Edge profile.
- Codex CLI keeps the existing Chrome/Edge fallback.
- No cookies, credentials, arbitrary clipboard content, or full transcripts are passed to CQB.

### Task 1: Define host-browser routing contract

**Files:**
- Modify: `src/reviewer/transport.ts`
- Modify: `src/reviewer/clipboard.ts`
- Test: `tests/reviewer-routing.test.ts`

**Interfaces:**
- Produce `BrowserActionRequest` with `action`, `conversationUrl`, and `payload` fields.
- Produce `RouteResult` outcome `host-browser-required` when the host must invoke `@Browser`.

- [x] **Step 1: Write the failing test** for a desktop host-browser route request that contains only the validated conversation URL and CQB packet.
- [x] **Step 2: Run `pnpm test` and verify the new assertion fails because the route result does not yet expose a host-browser request.
- [x] **Step 3: Add the minimal route contract and return value without changing Assisted/Autopilot behavior.
- [x] **Step 4: Run `pnpm test` and verify the routing tests pass.

### Task 2: Make the Skill and setup flow browser-first

**Files:**
- Modify: `skills/cqb-routing/SKILL.md`
- Modify: `src/cli/index.ts`
- Modify: `src/setup/reviewer.ts`
- Test: `tests/reviewer-setup.test.ts`

**Interfaces:**
- Produce setup instructions that tell Codex desktop to use `@Browser` and return a URL explicitly.
- Preserve `setup-reviewer --local-browser` for deterministic CLI fallback.

- [x] **Step 1: Write failing tests** for selecting a host-confirmed URL and for preserving local-browser selection behavior.
- [x] **Step 2: Run the focused reviewer tests and verify the new host-browser assertions fail.
- [x] **Step 3: Implement the host-browser setup contract and explicit local fallback flag.
- [x] **Step 4: Run the focused tests and verify they pass.

### Task 3: Document, package, and verify the dual-path workflow

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/windows-installation.md`
- Modify: `docs/windows-installation.zh-CN.md`
- Modify: `docs/limitations.md`
- Modify: `docs/limitations.zh-CN.md`

- [x] **Step 1: Update both languages with the desktop `@Browser`-first flow and CLI fallback command.
- [x] **Step 2: Run `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm package:plugin`, and `pnpm verify:package`.
- [x] **Step 3: Reinstall the plugin and verify the enabled plugin and `cqb` MCP registration.
