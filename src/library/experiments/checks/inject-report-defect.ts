import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

/** Introduces a labeled implementation defect so qualification can prove corrective editing. */
class ReportFaultInjection {
  private marker: string;

  /** Requires external acceptance and a per-workspace marker before permitting fault injection. */
  constructor(
    markerPrefix: string | undefined,
    private acceptance: string | undefined,
  ) {
    if (!markerPrefix || !acceptance)
      throw new Error('Expected external marker and acceptance script');
    this.marker = markerPrefix + '.' + basename(process.cwd());
  }

  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  run(): void {
    if (!existsSync(this.marker)) this.inject();
    const result = spawnSync(process.execPath, [this.acceptance!], { stdio: 'inherit' });
    process.exitCode = result.status ?? 1;
  }

  /** Introduces the labeled implementation defect and records its evidence. */
  private inject(): void {
    const path =
        ['src/library/report/report.ts', 'src/report/report.ts', 'src/report.ts'].find(
          existsSync,
        ) ?? 'src/report.ts',
      before = readFileSync(path, 'utf8');
    if (!before.includes('## Operations'))
      throw new Error('Fault injection requires implemented Operations heading');
    const after = before.replace('## Operations', '## Injected incorrect heading');
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    writeFileSync(
      this.marker,
      JSON.stringify({
        label: 'deliberate qualification fault injection',
        path,
        before: hash(before),
        after: hash(after),
        at: new Date().toISOString(),
      }),
      { mode: 0o600, flag: 'wx' },
    );
    writeFileSync(path, after);
    const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
    if (build.status !== 0) process.exit(build.status ?? 1);
    console.log(
      `FAULT_INJECTED: report Operations heading changed; repair ${path} without changing acceptance.`,
    );
  }
}

new ReportFaultInjection(process.argv[2], process.argv[3]).run();
