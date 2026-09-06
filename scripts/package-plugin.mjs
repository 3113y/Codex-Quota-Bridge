import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { verifyPackage } from './verify-package.mjs';

const root = resolve(import.meta.dirname, '..');
const marketplaceRoot = resolve(root, 'build', 'marketplace');
const pluginRoot = resolve(marketplaceRoot, 'plugins', 'codex-quota-bridge');
const marketplaceManifest = resolve(marketplaceRoot, '.agents', 'plugins', 'marketplace.json');
await rm(marketplaceRoot, { recursive: true, force: true });
await mkdir(pluginRoot, { recursive: true });

for (const entry of ['.codex-plugin', '.mcp.json', 'package.json', 'dist', 'docs', 'hooks', 'skills', 'prompts', 'config.example.yaml', 'config.assisted.example.yaml', 'config.autopilot.example.yaml', 'LICENSE', 'README.md', 'README.zh-CN.md']) {
  await cp(resolve(root, entry), resolve(pluginRoot, entry), { recursive: true });
}

const marketplace = {
  name: 'cqb-local',
  interface: { displayName: 'CQB Local' },
  plugins: [{
    name: 'codex-quota-bridge',
    source: { source: 'local', path: './plugins/codex-quota-bridge' },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
    category: 'Developer Tools',
  }],
};
await mkdir(resolve(marketplaceRoot, '.agents', 'plugins'), { recursive: true });
await writeFile(marketplaceManifest, `${JSON.stringify(marketplace, null, 2)}\n`, 'utf8');
await verifyPackage(root, pluginRoot);
process.stdout.write(`${marketplaceRoot}\n`);
