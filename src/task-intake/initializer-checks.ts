import { join } from 'node:path';
import { targetCommand } from '../architecture/bindings.js';
import { milliseconds } from '../architecture/config.js';
import type { InitializationSnapshot } from '../architecture/initialization.js';
import { candidateDigest } from '../change-inspection/changes.js';
import { operationEnvironment } from '../operations/operations.js';
import { execute, type CommandResult } from '../operations/process.js';
import { observe } from '../report/timeline.js';
import { save, type RecordData } from '../workspace/state.js';
import { assertIdentity } from '../workspace/workspace.js';
export class InitializerChecks {
  constructor(
    private root: string,
    private record: RecordData,
    private snapshot: InitializationSnapshot,
  ) {}
  async verify(signal: AbortSignal): Promise<void> {
    const before = candidateDigest(this.record);
    for (const command of this.snapshot.context.at(-1)!.verification) {
      observe(this.root, this.record, 'initializer.check.started', command);
      try {
        const result = await this.command(command, signal);
        this.record.commands.push({ ...result, stage: 'initializer-verification' });
        observe(this.root, this.record, 'initializer.check.completed', result);
      } catch (error) {
        if (error && typeof error === 'object' && 'commandResult' in error)
          this.record.commands.push({
            ...(error.commandResult as CommandResult),
            stage: 'initializer-verification',
          });
        throw error;
      } finally {
        save(this.root, this.record);
        this.unchanged(before);
      }
    }
  }
  private command(command: import('../architecture/config.js').Command, signal: AbortSignal) {
    return execute(
      targetCommand(this.record, command),
      this.record.workspace,
      join(
        this.root,
        'runs',
        this.record.id,
        `initializer-check-${this.record.commands.length}.log`,
      ),
      signal,
      {
        env: operationEnvironment(this.record),
        timeoutMs: milliseconds(this.snapshot.profile.commandTimeoutSeconds),
      },
    );
  }
  unchanged(before: string): void {
    assertIdentity(this.record);
    if (candidateDigest(this.record) !== before)
      throw new Error('Read-only initializer changed source');
  }
}
