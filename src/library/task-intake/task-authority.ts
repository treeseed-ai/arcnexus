import { accessSync, constants, readFileSync, realpathSync, statSync } from 'node:fs';
import { delimiter, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from '../architecture/assignment.js';
import { InputError } from '../architecture/config.js';
import { runnerHash } from '../experiments/experiments.js';

export interface TaskAuthoritySnapshot {
  executable: string;
  executableHash?: string;
  supervisingBuild: { path: string; hash: string };
}

/** Captures the executable assignment envelope generated from a validated intake proposal. */
export class TaskAuthority {
  /** Snapshots the inputs used by later verification. */
  capture(executable: string): TaskAuthoritySnapshot {
    const path = fileURLToPath(new URL('../../cli.js', import.meta.url));
    const command = this.executable(executable);
    return {
      executable: command,
      executableHash: digest(readFileSync(command)),
      supervisingBuild: { path, hash: runnerHash(path) },
    };
  }

  /** Handles verify within this component’s captured contract. */
  verify(snapshot: TaskAuthoritySnapshot): void {
    if (
      digest(readFileSync(snapshot.executable)) !== snapshot.executableHash ||
      runnerHash(snapshot.supervisingBuild.path) !== snapshot.supervisingBuild.hash
    )
      throw new InputError('Supervising build or executable changed; create a new task plan');
  }

  /** Handles executable within this component’s captured contract. */
  private executable(value: string): string {
    const paths =
      isAbsolute(value) || value.includes('/')
        ? [resolve(value)]
        : (process.env.PATH ?? '').split(delimiter).map((directory) => join(directory, value));
    for (const path of paths) {
      try {
        accessSync(path, constants.X_OK);
        if (statSync(path).isFile()) return realpathSync(path);
      } catch {
        /* Try the next declared PATH location. */
      }
    }
    throw new InputError('Codex executable is unavailable');
  }
}
