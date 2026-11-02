import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test, type TestContext } from 'node:test';
import { registerSuite } from '../../../../dist/library/testing/suite.js';

/** Qualifies actual subprocess filesystem enforcement through the assembled adapter. */
class ConfinementScenarios {
  /** Loads the installed adapter without turning absent support into a skipped success. */
  async prevents(t: TestContext): Promise<void> {
    const root = this.fixture(t);
    const module = await import(resolve('dist/library/operations/confinement.js'));
    const adapter = new module.SourceConfinement({
      workspace: root,
      reads: ['.'],
      outputs: ['generated'],
      temporaryRoot: join(root, '..', `${root.split('/').at(-1)}-private`),
      executable: process.env.ARCNEXUS_TEST_CODEX!,
    });
    const script =
      "const f=require('fs');console.log('stdout-proof');console.error('stderr-proof');f.writeFileSync('generated/result','ok');for(const path of ['source.txt',process.env.CODEX_HOME+'/config.toml']){try{f.writeFileSync(path,'bad');process.exit(7)}catch(e){if(!['EROFS','EACCES','EPERM'].includes(e.code))throw e;}}";
    const command = adapter.command({ command: process.execPath, args: ['-e', script] });
    const result = spawnSync(command.command, command.args, {
      cwd: root,
      env: adapter.environment(),
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /stdout-proof/);
    assert.match(result.stderr, /stderr-proof/);
    assert.equal(readFileSync(join(root, 'source.txt'), 'utf8'), 'original');
    assert.equal(readFileSync(join(root, 'generated/result'), 'utf8'), 'ok');
  }

  /** Creates a tracked source baseline with explicitly disposable untracked output. */
  private fixture(t: TestContext): string {
    const root = mkdtempSync(join(tmpdir(), 'arcnexus-confinement-'));
    t.after(() => {
      rmSync(root, { recursive: true, force: true });
      rmSync(root + '-private', { recursive: true, force: true });
      rmSync(root + '-private-configuration', { recursive: true, force: true });
    });
    writeFileSync(join(root, 'source.txt'), 'original');
    mkdirSync(join(root, 'generated'));
    for (const args of [
      ['init', '-q'],
      ['add', 'source.txt'],
    ])
      assert.equal(spawnSync('git', ['-C', root, ...args]).status, 0);
    return root;
  }
}

const scenarios = new ConfinementScenarios();

test(
  'installed confinement allows generated output and prevents source mutation',
  { skip: !process.env.ARCNEXUS_TEST_CODEX && 'Live qualification requires ARCNEXUS_TEST_CODEX' },
  (t) => scenarios.prevents(t),
);

registerSuite({ component: 'operations', level: 'acceptance', tags: ['live'] });
