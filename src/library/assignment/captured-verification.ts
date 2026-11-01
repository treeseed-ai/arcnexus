import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { digest } from '../architecture/assignment.js';
import { covered } from '../architecture/components.js';
import { git } from '../operations/process.js';
import { withFrozenTests, type FrozenTest } from './checkpoints.js';
import type { SessionState } from './session-state.js';

/** Prevents candidate test or check-configuration edits from replacing active acceptance authority. */
export class CapturedVerification {
  /** Uses immutable source blobs from the captured authority revision, outside worker-editable state. */
  constructor(private readonly state: SessionState) {}

  /** Reruns observed checks against captured inputs when candidate edits changed them. */
  async verify(): Promise<void> {
    const { record } = this.state.options;
    if (!record.generalExecution) return;
    const inputs = this.inputs();
    if (!inputs.some((input) => this.changed(input))) return;
    await withFrozenTests(record, inputs, async () => {
      for (const command of this.state.component.verification)
        await this.state.command(command, 'captured-acceptance');
    });
    this.state.safe();
  }

  /** Captures owner tests, explicitly declared check inputs and tracked command files automatically. */
  private inputs(): FrozenTest[] {
    const { record } = this.state.options;
    const scope = [
      ...this.state.component.tests,
      ...((record.trustedVerificationPaths ?? []) as string[]),
      ...this.state.component.verification.flatMap((c) => [c.command, ...c.args]),
    ];
    return git(record.source, 'ls-tree', '-r', '--name-only', this.state.resolved.base)
      .split('\n')
      .filter((path) => path && covered(path, scope))
      .map((path) => {
        const bytes = execFileSync('git', [
          '-C',
          record.source,
          'show',
          `${this.state.resolved.base}:${path}`,
        ]);
        return { path, content: bytes.toString('base64'), sha256: digest(bytes) };
      });
  }

  /** Treats a deleted input as changed and retains the original through the frozen-check wrapper. */
  private changed(input: FrozenTest): boolean {
    try {
      return (
        digest(readFileSync(join(this.state.options.record.workspace, input.path))) !== input.sha256
      );
    } catch {
      return true;
    }
  }
}
