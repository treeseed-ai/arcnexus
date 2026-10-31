import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { processStart } from '../operations/service-state.js';
const parent = Number(process.env.ARCNEXUS_HOST_PID),
  identity = process.env.ARCNEXUS_HOST_START;
const alive = () =>
  Number.isSafeInteger(parent) &&
  parent > 1 &&
  identity !== undefined &&
  processStart(parent) === identity;
if (process.argv[2] !== 'exec' || !alive()) process.exit(64);
const child = spawn(
  process.env.ARCNEXUS_CODEX_EXECUTABLE!,
  ['exec', '--ignore-user-config', ...process.argv.slice(3)],
  { detached: true, stdio: 'inherit' },
);
if (child.pid) writeFileSync(process.env.ARCNEXUS_CODEX_PID!, String(child.pid), { mode: 0o600 });
let killTimer: NodeJS.Timeout | undefined;
const stop = () => {
  if (child.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {}
    killTimer ??= setTimeout(() => {
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {}
    }, 300);
  }
};
const monitor = setInterval(() => {
  if (!alive()) stop();
}, 100);
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
child.on('error', () => {
  process.exitCode = 1;
});
child.on('close', (code) => {
  clearInterval(monitor);
  if (killTimer) clearTimeout(killTimer);
  if (child.pid)
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
  process.exitCode = code ?? 1;
});
