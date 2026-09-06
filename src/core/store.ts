import { access, copyFile, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { makeEvent } from '../logging/events.js';
import type { TaskRecord } from './types.js';

function safeId(id: string): string {
  if (id === '.' || id === '..' || !/^[A-Za-z0-9._-]+$/.test(id)) throw new Error('Task id contains unsupported characters');
  return id;
}

export class FileTaskStore {
  constructor(private readonly root: string) {}

  private taskDirectory(id: string): string {
    return resolve(this.root, 'tasks', safeId(id));
  }

  async load(id: string): Promise<TaskRecord | undefined> {
    const directory = this.taskDirectory(id);
    try {
      return JSON.parse(await readFile(resolve(directory, 'task.json'), 'utf8')) as TaskRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      try {
        const checkpointDirectory = resolve(directory, 'checkpoints');
        const checkpoints = (await readdir(checkpointDirectory)).filter((name) => name.endsWith('.json')).sort().reverse();
        for (const checkpoint of checkpoints) {
          try { return JSON.parse(await readFile(resolve(checkpointDirectory, checkpoint), 'utf8')) as TaskRecord; }
          catch { /* inspect the next durable checkpoint */ }
        }
      } catch (checkpointError) {
        if ((checkpointError as NodeJS.ErrnoException).code !== 'ENOENT') throw checkpointError;
      }
      return undefined;
    }
  }

  async save(task: TaskRecord, eventType = 'task.saved', eventData: unknown = {}): Promise<void> {
    const directory = this.taskDirectory(task.id);
    await mkdir(directory, { recursive: true });
    const target = resolve(directory, 'task.json');
    const temporary = resolve(directory, `task.${process.pid}.tmp`);
    const content = `${JSON.stringify(task, null, 2)}\n`;
    const checkpointDirectory = resolve(directory, 'checkpoints');
    await mkdir(checkpointDirectory, { recursive: true });
    const checkpoint = resolve(checkpointDirectory, `${Date.now().toString().padStart(16, '0')}-${randomUUID()}.json`);
    await writeFile(checkpoint, content, { encoding: 'utf8', flag: 'wx' });
    await writeFile(temporary, content, 'utf8');
    try {
      await rename(temporary, target);
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      await copyFile(checkpoint, target);
      await unlink(temporary).catch(() => undefined);
    }
    await writeFile(resolve(directory, 'events.jsonl'), `${makeEvent(eventType, task.id, eventData)}\n`, { encoding: 'utf8', flag: 'a' });
  }

  async writeArtifact(taskId: string, name: string, content: string): Promise<string> {
    if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error('Artifact name contains unsupported characters');
    const directory = this.taskDirectory(taskId);
    await mkdir(directory, { recursive: true });
    const path = resolve(directory, name);
    await writeFile(path, content, 'utf8');
    return path;
  }

  async isAutomationDisabled(): Promise<boolean> {
    try { await access(resolve(this.root, 'automation.disabled')); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  }

  async setAutomationDisabled(disabled: boolean): Promise<void> {
    const marker = resolve(this.root, 'automation.disabled');
    await mkdir(this.root, { recursive: true });
    if (disabled) await writeFile(marker, `${new Date().toISOString()}\n`, 'utf8');
    else await unlink(marker).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
  }
}
