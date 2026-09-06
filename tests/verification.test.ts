import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { defaultConfig } from '../src/config/schema.js';
import { ShellVerificationRunner } from '../src/verification/runner.js';

test('verification runner executes checks and inspects working and staged diffs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cqb-verifier-'));
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'cqb@example.invalid'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'CQB Test'], { cwd: root });
  await writeFile(join(root, 'tracked.txt'), 'one\n');
  execFileSync('git', ['add', 'tracked.txt'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'base'], { cwd: root, stdio: 'ignore' });
  await writeFile(join(root, 'tracked.txt'), 'two\n');
  await writeFile(join(root, 'staged.txt'), 'staged\n');
  execFileSync('git', ['add', 'staged.txt'], { cwd: root });
  const config = structuredClone(defaultConfig.verification);
  Object.assign(config, { typecheck: false, lint: false, build: false });
  config.commands.tests = 'node -e "process.exit(0)"';
  const result = await new ShellVerificationRunner(5_000).run(root, config);
  assert.equal(result.validation.tests, 'pass');
  assert.equal(result.diffInspected, true);
  assert.match(result.changedFiles.join(','), /tracked\.txt/);
  assert.ok(result.diff.workingTreeHash);
  assert.ok(result.diff.stagedHash);
});

test('verification runner fails a command that exceeds its timeout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cqb-timeout-'));
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  const config = structuredClone(defaultConfig.verification);
  Object.assign(config, { typecheck: false, lint: false, build: false, diffReview: false });
  config.commands.tests = 'node -e "setTimeout(() => {}, 10000)"';
  const result = await new ShellVerificationRunner(100).run(root, config);
  assert.equal(result.validation.tests, 'failed');
  assert.equal(result.commands[0]?.timedOut, true);
});

test('verification runner rejects a non-Git workspace during registration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cqb-non-git-'));
  await assert.rejects(() => new ShellVerificationRunner(5_000).validateWorkspace(root), /Git worktree/i);
});
