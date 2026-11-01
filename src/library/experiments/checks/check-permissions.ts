import assert from 'node:assert/strict';
import { preparePermissions } from '../../architecture/permissions.js';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

/** Independently checks directory permission against retained candidate evidence. */
class DirectoryPermissionAcceptance {
  private root = mkdtempSync(join(tmpdir(), 'arcnexus-permission-acceptance-'));

  private project = join(this.root, 'project');

  private home = join(this.root, 'codex-home');

  private work = join(this.project, 'work');

  private related = join(this.project, 'related');

  private unrelated = join(this.project, 'unrelated');

  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  run(): void {
    try {
      this.prepare();
      this.probe();
      this.verifyProtectedFiles();
      console.log('Codex directory permission acceptance passed.');
    } finally {
      rmSync(this.root, { recursive: true, force: true });
    }
  }

  /** Detects changes outside the currently active owner’s authority. */
  private verifyProtectedFiles(): void {
    assert.equal(readFileSync(join(this.related, 'related.txt'), 'utf8'), 'related');
    assert.equal(readFileSync(join(this.unrelated, 'secret.txt'), 'utf8'), 'secret');
    assert.equal(existsSync(join(this.unrelated, 'new.txt')), false);
  }

  /** Establishes the prerequisites required by the subsequent execution. */
  private prepare(): void {
    for (const path of [this.project, this.home, this.work, this.related, this.unrelated])
      mkdirSync(path);
    writeFileSync(join(this.related, 'related.txt'), 'related');
    writeFileSync(join(this.unrelated, 'secret.txt'), 'secret');
  }

  /** Handles arguments within this component’s captured contract. */
  private arguments(): string[] {
    const permissions = preparePermissions(
      this.project,
      { readPaths: ['related'], writeDirectories: ['work'] },
      ['work/allowed.txt'],
      join(this.home, 'tmp'),
    );
    return [
      'sandbox',
      '--permission-profile',
      'arcnexus',
      '--cd',
      this.work,
      ...permissions.configOverrides.flatMap((value) => ['--config', value]),
      '--',
      process.execPath,
      '--input-type=module',
      '-e',
      this.program(),
      this.work,
      this.related,
      this.unrelated,
    ];
  }

  /** Handles probe within this component’s captured contract. */
  private probe(): void {
    const result = spawnSync(process.env.CODEX_PATH ?? 'codex', this.arguments(), {
      cwd: this.work,
      env: { ...process.env, CODEX_HOME: this.home, CODEX_CONFIG: undefined },
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(
        `Codex sandbox acceptance failed (${result.status}): ${result.stderr || result.stdout}`,
      );
  }

  /** Handles program within this component’s captured contract. */
  private program(): string {
    return `import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const [work, related, unrelated] = process.argv.slice(1);
writeFileSync(join(work, 'allowed.txt'), 'allowed');
assert.equal(readFileSync(join(related, 'related.txt'), 'utf8'), 'related');
for (const [path, operation] of [[join(related, 'related.txt'), 'write'], [join(unrelated, 'secret.txt'), 'read'], [join(unrelated, 'new.txt'), 'write']]) {
  assert.throws(() => operation === 'read' ? readFileSync(path) : writeFileSync(path, 'forbidden'), {code: /EACCES|EPERM|EROFS|ENOENT/});
}`;
  }
}

new DirectoryPermissionAcceptance().run();
