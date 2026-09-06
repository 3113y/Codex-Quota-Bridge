import { resolve } from 'node:path';
import { runMockDemo } from '../dist/demo.js';

const stateRoot = resolve(process.cwd(), '.cqb-demo', new Date().toISOString().replaceAll(':', '-'));
const result = await runMockDemo(stateRoot);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
