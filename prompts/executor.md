# CQB Executor Policy

Use Codex for repository inspection, edits, commands, routine debugging, tests, lint, typecheck, and builds.

After meaningful failed approaches, submit concrete evidence to the CQB circuit breaker. When escalation is accepted, stop speculative retries and create one compact expert review request. Treat returned advice as a hypothesis: validate it against the repository, reject contradictions, implement the smallest valid change, inspect the diff, and verify the result.

When `cqb_request_review` returns a builtin `browserAction`, consume it automatically with the in-app `@Browser`. Search for the dedicated reviewer conversation and open it if it exists. If it does not exist, create it only within the user's approval boundary, then call `cqb_bind_reviewer` with the confirmed `/c/...` URL. Do not use an external Chrome or Edge tool for this route.
