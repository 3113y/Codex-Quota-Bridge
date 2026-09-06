# Automatic Reviewer Browser Initialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make CQB automatically route reviewer setup through Codex desktop's in-app `@Browser`, open an existing dedicated conversation when available, and provide a bounded creation flow when no binding exists.

**Architecture:** The MCP server remains responsible for durable configuration and returns a structured host-browser action. The Codex Skill consumes that action and must invoke the in-app Browser, inspect the ChatGPT conversation list for the configured reviewer title, open the matching `/c/...` URL, or create a new conversation only after the user-facing confirmation boundary. The MCP `cqb_bind_reviewer` tool persists the confirmed URL; no local `openUrl` call is used for the builtin provider.

**Tech Stack:** TypeScript, Node.js 22, STDIO MCP, Codex Skills/hooks, Windows Codex desktop `@Browser`.

## Global Constraints

- Built-in Browser is available in the ChatGPT desktop app and is invoked with `@Browser`; Codex CLI does not provide it.
- Safe mode must not submit the review packet or automate a sensitive ChatGPT action without user approval.
- Existing local Chrome/Edge automation remains available only for the explicit local-provider/CLI fallback.
- Configuration changes must persist through the existing config writer and preserve unrelated user settings.
- Tests must be written before production changes and must cover bound and unbound routing.

---

### Task 1: Define automatic host-browser action contract

**Files:**
- Modify: `src/reviewer/transport.ts`
- Test: `tests/automation.test.ts`

**Interfaces:**
- Produces `HostBrowserAction` fields for `conversationUrl`, `setupRequired`, `selectionHint`, and `creationPrompt`.

- [x] **Step 1: Write failing tests**

Add assertions that a bound builtin reviewer action asks the host to inspect and open the dedicated conversation, while an unbound action includes a creation prompt and does not call `openUrl`.

- [x] **Step 2: Run the focused tests and verify they fail**

Run: `pnpm test` with the existing test-environment workaround if Node reports `uv_os_get_passwd ENOMEM`.

Expected: the new action-field assertions fail because the fields do not yet exist.

- [x] **Step 3: Implement the smallest action type extension**

Add optional string fields to `HostBrowserAction`; keep the current `provider`, `conversationUrl`, `packet`, `instruction`, and `setupRequired` fields unchanged for compatibility.

- [x] **Step 4: Re-run the focused tests**

Expected: the action contract tests pass.

### Task 2: Generate automatic selection and creation instructions

**Files:**
- Modify: `src/reviewer/clipboard.ts`
- Test: `tests/automation.test.ts`

**Interfaces:**
- Consumes the `HostBrowserAction` contract from Task 1.
- Produces an action that explicitly requires in-app `@Browser`, searches for `CQB Reviewer`, opens a matching `/c/...` URL, or offers a bounded creation prompt.

- [x] **Step 1: Write the failing behavior test**

Assert that bound actions contain an existing-conversation selection hint and unbound actions contain a prompt that asks Codex to create a dedicated conversation and then call `cqb_bind_reviewer`.

- [x] **Step 2: Run the focused test and verify the expected failure**

Expected: the new fields are undefined or do not contain the required selection/creation text.

- [x] **Step 3: Implement bounded instruction generation**

For a valid `/c/...` binding, return the bound URL plus a selection hint. For the home-page configuration, return `https://chatgpt.com/`, `setupRequired: true`, a selection hint, and a creation prompt. Keep Safe mode non-submitting.

- [x] **Step 4: Run the focused tests**

Expected: all automation tests pass.

### Task 3: Make the Codex Skill consume the action automatically

**Files:**
- Modify: `skills/cqb-routing/SKILL.md`
- Modify: `prompts/executor.md`
- Modify: `hooks/session-context.mjs`
- Test: `tests/hooks.test.ts`

**Interfaces:**
- Consumes `browserAction.selectionHint` and `browserAction.creationPrompt`.
- Produces model-visible routing instructions that invoke `@Browser` without requiring the user to type a CQB-specific prompt or shell command.

- [x] **Step 1: Write failing hook/skill expectation tests**

Assert that injected routing context names automatic in-app Browser selection and the `cqb_bind_reviewer` continuation path.

- [x] **Step 2: Run hook tests and verify failure**

Expected: the existing context does not mention automatic selection/creation.

- [x] **Step 3: Update the routing instructions**

State that the executor must consume `browserAction`, invoke in-app `@Browser`, inspect existing reviewer conversations first, create a new one only within the user approval boundary, and persist the URL with `cqb_bind_reviewer`.

- [x] **Step 4: Run hook tests**

Expected: hook output includes the automatic Browser routing guidance.

### Task 4: Document the no-command desktop flow and verify the package

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/windows-installation.md`
- Modify: `docs/windows-installation.zh-CN.md`
- Modify: `docs/integration-decision.md`
- Modify: `docs/integration-decision.zh-CN.md`

- [x] **Step 1: Update English and Chinese documentation**

Describe the default desktop sequence: plugin enabled, ordinary Codex task, automatic `@Browser` launch, existing conversation selection, bounded new-conversation creation, and one-time URL binding.

- [x] **Step 2: Run all tests and static checks**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm package:plugin
pnpm verify:package
```

Expected: all tests pass, TypeScript/build succeed, and packaged runtime matches source.

- [x] **Step 3: Install and inspect the final plugin**

Run `.\scripts\install.ps1`, then verify `codex plugin list --json` shows `codex-quota-bridge@cqb-local` enabled and `codex mcp list --json` shows `cqb` enabled.
