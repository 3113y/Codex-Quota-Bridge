import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

async function filesUnder(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

const digest = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');

export async function verifyPackage(sourceRoot, pluginRoot) {
  const entries = ['.codex-plugin', '.mcp.json', 'package.json', 'dist', 'docs', 'hooks', 'skills', 'prompts', 'config.example.yaml', 'config.assisted.example.yaml', 'config.autopilot.example.yaml', 'LICENSE', 'README.md', 'README.zh-CN.md'];
  for (const entry of entries) {
    const source = resolve(sourceRoot, entry);
    const packaged = resolve(pluginRoot, entry);
    const sourceFiles = (await import('node:fs/promises')).stat(source).then((item) => item.isDirectory() ? filesUnder(source) : [source]);
    for (const sourceFile of await sourceFiles) {
      const suffix = relative(source, sourceFile);
      const packagedFile = suffix ? resolve(packaged, suffix) : packaged;
      if (await digest(sourceFile) !== await digest(packagedFile)) throw new Error(`Packaged file differs from source: ${entry}${suffix ? `/${suffix}` : ''}`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const sourceRoot = resolve(import.meta.dirname, '..');
  await verifyPackage(sourceRoot, resolve(sourceRoot, 'build', 'marketplace', 'plugins', 'codex-quota-bridge'));
  process.stdout.write('Packaged runtime matches the current source build.\n');
}
