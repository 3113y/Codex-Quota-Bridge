import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('plugin manifest references packaged components that exist', async () => {
  const manifestPath = resolve(repositoryRoot, '.codex-plugin', 'plugin.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  assert.equal(manifest.name, 'codex-quota-bridge');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.skills, './skills/');
  assert.equal(manifest.mcpServers, './.mcp.json');

  await access(resolve(repositoryRoot, manifest.skills));
  await access(resolve(repositoryRoot, manifest.mcpServers));
  await access(resolve(repositoryRoot, 'hooks', 'hooks.json'));
  await access(resolve(repositoryRoot, 'scripts', 'install.ps1'));
});

test('bundled MCP server launches the compiled CQB entry point', async () => {
  const config = JSON.parse(await readFile(resolve(repositoryRoot, '.mcp.json'), 'utf8'));
  const server = config.mcpServers.cqb;

  assert.equal(server.command, 'node');
  assert.deepEqual(server.args, ['${PLUGIN_ROOT}/dist/mcp/server.js']);
});

test('TypeScript build layout matches packaged runtime paths', async () => {
  const config = JSON.parse(await readFile(resolve(repositoryRoot, 'tsconfig.json'), 'utf8'));
  const packageJson = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'));
  assert.equal(config.compilerOptions.rootDir, 'src');
  assert.equal(config.compilerOptions.outDir, 'dist');
  assert.match(packageJson.scripts.build, /^node scripts\/clean\.mjs/);
});

test('packaged marketplace uses the Codex repository layout', async () => {
  const packagingScript = await readFile(resolve(repositoryRoot, 'scripts', 'package-plugin.mjs'), 'utf8');
  assert.match(packagingScript, /\.agents.*plugins.*marketplace\.json/);
  assert.match(packagingScript, /\.\/plugins\/codex-quota-bridge/);
  assert.match(packagingScript, /verifyPackage/);
});

test('packaged plugin includes separate English and Chinese documentation', async () => {
  const packagedRoot = resolve(repositoryRoot, 'build', 'marketplace', 'plugins', 'codex-quota-bridge');
  const pairs = [
    ['README.md', 'README.zh-CN.md'],
    ['docs/integration-decision.md', 'docs/integration-decision.zh-CN.md'],
    ['docs/windows-installation.md', 'docs/windows-installation.zh-CN.md'],
    ['docs/security.md', 'docs/security.zh-CN.md'],
  ];
  for (const [englishPath, chinesePath] of pairs) {
    const english = await readFile(resolve(packagedRoot, englishPath), 'utf8');
    const chinese = await readFile(resolve(packagedRoot, chinesePath), 'utf8');
    assert.match(english, /\[简体中文\]\([^)]+\.zh-CN\.md\)/);
    assert.match(chinese, /[\u4e00-\u9fff]/);
    assert.match(chinese, /\[English\]\([^)]+\.md\)/);
  }
});

test('session hook injects concise CQB routing context', async () => {
  const hookPath = resolve(repositoryRoot, 'hooks', 'session-context.mjs');
  const output = await new Promise<string>((resolveOutput, reject) => {
    const child = spawn(process.execPath, [hookPath], { cwd: repositoryRoot });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolveOutput(stdout) : reject(new Error(`hook exited ${code}`)));
    child.stdin.end(JSON.stringify({
      session_id: 'session-1',
      cwd: repositoryRoot,
      hook_event_name: 'SessionStart',
      source: 'startup',
    }));
  });

  const result = JSON.parse(output);
  assert.match(result.hookSpecificOutput.additionalContext, /CQB/);
  assert.match(result.hookSpecificOutput.additionalContext, /@Browser/);
  assert.match(result.hookSpecificOutput.additionalContext, /cqb_bind_reviewer/);
  assert.doesNotMatch(result.hookSpecificOutput.additionalContext, /session-1/);
});

test('hook response preserves the active lifecycle event name', async () => {
  const hookPath = resolve(repositoryRoot, 'hooks', 'session-context.mjs');
  const output = await new Promise<string>((resolveOutput, reject) => {
    const child = spawn(process.execPath, [hookPath], { cwd: repositoryRoot });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolveOutput(stdout) : reject(new Error(`hook exited ${code}`)));
    child.stdin.end(JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'implement feature' }));
  });
  assert.equal(JSON.parse(output).hookSpecificOutput.hookEventName, 'UserPromptSubmit');
});
