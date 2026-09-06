import assert from 'node:assert/strict';
import test from 'node:test';
import { handleJsonRpc, toolDefinitions } from '../src/mcp/protocol.js';

const fakeService = {
  async status(input: unknown) { return { state: 'EXECUTING', input }; },
  async shouldEscalate() { return { decision: { escalate: false } }; },
  async requestReview() { return { state: 'WAITING_FOR_REVIEW' }; },
  async bindReviewer() { return { status: 'bound' }; },
  async reviewStatus() { return { state: 'WAITING_FOR_REVIEW' }; },
  async getReview() { return { advice: 'review' }; },
  async reportResult() { return { status: 'done' }; },
};

test('MCP exposes the stable CQB tools', () => {
  assert.deepEqual(toolDefinitions.map((tool) => tool.name), [
    'cqb_status', 'cqb_should_escalate', 'cqb_request_review', 'cqb_bind_reviewer', 'cqb_review_status', 'cqb_get_review', 'cqb_report_result',
  ]);
});

test('MCP exposes a reviewer binding tool for host Browser initialization', async () => {
  const response = await handleJsonRpc({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'cqb_bind_reviewer', arguments: { conversation_url: 'https://chatgpt.com/c/builtin123', expected_window_title: 'CQB Reviewer' } } }, fakeService);
  assert.equal((response?.result as { structuredContent: { status: string } }).structuredContent.status, 'bound');
});

test('MCP initializes and dispatches a valid tool call', async () => {
  const initialized = await handleJsonRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, fakeService);
  assert.equal(initialized?.id, 1);
  assert.equal(initialized?.jsonrpc, '2.0');
  assert.equal((initialized?.result as { serverInfo: { name: string } }).serverInfo.name, 'codex-quota-bridge');
  const called = await handleJsonRpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'cqb_status', arguments: { goal: 'g', workspace_root: 'C:\\repo' } } }, fakeService);
  assert.equal((called?.result as { structuredContent: { state: string } }).structuredContent.state, 'EXECUTING');
  assert.equal('taskId' in ((called?.result as { structuredContent: { input: object } }).structuredContent.input), false);
});

test('MCP accepts the optional host-browser routing hint', async () => {
  let received: unknown;
  const service = { ...fakeService, async requestReview(_taskId: string, input: unknown) { received = input; return { state: 'WAITING_FOR_REVIEW' }; } };
  const response = await handleJsonRpc({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'cqb_request_review', arguments: { task_id: 't', goal: 'g', current_state: 's', question: 'q', host_browser: true } } }, service);
  assert.equal((response?.result as { structuredContent: { state: string } }).structuredContent.state, 'WAITING_FOR_REVIEW');
  assert.equal((received as { hostBrowser: boolean }).hostBrowser, true);
});

test('MCP negotiates only an explicitly supported protocol version', async () => {
  const initialized = await handleJsonRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 'not-a-real-version' } }, fakeService);
  assert.equal((initialized?.result as { protocolVersion: string }).protocolVersion, '2025-06-18');
});

test('MCP returns protocol errors for unknown tools and malformed requests', async () => {
  const unknown = await handleJsonRpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'other', arguments: {} } }, fakeService);
  assert.equal(unknown?.error?.code, -32602);
  const malformed = await handleJsonRpc({ jsonrpc: '2.0', id: 4, params: {} }, fakeService);
  assert.equal(malformed?.error?.code, -32600);
  const invalidFiles = await handleJsonRpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'cqb_request_review', arguments: { task_id: 't', goal: 'g', current_state: 's', question: 'q', relevant_files: ['src/a.ts'] } } }, fakeService);
  assert.equal(invalidFiles?.error?.code, -32602);

  const outOfRange = await handleJsonRpc({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'cqb_should_escalate', arguments: { task_id: 't', confidence: 2, failures: 0, reason: 'r', evidence: [] } } }, fakeService);
  assert.equal(outOfRange?.error?.code, -32602);

  const coercedArray = await handleJsonRpc({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'cqb_report_result', arguments: { task_id: 't', remaining_risks: [42] } } }, fakeService);
  assert.equal(coercedArray?.error?.code, -32602);

  const unknownArgument = await handleJsonRpc({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'cqb_review_status', arguments: { task_id: 't', extra: true } } }, fakeService);
  assert.equal(unknownArgument?.error?.code, -32602);
});

test('MCP returns service failures as tool execution errors', async () => {
  const serviceFailure = {
    ...fakeService,
    async reviewStatus() { throw new Error('CQB task not found'); },
  };
  const response = await handleJsonRpc({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'cqb_review_status', arguments: { task_id: 'missing' } } }, serviceFailure);
  assert.equal(response?.error, undefined);
  const result = response?.result as { isError: boolean; content: Array<{ type: string; text: string }> };
  assert.equal(result.isError, true);
  assert.match(result.content[0]?.text ?? '', /CQB task not found/);
});

test('MCP rejects non-2.0 requests and does not answer unknown notifications', async () => {
  const invalid = await handleJsonRpc({ jsonrpc: '1.0', id: 1, method: 'tools/list' } as never, fakeService);
  assert.equal(invalid?.error?.code, -32600);
  const notification = await handleJsonRpc({ jsonrpc: '2.0', method: 'notifications/custom' } as never, fakeService);
  assert.equal(notification, undefined);
});
