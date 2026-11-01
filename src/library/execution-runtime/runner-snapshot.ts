import { createHash } from 'node:crypto';
import {
  constants,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CapturedRunner {
  directory: string;
  hash: string;
}

/** Retains executable modules and dependencies outside the installation and editable candidates. */
export class RunnerSnapshot {
  private readonly inputs = ['dist', 'node_modules', 'package.json', 'package-lock.json'];

  /** Copies a complete installed runner and refuses concurrent changes instead of mixing builds. */
  capture(root: string): CapturedRunner {
    const installation = fileURLToPath(new URL('../../../', import.meta.url));
    const parent = join(root, 'supervisors');
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    const directory = mkdtempSync(join(parent, 'runner-'));
    const hash = this.hash(installation);
    for (const name of this.inputs)
      cpSync(join(installation, name), join(directory, name), {
        recursive: true,
        dereference: true,
        mode: constants.COPYFILE_FICLONE,
      });
    if (this.hash(installation) !== hash || this.hash(directory) !== hash)
      throw new Error(
        'Supervising installation changed during capture; retry after its build finishes',
      );
    const runner = { directory, hash };
    writeFileSync(join(directory, 'runner.json'), JSON.stringify(runner), { mode: 0o600 });
    return runner;
  }

  /** Hashes names, executable modes and file bytes, following the same dependency links as capture. */
  private hash(directory: string): string {
    const hash = createHash('sha256');
    for (const name of this.inputs) this.visit(directory, name, hash);
    return hash.digest('hex');
  }

  /** Walks deterministic directory order and rejects unsupported executable input types. */
  private visit(root: string, path: string, hash: ReturnType<typeof createHash>): void {
    const absolute = join(root, path);
    const stat = statSync(absolute);
    hash.update(JSON.stringify([path, stat.mode & 0o777]));
    if (stat.isDirectory()) {
      for (const name of readdirSync(absolute).sort()) this.visit(root, join(path, name), hash);
    } else if (stat.isFile()) hash.update(readFileSync(absolute));
    else throw new Error('Unsupported supervising runner input: ' + absolute);
  }
}
