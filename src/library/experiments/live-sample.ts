import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stateRoot } from '../workspace/state.js';
import { fixtureFiles } from './experiment-config.js';

/** Runs explicit live sample assignments and retains each independent acceptance result. */
class LiveSampleCampaign {
  private supervisor = fileURLToPath(new URL('../../..', import.meta.url));

  private root!: string;

  private source!: string;

  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  run(): void {
    this.prepare();
    const results = [this.sample(1), this.sample(2)];
    assert.equal(results[0]!.base, results[1]!.base);
    assert.notEqual(results[0]!.workspace, results[1]!.workspace);
    writeFileSync(join(this.root, 'acceptance.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ root: this.root, results }, null, 2));
  }

  /** Establishes the prerequisites required by the subsequent execution. */
  private prepare(): void {
    const samples = join(stateRoot(), 'samples');
    mkdirSync(samples, { recursive: true, mode: 0o700 });
    this.root = mkdtempSync(join(samples, 'identity-'));
    this.source = join(this.root, 'source');
    for (const [path, content] of Object.entries(fixtureFiles('identity'))) {
      const target = join(this.source, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, Buffer.from(content, 'base64'));
    }
    for (const args of [
      ['init', '-b', 'main'],
      ['config', 'user.name', 'ArcNexus acceptance'],
      ['config', 'user.email', 'acceptance@example.invalid'],
      ['add', '.'],
      ['commit', '-m', 'Identity acceptance baseline'],
    ])
      this.command('git', args, this.source);
  }

  /** Handles command within this component’s captured contract. */
  private command(executable: string, args: string[], cwd = this.supervisor): string {
    const result = spawnSync(executable, args, {
      cwd,
      encoding: 'utf8',
      timeout: 950000,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (result.error || result.status !== 0)
      throw new Error(`${executable} failed: ${result.error ?? result.stderr}\n${result.stdout}`);
    return result.stdout;
  }

  private readonly objective =
    'Add and export isSessionExpired(expiresAtMs, nowMs) in src/identity.mjs. Return nowMs >= expiresAtMs. Document the behavior in README.md, add tests for before, exactly at, and after expiry, and preserve normalizeIdentity. Document first, observe the new tests fail before implementing, then verify.';

  /** Handles sample within this component’s captured contract. */
  private sample(attempt: number) {
    console.error(`Live sample ${attempt}/2; evidence root: ${this.root}`);
    const output = this.command(process.execPath, [
      'dist/cli.js',
      'run',
      'identity',
      this.objective,
      '--project',
      this.source,
    ]);
    writeFileSync(join(this.root, `run-${attempt}.json`), output, { mode: 0o600 });
    const record = JSON.parse(output);
    assert.equal(record.status, 'completed');
    assert.ok(record.changes.some((change: any) => change.path === 'README.md'));
    assert.ok(record.changes.some((change: any) => change.path.startsWith('tests/')));
    const acceptance = this.command(process.execPath, [
      'scripts/check-sample.mjs',
      record.workspace,
    ]);
    writeFileSync(join(this.root, `acceptance-${attempt}.log`), acceptance);
    assert.equal(this.command('git', ['status', '--porcelain'], this.source), '');
    console.error(`Live sample ${attempt} independently verified: ${record.id}`);
    return {
      id: record.id,
      base: record.base,
      workspace: record.workspace,
      threadId: record.threadId,
    };
  }
}

new LiveSampleCampaign().run();
