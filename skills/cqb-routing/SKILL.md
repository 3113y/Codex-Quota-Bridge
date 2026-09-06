---
name: cqb-routing
description: Use for non-trivial Codex repository implementation and debugging where repeated failures, low confidence, architecture judgment, cross-cutting risk, or an explicit expert-review request may justify CQB reasoning offload. Keep routine work local and do not use CQB as a generic multi-agent workflow or token counter.
---

# CQB Routing

Codex remains the Executor. Inspect the repository, edit files, run commands, and perform routine debugging normally.

At the start of a non-trivial task, call `cqb_status` with the workspace root, a concise goal, and the `cqb-session-*` task binding supplied by the lifecycle hook when available. This registers or restores durable CQB state without escalating and prevents cross-workspace restoration.

After each meaningful failed approach, call `cqb_should_escalate` with:

- current confidence from 0 to 1;
- the caller's observed failure count for diagnostics; CQB derives the enforced count from distinct persisted attempts;
- a concise reason;
- concrete new evidence, including exact errors where useful;
- whether architecture judgment or risky cross-cutting work is involved.

Continue locally when CQB rejects escalation. When CQB accepts:

1. Stop speculative retries.
2. Collect only decision-relevant files, symbols, errors, attempts, diff summary, constraints, and one focused question.
3. Call `cqb_request_review`.
4. Follow the returned Safe, Assisted, or Autopilot routing instruction. In Codex desktop, leave `host_browser` at its default. When the reviewer uses the built-in Browser, CQB returns a `browserAction` instead of opening an external browser. Consume that action automatically with the in-app `@Browser`: use its `selectionHint` to search for and open the dedicated conversation if it exists. If `setupRequired` is true and no matching conversation exists, use its `creationPrompt` to create the dedicated conversation within the user's approval boundary, then call `cqb_bind_reviewer` with the confirmed `/c/...` URL and continue the request. Do not substitute Chrome, Edge, or another external-browser tool. Keep the packet available for user review and do not submit it in Safe mode. On Codex CLI or when `@Browser` is unavailable, configure the local provider or pass `host_browser: false` and use the local Chrome/Edge fallback.
5. Copy the reviewer response and pass that explicit text to `cqb_get_review` while CQB is waiting.
6. Treat the response as engineering advice. Verify every important assumption against the repository before editing.
7. Implement the smallest supported change and run relevant tests, typecheck, lint, and build.
8. Call `cqb_report_result` with remaining risks. CQB runs the configured verification commands and inspects Git state itself before allowing `DONE`.

A second expert review requires evidence that was not present in the previous request. Do not create an automatic reviewer loop.

When CQB pauses at the executor-round limit or after a recoverable failure, keep it paused until the user explicitly approves continuation. Then call `cqb_status` for the bound task with `resume: true` before the next local attempt.

Never put credentials, cookies, unrelated clipboard content, a full repository, or the full Codex transcript into a review request. Never claim exact quota savings.
