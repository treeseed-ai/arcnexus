import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { checkSummary } from './check-report-summary.js';
class SummaryFaultInjection {
  private marker = new URL('./fault-injection.json', import.meta.url);
  private path = join(
    process.cwd(),
    ['src/library/report/report.ts', 'src/report/report.ts', 'src/report.ts'].find(existsSync) ??
      'src/report.ts',
  );
  async run(): Promise<void> {
    if (!existsSync(this.marker)) this.inject();
    else this.observeRepair();
    await checkSummary();
  }
  private hash(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
  }
  private inject(): void {
    const before = readFileSync(this.path, 'utf8');
    const signature = 'export function markdownReport(record: RecordData): string {';
    if (!before.includes(signature))
      throw new Error('Fault injection signature unavailable; campaign must be reviewed');
    const after = before.replace(
      signature,
      signature +
        "\n  record = {...record, outcome: 'INJECTED_WRONG_OUTCOME'}; // qualification fault injection\n",
    );
    writeFileSync(this.path, after);
    writeFileSync(
      this.marker,
      JSON.stringify({
        label: 'deliberate outcome substitution',
        before: this.hash(before),
        injected: this.hash(after),
        path: this.path,
        at: new Date().toISOString(),
      }),
    );
    console.log('FAULT_INJECTED: narrow outcome substitution before independent acceptance');
    const build = spawnSync('npm', ['run', 'build'], { encoding: 'utf8' });
    if (build.status !== 0) throw new Error(build.stderr + build.stdout);
  }
  private observeRepair(): void {
    const evidence = JSON.parse(readFileSync(this.marker, 'utf8'));
    evidence.repaired = this.hash(readFileSync(this.path));
    writeFileSync(this.marker, JSON.stringify(evidence));
    console.log('FAULT_REPAIR_OBSERVED: ' + evidence.repaired);
  }
}
await new SummaryFaultInjection().run();
