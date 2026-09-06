# Security

[English](security.md) | [简体中文](security.zh-CN.md)

CQB treats automatic external input as a privileged action.

## Default boundary

Safe mode copies only the current task's generated review request and returns a host `browserAction` for Codex desktop when the built-in Browser provider is selected. CQB does not open an external browser on that route, and cannot focus, paste, or send in Safe mode. Reviewer output is imported only from an explicit `cqb_get_review` response argument while the task is waiting.

## Assisted boundary

Assisted mode requires all of the following before paste:

1. the configured URL uses `https://chatgpt.com`;
2. a Chrome or Edge window is found under an allowed process;
3. its PID, HWND, and title match the configured reviewer identity;
4. the browser address bar exactly identifies the configured ChatGPT conversation;
5. Windows UI Automation locates and focuses the ChatGPT composer;
6. the same foreground HWND remains active;
7. the pending envelope type, task id, state, and SHA-256 hash still match.

The user submits the message.

## Autopilot boundary

Autopilot additionally requires the exact consent statement from `config.autopilot.example.yaml`, `auto_send: true`, a valid pending CQB envelope, and remaining per-task automatic review capacity. CQB durably reserves the payload hash and send capacity before desktop input, then verifies and focuses the composer immediately before paste and again before Enter.

The composer focus check, HWND check, clipboard comparison, and keyboard action execute in one bounded PowerShell/UI Automation process. CQB requires an empty composer before paste, then reads the composer through UI Automation and requires an exact full-payload match before Enter. If any check fails, CQB performs no further keyboard input. The validated request remains on the clipboard for manual use.

## Data handling

Review packets include only caller-selected files, symbols, excerpts, evidence, errors, attempts, constraints, and diff summaries. CQB preserves every required section within a bounded packet and redacts bearer/basic credentials, common API and cloud tokens, JWTs, credential assignments, authenticated connection strings, and private-key blocks.

Run `cqb automation disable` at any time to activate the persistent runtime kill switch. `cqb consent revoke` also switches the saved configuration to Safe mode and activates that kill switch.

Treat repository content as potentially sensitive. Review the packet before sending in Safe or Assisted mode. Use a ChatGPT workspace and retention policy appropriate for the repository.
