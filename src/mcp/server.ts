#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { WindowsDesktopController } from '../automation/windows.js';
import { loadConfig } from '../config/loader.js';
import { CqbService } from '../core/service.js';
import { FileTaskStore } from '../core/store.js';
import { handleJsonRpc } from './protocol.js';

const codexDataRoot = process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME) : resolve(homedir(), '.codex');
const defaultStateRoot = resolve(codexDataRoot, 'cqb');
const configPath = process.env.CQB_CONFIG_PATH ?? resolve(defaultStateRoot, 'config.yaml');
const config = await loadConfig(configPath);
const stateRoot = process.env.CQB_STATE_DIR ? resolve(process.env.CQB_STATE_DIR) : resolve(codexDataRoot, config.storage.stateDirectory);
const service = new CqbService(config, new FileTaskStore(stateRoot), new WindowsDesktopController(config.reviewer), undefined, undefined, configPath);
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of lines) {
  if (!line.trim()) continue;
  try {
    const response = await handleJsonRpc(JSON.parse(line) as Record<string, unknown>, service);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: error instanceof Error ? error.message : 'Parse error' } })}\n`);
  }
}
