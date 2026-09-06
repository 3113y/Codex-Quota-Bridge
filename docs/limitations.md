# Current Limitations

- The local CQB daemon is the plugin-managed STDIO MCP process. A separate tray process and continuous background clipboard watcher are not part of this MVP.
- Safe review return is user-mediated: copy the reviewer response, then let Codex pass that explicit text through `cqb_get_review`.
- Assisted and Autopilot target Chrome or Edge. Windows UI Automation verifies the configured ChatGPT URL and composer focus, but it does not attest the signed-in account or active ChatGPT model.
- The built-in Browser provider is currently Safe-mode host orchestration: Codex desktop must fulfill the returned `browserAction` with `@Browser`; Assisted and Autopilot use the local provider.
- Sol selection occurs in the dedicated ChatGPT conversation. CQB does not switch or attest the selected model.
- The MVP does not scrape ChatGPT, read cookies, or use the OpenAI API.
- Windows is the implemented automation platform. Core routing, persistence, compression, and MCP behavior are portable Node.js code.
- Token counts and compression ratios are estimates. CQB does not report exact quota savings.
- Codex hook trust is controlled by Codex. The user must review and trust plugin hooks before automatic lifecycle context is active.
- The real Windows UI flow depends on browser accessibility metadata. When CQB cannot prove the address bar, conversation path, composer, or HWND continuity, it leaves the packet for Safe-mode manual handling.
- Desktop PowerShell operations are bounded to 15 seconds. Verification commands and untracked-file inspection are bounded to five minutes, with process-tree termination and fail-closed results on timeout.
- Verification commands have a five-minute per-command timeout. Configure commands appropriate to the repository; CQB records exit codes, bounded redacted output, Git status, and SHA-256 summaries of working and staged diffs.
- CQB-managed tasks require a Git worktree so the verification gate can cover working, staged, and untracked changes from a stable baseline.
