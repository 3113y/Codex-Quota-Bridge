import { spawn, type ChildProcess } from 'node:child_process';

export async function terminateProcessTree(child: ChildProcess, graceMs = 2_000): Promise<void> {
  if (!child.pid) return;
  if (process.platform !== 'win32') { child.kill('SIGKILL'); return; }
  await new Promise<void>((resolveTermination) => {
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolveTermination(); } };
    const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => { child.kill(); finish(); });
    killer.on('close', () => finish());
    setTimeout(() => { child.kill(); finish(); }, graceMs).unref();
  });
}
