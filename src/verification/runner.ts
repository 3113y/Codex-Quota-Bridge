import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { terminateProcessTree } from '../process/bounded.js';
import type { CqbConfig } from '../config/schema.js';
import type { ValidationResult, ValidationStatus } from '../core/types.js';

export interface CommandEvidence { name: keyof ValidationResult; command: string; exitCode: number | null; output: string; timedOut: boolean }
export interface DiffEvidence { statusHash: string; workingTreeHash: string; stagedHash: string; statusLines: number; complete?: boolean; workingTreeBytes?: number; stagedBytes?: number; workingTreePatch?: string; stagedPatch?: string; untrackedFiles?: Array<{ path: string; hash: string; bytes: number }> }
export interface VerificationEvidence { changedFiles: string[]; diffInspected: boolean; diff: DiffEvidence; validation: ValidationResult; commands: CommandEvidence[] }
export interface VerificationRunner { run(workspaceRoot: string, config: CqbConfig['verification']): Promise<VerificationEvidence>; validateWorkspace?(workspaceRoot: string): Promise<void> }

interface ExecutionResult { exitCode: number | null; output: string; timedOut: boolean; hash: string; bytes: number; truncated: boolean }

async function execute(command: string, cwd: string, timeoutMs: number, captureLimit = 16_000): Promise<ExecutionResult> {
  return await new Promise((resolveResult) => {
    const child = spawn(command, { cwd, shell: true, windowsHide: true });
    let output = '';
    let timedOut = false;
    let settled = false;
    let bytes = 0;
    let truncated = false;
    const hash = createHash('sha256');
    const collect = (chunk: Buffer) => {
      if (settled) return;
      hash.update(chunk); bytes += chunk.length;
      const remaining = captureLimit - Buffer.byteLength(output);
      if (remaining > 0) output += chunk.subarray(0, remaining).toString('utf8');
      if (chunk.length > remaining) truncated = true;
    };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    const timer = setTimeout(() => {
      timedOut = true;
      void terminateProcessTree(child).finally(() => {
        if (!settled) { settled = true; resolveResult({ exitCode: null, output, timedOut, hash: hash.digest('hex'), bytes, truncated }); }
      });
    }, timeoutMs);
    child.on('error', (error) => { if (!settled) { settled = true; clearTimeout(timer); hash.update(error.message); resolveResult({ exitCode: null, output: error.message, timedOut, hash: hash.digest('hex'), bytes, truncated }); } });
    child.on('close', (code) => { if (!settled) { settled = true; clearTimeout(timer); resolveResult({ exitCode: timedOut ? null : code, output, timedOut, hash: hash.digest('hex'), bytes, truncated }); } });
  });
}

async function inspectUntracked(workspaceRoot: string, paths: string[], timeoutMs: number): Promise<{ complete: boolean; files: Array<{ path: string; hash: string; bytes: number }> }> {
  const root = resolve(workspaceRoot);
  const deadline = Date.now() + timeoutMs;
  const files: Array<{ path: string; hash: string; bytes: number }> = [];
  for (const path of paths) {
    const absolute = resolve(root, path);
    if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) return { complete: false, files };
    if (Date.now() >= deadline) return { complete: false, files };
    const metadata = await lstat(absolute);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return { complete: false, files };
    const hash = createHash('sha256');
    let bytes = 0;
    try {
      await new Promise<void>((resolveFile, reject) => {
        const stream = createReadStream(absolute);
        const timer = setTimeout(() => stream.destroy(new Error('Untracked file inspection timed out')), Math.max(1, deadline - Date.now()));
        stream.on('data', (chunk: string | Buffer) => { const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk; hash.update(buffer); bytes += buffer.length; });
        stream.on('error', (error) => { clearTimeout(timer); reject(error); });
        stream.on('end', () => { clearTimeout(timer); resolveFile(); });
      });
    } catch { return { complete: false, files }; }
    files.push({ path, hash: hash.digest('hex'), bytes });
  }
  return { complete: true, files };
}

export class ShellVerificationRunner implements VerificationRunner {
  constructor(private readonly timeoutMs = 300_000) {}

  async validateWorkspace(workspaceRoot: string): Promise<void> {
    const result = await execute('git rev-parse --is-inside-work-tree', workspaceRoot, this.timeoutMs);
    if (result.exitCode !== 0 || result.timedOut || result.output.trim() !== 'true') throw new Error('CQB requires a Git worktree for independent diff verification');
  }

  async run(workspaceRoot: string, config: CqbConfig['verification']): Promise<VerificationEvidence> {
    const validation = {} as ValidationResult;
    const commands: CommandEvidence[] = [];
    for (const name of ['tests', 'typecheck', 'lint', 'build'] as const) {
      const enabled = config[name];
      if (!enabled) { validation[name] = 'skipped'; continue; }
      const command = config.commands[name];
      const result = await execute(command, workspaceRoot, this.timeoutMs);
      const status: ValidationStatus = result.exitCode === 0 ? 'pass' : 'failed';
      validation[name] = status;
      commands.push({ name, command, exitCode: result.exitCode, output: result.output, timedOut: result.timedOut });
    }
    const diffCaptureLimit = 1_000_000;
    const status = await execute('git status --porcelain=v1 -z --untracked-files=all', workspaceRoot, this.timeoutMs, diffCaptureLimit);
    const working = await execute('git diff --no-ext-diff --binary -- .', workspaceRoot, this.timeoutMs, diffCaptureLimit);
    const staged = await execute('git diff --cached --no-ext-diff --binary -- .', workspaceRoot, this.timeoutMs, diffCaptureLimit);
    const statusEntries = status.exitCode === 0 ? status.output.split('\0').filter(Boolean) : [];
    const changedFiles = statusEntries.map((entry) => /^[ MADRCU?!]{2} /.test(entry) ? entry.slice(3) : entry).filter(Boolean);
    const untrackedPaths = statusEntries.filter((entry) => entry.startsWith('?? ')).map((entry) => entry.slice(3));
    const untracked = status.exitCode === 0 && !status.truncated ? await inspectUntracked(workspaceRoot, untrackedPaths, this.timeoutMs) : { complete: false, files: [] };
    const diffComplete = [status, working, staged].every((item) => item.exitCode === 0 && !item.timedOut && !item.truncated) && untracked.complete;
    const diffInspected = !config.diffReview || diffComplete;
    return {
      changedFiles,
      diffInspected,
      diff: { statusHash: status.hash, workingTreeHash: working.hash, stagedHash: staged.hash, statusLines: statusEntries.length, complete: diffComplete, workingTreeBytes: working.bytes, stagedBytes: staged.bytes, workingTreePatch: working.output, stagedPatch: staged.output, untrackedFiles: untracked.files },
      validation,
      commands,
    };
  }
}
