import type { CqbService } from '../core/service.js';
import { SUPPORTED_REVIEWER_MODELS } from '../config/schema.js';
import { SETTINGS_RESOURCE_URI, settingsWidgetHtml } from './ui.js';

interface JsonRpcRequest { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }
interface JsonRpcResponse { jsonrpc: '2.0'; id: string | number | null; result?: unknown; error?: { code: number; message: string } }
type ServiceLike = Pick<CqbService, 'status' | 'shouldEscalate' | 'requestReview' | 'bindReviewer' | 'reviewStatus' | 'getReview' | 'reportResult' | 'settings' | 'setAutomationMode' | 'setReviewerModel'>;
interface InputSchema {
  type: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array';
  properties?: Record<string, InputSchema>;
  required?: readonly string[];
  additionalProperties?: boolean;
  items?: InputSchema;
  minimum?: number;
  maximum?: number;
  minLength?: number;
}

const objectSchema = (properties: Record<string, InputSchema>, required: string[] = []): InputSchema => ({ type: 'object', properties, required, additionalProperties: false });
const requiredText: InputSchema = { type: 'string', minLength: 1 };
const text: InputSchema = { type: 'string' };
const textArray: InputSchema = { type: 'array', items: text };
const relevantFileSchema = objectSchema({ path: requiredText, relevance: requiredText, excerpt: text }, ['path', 'relevance']);
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18'] as const;

export const toolDefinitions = [
  { name: 'cqb_settings', description: 'Open the CQB graphical settings panel for Safe, Assisted, and Autopilot modes.', inputSchema: objectSchema({}), _meta: { ui: { resourceUri: SETTINGS_RESOURCE_URI, prefersBorder: true } } },
  { name: 'cqb_set_mode', description: 'Change the CQB automation permission mode. Autopilot requires an explicit confirmation from the graphical settings panel.', inputSchema: objectSchema({ mode: { type: 'string' }, confirm_autopilot: { type: 'boolean' } }, ['mode']) },
  { name: 'cqb_set_model', description: `Persist the preferred ChatGPT reviewer model (${SUPPORTED_REVIEWER_MODELS.join(', ')}). The active model remains controlled by the reviewer conversation.`, inputSchema: objectSchema({ model: { type: 'string', minLength: 1 } }, ['model']) },
  { name: 'cqb_status', description: 'Create or restore local CQB task state without escalating; resume a paused task only with explicit user approval.', inputSchema: objectSchema({ task_id: requiredText, goal: requiredText, workspace_root: requiredText, resume: { type: 'boolean' } }, ['goal', 'workspace_root']) },
  { name: 'cqb_should_escalate', description: 'Evaluate the CQB reasoning circuit breaker using concrete failure evidence.', inputSchema: objectSchema({ task_id: requiredText, confidence: { type: 'number', minimum: 0, maximum: 1 }, failures: { type: 'integer', minimum: 0 }, reason: requiredText, evidence: textArray, explicit_review: { type: 'boolean' }, architecture_judgment: { type: 'boolean' }, risky_cross_cutting: { type: 'boolean' } }, ['task_id', 'confidence', 'failures', 'reason', 'evidence']) },
  { name: 'cqb_request_review', description: 'Create, persist, validate, and route a compact expert review request. Codex desktop uses the built-in Browser by default; set host_browser to false only when using the local browser fallback.', inputSchema: objectSchema({ task_id: requiredText, user_input: text, goal: requiredText, current_state: requiredText, relevant_files: { type: 'array', items: relevantFileSchema }, relevant_symbols: textArray, evidence: textArray, errors: textArray, attempts: textArray, diff_summary: text, constraints: textArray, question: requiredText, host_browser: { type: 'boolean' } }, ['task_id', 'goal', 'current_state', 'question']) },
  { name: 'cqb_bind_reviewer', description: 'Persist a user-confirmed built-in Browser ChatGPT conversation URL and title.', inputSchema: objectSchema({ conversation_url: requiredText, expected_window_title: text }, ['conversation_url']) },
  { name: 'cqb_review_status', description: 'Read the current review state.', inputSchema: objectSchema({ task_id: requiredText }, ['task_id']) },
  { name: 'cqb_get_review', description: 'Import a reviewer response only while the task is waiting, then return verified-advice instructions.', inputSchema: objectSchema({ task_id: requiredText, response: requiredText }, ['task_id', 'response']) },
  { name: 'cqb_report_result', description: 'Run configured verification commands and inspect Git state; CQB derives the evidence that gates DONE.', inputSchema: objectSchema({ task_id: requiredText, remaining_risks: textArray }, ['task_id', 'remaining_risks']) },
] as const;

