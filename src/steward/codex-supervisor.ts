import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { processStart } from '../operations/service-state.js';
class CodexSupervisor {
  private readonly parent = Number(process.env.ARCNEXUS_HOST_PID);
  private readonly identity = process.env.ARCNEXUS_HOST_START;
  private child!: ChildProcess;
  private killTimer?: NodeJS.Timeout;
  private monitor?: NodeJS.Timeout;
  run(): void {
    if (process.argv[2] !== 'exec' || !this.alive()) process.exit(64);
    this.child = spawn(
      process.env.ARCNEXUS_CODEX_EXECUTABLE!,
      ['exec', '--ignore-user-config', ...process.argv.slice(3)],
      { detached: true, stdio: 'inherit' },
    );
    if (this.child.pid)
      writeFileSync(process.env.ARCNEXUS_CODEX_PID!, String(this.child.pid), { mode: 0o600 });
    this.monitor = setInterval(() => {
      if (!this.alive()) this.stop();
    }, 100);
    process.on('SIGTERM', () => this.stop());
    process.on('SIGINT', () => this.stop());
    this.child.on('error', () => {
      process.exitCode = 1;
    });
    this.child.on('close', (code) => this.close(code));
  }
  private alive(): boolean {
    return (
      Number.isSafeInteger(this.parent) &&
      this.parent > 1 &&
      this.identity !== undefined &&
      processStart(this.parent) === this.identity
    );
  }
  private signal(signal: NodeJS.Signals): void {
    if (!this.child.pid) return;
    try {
      process.kill(-this.child.pid, signal);
    } catch {}
  }
  private stop(): void {
    if (!this.child.pid) return;
    this.signal('SIGTERM');
    this.killTimer ??= setTimeout(() => this.signal('SIGKILL'), 300);
  }
  private close(code: number | null): void {
    clearInterval(this.monitor);
    clearTimeout(this.killTimer);
    this.signal('SIGKILL');
    process.exitCode = code ?? 1;
  }
}
new CodexSupervisor().run();
