import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  linkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test, type TestContext } from 'node:test';
import { registerSuite } from '../../../../dist/library/testing/suite.js';

/** Exercises host-owned edit validation and durable idempotence against actual files. */
class CheckedEditScenarios {
  /** Validates an entire batch before mutation and rejects ambiguous retries. */
  async applies(t: TestContext): Promise<void> {
    const { root, edits } = await this.fixture(t);
    const change = {
      path: 'owned/value.txt',
      operation: 'update',
      expectedSha256: this.hash('before'),
      content: 'after',
    };
    assert.throws(
      () =>
        edits.apply({ id: 'bad-batch', changes: [change, { ...change, path: 'other/value.txt' }] }),
      /outside/,
    );
    assert.equal(readFileSync(join(root, 'owned/value.txt'), 'utf8'), 'before');
    const request = { id: 'first', changes: [change] };
    const result = edits.apply(request);
    assert.equal(readFileSync(join(root, 'owned/value.txt'), 'utf8'), 'after');
    assert.deepEqual(edits.apply(request), result);
    assert.throws(
      () => edits.apply({ id: 'first', changes: [{ ...change, content: 'different' }] }),
      /identity/,
    );
    assert.throws(() => edits.apply({ id: 'stale', changes: [change] }), /Stale/);
  }

  /** Rejects traversal and both filesystem alias forms before touching maintained bytes. */
  async aliases(t: TestContext): Promise<void> {
    const { root, edits } = await this.fixture(t);
    symlinkSync('../other/value.txt', join(root, 'owned/symlink'));
    linkSync(join(root, 'other/value.txt'), join(root, 'owned/hardlink'));
    for (const path of ['../escape', 'owned/symlink', 'owned/hardlink'])
      assert.throws(() =>
        edits.apply({
          id: 'alias',
          changes: [
            { path, operation: 'update', expectedSha256: this.hash('before'), content: 'bad' },
          ],
        }),
      );
    assert.equal(readFileSync(join(root, 'other/value.txt'), 'utf8'), 'before');
  }

  /** Kills a real child after journal publication or the first atomic source replacement. */
  async crash(t: TestContext, afterFile: boolean): Promise<void> {
    const { root, edits, directory } = await this.fixture(t);
    const evidence = join(directory, 'evidence');
    const target = afterFile ? join(root, 'owned/value.txt') : join(evidence, 'crash.json');
    const request = this.crashRequest();
    const script = `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
      const original=fs.renameSync; fs.renameSync=(from,to)=>{original(from,to);if(to===process.argv[3])process.exit(85)};
      syncBuiltinESMExports(); const {CheckedEdits}=await import(process.argv[4]);
      new CheckedEdits(process.argv[1],process.argv[2],'assignment-authority',()=>{}).apply(JSON.parse(process.argv[5]));`;
    const child = spawnSync(process.execPath, [
      '--input-type=module',
      '-e',
      script,
      root,
      evidence,
      target,
      pathToFileURL(resolve('dist/library/workspace/checked-edits.js')).href,
      JSON.stringify(request),
    ]);
    assert.equal(child.status, 85, child.stderr.toString());
    edits.recover();
    edits.recover();
    assert.equal(readFileSync(join(root, 'owned/value.txt'), 'utf8'), 'after');
    assert.equal(readFileSync(join(root, 'owned/new.md'), 'utf8'), 'new');
    assert.equal(edits.apply(request).status, 'committed');
  }

  /** Builds a batch whose second file remains pending if the process dies after the first write. */
  private crashRequest() {
    return {
      id: 'crash',
      changes: [
        {
          path: 'owned/value.txt',
          operation: 'update',
          expectedSha256: this.hash('before'),
          content: 'after',
        },
        { path: 'owned/new.md', operation: 'create', expectedSha256: null, content: 'new' },
      ],
    };
  }

  /** Creates isolated host evidence and binds the tool to one assignment's captured owner. */
  private async fixture(t: TestContext) {
    const directory = mkdtempSync(join(tmpdir(), 'checked-edits-'));
    const root = join(directory, 'source');
    mkdirSync(root);
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    mkdirSync(join(root, 'owned'));
    mkdirSync(join(root, 'other'));
    writeFileSync(join(root, 'owned/value.txt'), 'before');
    writeFileSync(join(root, 'other/value.txt'), 'before');
    const module = await import(resolve('dist/library/workspace/checked-edits.js'));
    const edits = new module.CheckedEdits(
      root,
      join(directory, 'evidence'),
      'assignment-authority',
      (path: string) => {
        if (!path.startsWith('owned/')) throw new Error('Edit outside captured owner');
      },
    );
    return { root, edits, directory };
  }

  /** Computes the expected current-content identity supplied with a checked edit. */
  private hash(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }
}

const scenarios = new CheckedEditScenarios();

test('checked edits validate batches and deduplicate durable retries', (t) => scenarios.applies(t));

test('checked edits reject traversal and filesystem aliases', (t) => scenarios.aliases(t));

test('checked edits recover after journal publication', (t) => scenarios.crash(t, false));

test('checked edits recover after partial source application', (t) => scenarios.crash(t, true));

registerSuite({ component: 'workspace', level: 'acceptance', tags: ['deterministic'] });
