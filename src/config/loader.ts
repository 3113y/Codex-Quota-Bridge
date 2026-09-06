import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defaultConfig, type CqbConfig } from './schema.js';

type LooseObject = Record<string, unknown>;

function parseScalar(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1).split(',').map((item) => parseScalar(item)).filter((item) => item !== '');
  }
  return trimmed.replace(/^(['"])(.*)\1$/, '$2');
}

function camelize(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function parseYamlSubset(text: string): LooseObject {
  const root: LooseObject = {};
  const stack: Array<{ indent: number; value: LooseObject }> = [{ indent: -1, value: root }];
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const match = rawLine.trim().match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) throw new Error(`Unsupported YAML at line ${index + 1}`);
    while ((stack.at(-1)?.indent ?? -1) >= indent) stack.pop();
    const parent = stack.at(-1)?.value;
    if (!parent) throw new Error(`Invalid indentation at line ${index + 1}`);
    const key = camelize(match[1] ?? '');
    const rawValue = match[2] ?? '';
    if (rawValue === '') {
      const child: LooseObject = {};
      parent[key] = child;
      stack.push({ indent, value: child });
    } else {
      parent[key] = parseScalar(rawValue);
    }
  }
  return root;
}

function merge(base: unknown, override: unknown): unknown {
  if (!base || typeof base !== 'object' || Array.isArray(base) || !override || typeof override !== 'object' || Array.isArray(override)) return override;
  const result: LooseObject = { ...(base as LooseObject) };
  for (const [key, value] of Object.entries(override as LooseObject)) result[key] = key in result ? merge(result[key], value) : value;
  return result;
}

const knownShape: LooseObject = {
  reviewer: { provider: true, browserProvider: true, preferredModel: true, conversationUrl: true, expectedWindowTitle: true, allowedProcesses: true },
  routing: { confidenceThreshold: true, maxLocalFailures: true, maxReviewsPerTask: true, requireNewEvidence: true },
  automation: { mode: true, autoOpen: true, autoFocus: true, autoPaste: true, autoSend: true, consent: { granted: true, statement: true, grantedAt: true } },
  verification: { tests: true, typecheck: true, lint: true, build: true, diffReview: true, commands: { tests: true, typecheck: true, lint: true, build: true } },
  limits: { maxExecutorRounds: true, maxAutoReviewsPerTask: true }, storage: { stateDirectory: true },
};

function rejectUnknownKeys(value: LooseObject, shape: LooseObject, path = ''): void {
  for (const [key, child] of Object.entries(value)) {
    if (!(key in shape)) throw new Error(`Unknown configuration key: ${path}${key}`);
    const expected = shape[key];
    if (child && typeof child === 'object' && !Array.isArray(child) && expected && typeof expected === 'object') rejectUnknownKeys(child as LooseObject, expected as LooseObject, `${path}${key}.`);
  }
}

function validate(config: CqbConfig): CqbConfig {
  if (!['builtin', 'local'].includes(config.reviewer.browserProvider)) throw new Error('reviewer.browserProvider must be builtin or local');
  if (!['safe', 'assisted', 'autopilot'].includes(config.automation.mode)) throw new Error('automation.mode must be safe, assisted, or autopilot');
  if (config.automation.mode === 'safe' && (config.automation.autoFocus || config.automation.autoPaste || config.automation.autoSend)) {
    throw new Error('Safe mode cannot enable focus, paste, or send');
  }
  if (config.automation.mode === 'assisted' && config.automation.autoSend) throw new Error('Assisted mode cannot enable automatic send');
  if (config.routing.confidenceThreshold < 0 || config.routing.confidenceThreshold > 1) throw new Error('confidence threshold must be between 0 and 1');
  if (![config.routing.maxLocalFailures, config.routing.maxReviewsPerTask, config.limits.maxExecutorRounds, config.limits.maxAutoReviewsPerTask].every((value) => Number.isInteger(value) && value > 0)) {
    throw new Error('CQB limits must be positive integers');
  }
  if (!config.verification.diffReview) throw new Error('CQB requires independent Git diff review');
  if (![config.verification.tests, config.verification.typecheck, config.verification.lint, config.verification.build].some(Boolean)) throw new Error('At least one CQB verification command must be enabled');
  const url = new URL(config.reviewer.conversationUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'chatgpt.com') throw new Error('reviewer conversation URL must use https://chatgpt.com');
  return config;
}

export function parseConfig(text: string): CqbConfig {
  const parsed = parseYamlSubset(text);
  rejectUnknownKeys(parsed, knownShape);
  return validate(merge(structuredClone(defaultConfig), parsed) as CqbConfig);
}

export async function loadConfig(path = resolve(process.cwd(), 'cqb.config.yaml')): Promise<CqbConfig> {
  try { return parseConfig(await readFile(path, 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(defaultConfig);
    throw error;
  }
}