function validateSchema(value: unknown, schema: InputSchema, path = 'arguments'): void {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) throw new Error(`${path}.${key} is required`);
    }
    if (schema.additionalProperties === false) {
      const unknown = Object.keys(record).find((key) => !Object.prototype.hasOwnProperty.call(schema.properties ?? {}, key));
      if (unknown) throw new Error(`${path}.${unknown} is not allowed`);
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (Object.prototype.hasOwnProperty.call(record, key)) validateSchema(record[key], child, `${path}.${key}`);
    }
    return;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
    if (schema.items) value.forEach((item, index) => validateSchema(item, schema.items as InputSchema, `${path}[${index}]`));
    return;
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string') throw new Error(`${path} must be a string`);
    if (schema.minLength !== undefined && value.trim().length < schema.minLength) throw new Error(`${path} must be a non-empty string`);
    return;
  }
  if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`);
    return;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value))) {
    throw new Error(`${path} must be ${schema.type === 'integer' ? 'an integer' : 'a finite number'}`);
  }
  if (schema.minimum !== undefined && value < schema.minimum) throw new Error(`${path} must be at least ${schema.minimum}`);
  if (schema.maximum !== undefined && value > schema.maximum) throw new Error(`${path} must be at most ${schema.maximum}`);
}

function requiredString(args: Record<string, unknown>, key: string): string {
  if (typeof args[key] !== 'string' || !(args[key] as string).trim()) throw new Error(`${key} must be a non-empty string`);
  return args[key] as string;
}

function relevantFiles(value: unknown): Array<{ path: string; relevance: string; excerpt?: string }> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== 'object' || typeof (item as Record<string, unknown>).path !== 'string' || typeof (item as Record<string, unknown>).relevance !== 'string')) {
    throw new Error('relevant_files must contain objects with path and relevance strings');
  }
  return value.map((item) => {
    const file = item as Record<string, unknown>;
    return { path: file.path as string, relevance: file.relevance as string, ...(typeof file.excerpt === 'string' ? { excerpt: file.excerpt } : {}) };
  });
}

async function callTool(name: string, args: Record<string, unknown>, service: ServiceLike): Promise<unknown> {
  switch (name) {
    case 'cqb_settings': return service.settings();
    case 'cqb_set_mode': {
      if (!['safe', 'assisted', 'autopilot'].includes(args.mode as string)) throw new Error('mode must be safe, assisted, or autopilot');
      return service.setAutomationMode(args.mode as 'safe' | 'assisted' | 'autopilot', args.confirm_autopilot === true);
    }
    case 'cqb_set_model': return service.setReviewerModel(requiredString(args, 'model'));
    case 'cqb_status': return service.status({
      ...(typeof args.task_id === 'string' ? { taskId: args.task_id } : {}),
      goal: requiredString(args, 'goal'),
      workspaceRoot: requiredString(args, 'workspace_root'),
      resume: args.resume === true,
    });
    case 'cqb_should_escalate': return service.shouldEscalate(requiredString(args, 'task_id'), { confidence: args.confidence as number, failures: args.failures as number, reason: requiredString(args, 'reason'), evidence: args.evidence as string[], explicitReview: args.explicit_review === true, architectureJudgment: args.architecture_judgment === true, riskyCrossCutting: args.risky_cross_cutting === true });
    case 'cqb_request_review': return service.requestReview(requiredString(args, 'task_id'), { ...(typeof args.user_input === 'string' ? { userInput: args.user_input } : {}), goal: requiredString(args, 'goal'), currentState: requiredString(args, 'current_state'), relevantFiles: relevantFiles(args.relevant_files), relevantSymbols: (args.relevant_symbols as string[] | undefined) ?? [], evidence: (args.evidence as string[] | undefined) ?? [], errors: (args.errors as string[] | undefined) ?? [], attempts: (args.attempts as string[] | undefined) ?? [], diffSummary: (args.diff_summary as string | undefined) ?? '', constraints: (args.constraints as string[] | undefined) ?? [], question: requiredString(args, 'question'), hostBrowser: args.host_browser !== false });
    case 'cqb_bind_reviewer': return service.bindReviewer(requiredString(args, 'conversation_url'), typeof args.expected_window_title === 'string' ? args.expected_window_title : undefined);
    case 'cqb_review_status': return service.reviewStatus(requiredString(args, 'task_id'));
    case 'cqb_get_review': return service.getReview(requiredString(args, 'task_id'), { response: requiredString(args, 'response') });
    case 'cqb_report_result': return service.reportResult(requiredString(args, 'task_id'), { remainingRisks: args.remaining_risks as string[] });
    default: throw new Error(`Unknown CQB tool: ${name}`);
  }
}

export async function handleJsonRpc(request: JsonRpcRequest, service: ServiceLike): Promise<JsonRpcResponse | undefined> {
  const id = request.id ?? null;
  if (request.jsonrpc !== '2.0') return request.id === undefined ? undefined : { jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request: jsonrpc must be 2.0' } };
  if (!request.method) return { jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request' } };
  if (request.method === 'notifications/initialized') return undefined;
  if (request.method === 'initialize') {
    const requestedVersion = request.params?.protocolVersion;
    if (typeof requestedVersion !== 'string' || !requestedVersion.trim()) {
      return { jsonrpc: '2.0', id, error: { code: -32602, message: 'protocolVersion must be a non-empty string' } };
    }
    const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion as typeof SUPPORTED_PROTOCOL_VERSIONS[number])
      ? requestedVersion
      : SUPPORTED_PROTOCOL_VERSIONS[0];
    return { jsonrpc: '2.0', id, result: { protocolVersion, capabilities: { tools: { listChanged: false }, resources: {} }, serverInfo: { name: 'codex-quota-bridge', version: '1.0.0' } } };
  }
  if (request.method === 'resources/read') {
    if (request.params?.uri !== SETTINGS_RESOURCE_URI) return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Unknown UI resource' } };
    return { jsonrpc: '2.0', id, result: { contents: [{ uri: SETTINGS_RESOURCE_URI, mimeType: 'text/html;profile=mcp-app', text: settingsWidgetHtml, _meta: { ui: { prefersBorder: true } } }] } };
  }
  if (request.method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: toolDefinitions } };
  if (request.method !== 'tools/call') return request.id === undefined ? undefined : { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } };
  let name: typeof toolDefinitions[number]['name'];
  let args: Record<string, unknown>;
  try {
    const requestedName = requiredString(request.params ?? {}, 'name');
    const definition = toolDefinitions.find((tool) => tool.name === requestedName);
    if (!definition) throw new Error(`Unknown CQB tool: ${requestedName}`);
    name = definition.name;
    const rawArgs = request.params?.arguments;
    if (rawArgs !== undefined && (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs))) throw new Error('arguments must be an object');
    validateSchema(rawArgs ?? {}, definition.inputSchema);
    args = (rawArgs ?? {}) as Record<string, unknown>;
  } catch (error) {
    return { jsonrpc: '2.0', id, error: { code: -32602, message: error instanceof Error ? error.message : String(error) } };
  }
  try {
    const result = await callTool(name, args, service);
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: message }], isError: true } };
  }
}
