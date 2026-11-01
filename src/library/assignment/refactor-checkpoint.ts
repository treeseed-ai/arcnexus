import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { digest } from '../architecture/assignment.js';
import { covered } from '../architecture/components.js';
import { git } from '../operations/process.js';
import { withFrozenTests } from './checkpoints.js';
import type { SessionState } from './session-state.js';

/** Preserves passing characterization coverage without inventing a behavioral change. */
export class RefactorCheckpoint {
  /** Uses the same captured owner scope and host verification as ordinary engineering. */
  constructor(private readonly state: SessionState) {}

  /** Observes a passing baseline and freezes actual test sources before implementation. */
  async prepare(): Promise<void> {
    const { record } = this.state.options;
    this.state.safe();
    for (const command of this.state.component.verification)
      await this.state.command(command, 'characterization-before');
    const paths = git(record.workspace, 'ls-files', '--cached', '--others', '--exclude-standard')
      .trim()
      .split('\n')
      .filter((path) => covered(path, this.state.component.tests));
    if (!paths.length) throw new Error('Refactor needs observed characterization coverage');
    this.state.frozen = paths.map((path) => {
      const bytes = readFileSync(join(record.workspace, path));
      return { path, content: bytes.toString('base64'), sha256: digest(bytes) };
    });
    record.frozenTests = this.state.frozen;
    record.characterization = true;
    writeFileSync(join(this.state.dir, 'frozen-tests.json'), JSON.stringify(this.state.frozen));
    this.state.specificationFinished = true;
    this.state.checkpoint();
  }

  /** Rechecks the captured passing tests against the assembled implementation. */
  async verify(): Promise<void> {
    if (!this.state.options.record.characterization) return;
    await withFrozenTests(this.state.options.record, this.state.frozen, async () => {
      for (const command of this.state.component.verification)
        await this.state.command(command, 'characterization-after');
      this.state.safe();
    });
  }
}
