import { createHash } from 'node:crypto';

let input = '';
for await (const chunk of process.stdin) input += chunk;

let event;
try {
  event = JSON.parse(input || '{}');
} catch {
  process.stdout.write(JSON.stringify({
    continue: true,
    suppressOutput: true,
    systemMessage: 'CQB hook received invalid lifecycle input and stayed inactive.'
  }));
  process.exit(0);
}

const taskBinding = event.session_id && event.cwd
  ? `cqb-session-${createHash('sha256').update(`${event.session_id}\0${event.cwd}`).digest('hex').slice(0, 16)}`
  : 'the CQB task binding supplied at SessionStart';

process.stdout.write(JSON.stringify({
  continue: true,
  suppressOutput: true,
  hookSpecificOutput: {
    hookEventName: event.hook_event_name === 'UserPromptSubmit' ? 'UserPromptSubmit' : 'SessionStart',
    additionalContext: `CQB is available for this Codex task as ${taskBinding}. Keep routine execution local. After meaningful failed approaches or when expert judgment is explicitly requested, use the cqb tools to enforce the circuit breaker, create a compact evidence packet, and verify reviewer advice before editing. When cqb_request_review returns a builtin browserAction, automatically use the in-app @Browser to search for and open the dedicated reviewer conversation; if none exists, create one within the user approval boundary and call cqb_bind_reviewer with its /c/... URL. Do not substitute Chrome or Edge.`
  }
}));
