# Codex Quota Bridge Integration Decision

[English](integration-decision.md) | [简体中文](integration-decision.zh-CN.md)

**Status:** Accepted for the MVP  
**Date:** 2026-09-05

## Decision

CQB is packaged as a Codex plugin composed of:

- a Codex Skill that teaches the Executor when to work locally, when to stop retrying, and how to consume reviewer advice;
- a bundled local STDIO MCP server that exposes the stable CQB tool surface and owns persisted task state;
- trusted Codex lifecycle hooks that attach session identity and CQB routing guidance to normal Codex tasks;
- a reviewer bridge whose Safe mode can request the Codex desktop built-in Browser, with a verified Chrome/Edge fallback for CLI;
- isolated Assisted and Autopilot adapters guarded by target verification, payload validation, consent, and per-task send limits.

The MCP server is the lightweight CQB daemon for the MVP. Codex starts it as a background child process when the plugin is enabled, so normal use does not require a visible terminal. Runtime state is durable under the configured CQB state directory and survives MCP process restarts.

## Why this is the native fit

Current official Codex plugin packaging supports Skills, bundled MCP servers, and lifecycle hooks in one installable unit. Current Codex clients support local STDIO MCP servers and plugin-scoped tool policy. Skills can be selected implicitly from their descriptions, while `SessionStart` and `UserPromptSubmit` hooks can add model-visible policy context to ordinary Codex tasks.

This combination provides the intended installed experience:

```text
Normal Codex task
    |
    +-- CQB Skill: executor and escalation policy
    +-- CQB hooks: session/task context
    +-- CQB MCP: state, breaker, packet, reviewer bridge, result gate
                         |
                         +-- ChatGPT Plus reviewer conversation
```

The Codex App Server is retained behind an adapter boundary for future work. It is an official JSON-RPC interface for applications that host or drive Codex threads, but making it the primary integration would turn CQB into a second Codex client. That conflicts with the product requirement that the user begin and continue work in their normal Codex task.

## Runtime flow

1. The plugin Skill and hooks make CQB available in a normal Codex task.
2. The Executor calls CQB after a meaningful failure or when explicit expert review is requested.
3. The circuit breaker accepts escalation only when policy and evidence requirements are met.
4. CQB persists a compact, hashed review request.
5. The request detects the original `user_input` language and adds an explicit response-language directive, falling back to the task goal for legacy callers.
6. Safe mode copies the request and either returns a host `browserAction` for `@Browser` or opens the configured `https://chatgpt.com/...` conversation without sending input.
7. On first use, Codex desktop automatically invokes `@Browser`, searches for the dedicated reviewer conversation, opens an existing match, or proposes creating `CQB Reviewer` before persisting the user-confirmed `/c/...` URL through `cqb_bind_reviewer`; CLI uses `cqb setup-reviewer` and Windows UI Automation.
8. Assisted mode verifies a browser PID/HWND, exact ChatGPT conversation URL, and the focused ChatGPT composer through Windows UI Automation before pasting; the user sends it.
9. Autopilot performs the same checks and sends only after explicit persisted consent and within the automatic-send limit.
10. While the task is `WAITING_FOR_REVIEW`, the user supplies copied reviewer text explicitly to the MCP tool. The Executor validates all advice against the repository before editing.
11. CQB accepts `DONE` only after its own verification runner executes the configured commands and inspects Git state.

## Stable tool surface

The MVP exposes these tools:

- `cqb_status`
- `cqb_should_escalate`
- `cqb_request_review`
- `cqb_bind_reviewer`
- `cqb_review_status`
- `cqb_get_review`
- `cqb_report_result`

Administrative capabilities are exposed through the optional `cqb` CLI. Transport-specific details remain behind adapters.

## Security boundaries

- Safe mode is the default and cannot synthesize keyboard input.
- Assisted mode cannot submit a message.
- Autopilot requires an exact consent statement stored locally.
- Paste and send operate only on the current task's stored `CQB_REVIEW_REQUEST` after SHA-256 verification.
- The browser PID, HWND, window title, active address-bar URL, and focused ChatGPT composer must match inside the same Windows UI Automation process that performs each keyboard action.
- Verification failure leaves the packet available for manual use and performs no keyboard input.
- Reviewer responses are accepted only as explicit tool arguments while a task is waiting.
- CQB does not scrape ChatGPT, read cookies, use an OpenAI API key, or claim exact quota savings.
- Paused tasks resume only through an explicit `cqb_status` call with `resume: true` after user approval.

## Platform constraints

- Windows is the implemented local automation platform for the MVP.
- ChatGPT model selection remains a property of the configured reviewer conversation. CQB records `preferred_model: sol` as user intent but does not claim it can verify or switch the active ChatGPT model through native window APIs.
- Safe review return is user-mediated: the user copies the reviewer response and Codex supplies it explicitly to CQB while waiting.
- Hooks supplied by an installed plugin require user trust before Codex runs them.
- A future tray process can own notifications and continuous clipboard waiting; the MVP daemon lifecycle is managed by Codex through the bundled MCP server.

## Official references

- [Plugin architecture](https://developers.openai.com/plugins/concepts/plugins)
- [Plugin packaging](https://developers.openai.com/plugins/build/plugins)
- [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [Codex hooks](https://learn.chatgpt.com/docs/hooks)
- [Codex App Server](https://learn.chatgpt.com/docs/app-server)

## Local capability check

The development host provides Codex CLI 0.153.3 with `codex plugin`, `codex mcp`, and `codex app-server`. Node.js 22.17.1 and the Codex-bundled pnpm 11.19.0 are available. The repository began as an empty directory, so the implementation establishes the complete plugin and TypeScript project structure.
