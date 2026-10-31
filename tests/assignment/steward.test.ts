import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { cli, workflowFixture } from '../development-tooling/workflow-fixture.js';
class StewardTests {
  scenario_1(t: TestContext, args: any, expected: any) {
    const f = workflowFixture(t),
      r = f.run(...args);
    assert.equal(r.status, 0, r.stderr);
    const v = JSON.parse(r.stdout);
    assert.equal(v.settings.model, expected);
    assert.equal(v.settings.reasoning, 'medium');
    assert.equal(v.settings.webSearch, 'live');
    assert.equal(v.settings.network, false);
    assert.equal(v.settings.approval, 'never');
    assert.equal(v.settings.nestedDelegation, false);
    const calls = readFileSync(f.calls, 'utf8')
      .trim()
      .split('\n')
      .map((line: string) => JSON.parse(line));
    for (const c of calls) {
      assert.equal(c.args[c.args.indexOf('--model') + 1], expected);
      assert.ok(c.args.includes('--ignore-user-config'));
    }
    assert.deepEqual(v.settings.access.writeDirectories, []);
  }
  invalidAttemptLimitsAndInputFailBeforeInference_2(t: TestContext) {
    const f = workflowFixture(t);
    for (const value of ['0', '3', '1.5', 'two'])
      assert.equal(f.run('--max-attempts', value).status, 2);
    assert.equal(existsSync(f.calls), false);
  }
  baselineFailurePreventsActivation_3(t: TestContext) {
    const f = workflowFixture(t);
    writeFileSync(join(f.repo, 'source.txt'), 'broken');
    f.commit();
    const r = f.run();
    assert.equal(r.status, 1);
    assert.equal(existsSync(f.calls), false);
    assert.equal(JSON.parse(r.stdout).stage, 'baseline');
  }
  scenario_4(t: TestContext, mode: any) {
    const f = workflowFixture(t, mode),
      r = f.run('--max-attempts', '2');
    assert.equal(r.status, 1);
    assert.notEqual(JSON.parse(r.stdout).status, 'completed');
  }
  targetCodexConfigurationIsRejectedBeforeActivation_5(t: TestContext) {
    const f = workflowFixture(t);
    mkdirSync(join(f.repo, '.codex'));
    writeFileSync(join(f.repo, '.codex/config.toml'), 'model="unwanted"');
    f.commit();
    const r = f.run();
    assert.equal(r.status, 2);
    assert.equal(existsSync(f.calls), false);
  }
  async scenario_6(t: TestContext, activity: any, cancel: any) {
    const f = workflowFixture(t, activity + '-timeout'),
      start = Date.now();
    const child = spawn(
      process.execPath,
      [
        cli,
        'run',
        'sample',
        'Improve behavior',
        '--project',
        f.repo,
        '--codex-path',
        f.executable,
        '--timeout-seconds',
        cancel ? '15' : '4',
      ],
      { env: f.env },
    );
    let out = '';
    child.stdout.on('data', (x: any) => (out += x));
    const closed = new Promise((r: any) => child.on('close', r));
    if (cancel) {
      let ready = false;
      while (Date.now() - start < 10000) {
        try {
          ready = readFileSync(f.calls, 'utf8').includes(`"stage":"${activity}"`);
        } catch {}
        if (ready) break;
        await new Promise((r: any) => setTimeout(r, 20));
      }
      assert.ok(ready);
      child.kill('SIGINT');
    }
    assert.equal(await closed, cancel ? 130 : 1);
    const v = JSON.parse(out);
    assert.equal(v.status, cancel ? 'cancelled' : 'failed');
    assert.ok(
      existsSync(join(f.state, 'runs', v.id, 'turns', String(v.turns.length), 'events.jsonl')),
    );
    assert.equal(existsSync(join(f.state, 'active.lock')), false);
  }
  runConsumesTheSameInspectedAssignmentAndSnapshottedIndependentCheck_7(t: TestContext) {
    const f = workflowFixture(t),
      file = join(f.root, 'assignment.json'),
      check = join(f.root, 'acceptance.cjs');
    writeFileSync(
      check,
      "if(require('fs').readFileSync('source.txt','utf8')!=='after')process.exit(7)",
    );
    writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        objective: 'Improve behavior',
        kind: 'change',
        expectedOutcome: 'Source after',
        acceptanceCriteria: ['External check passes'],
        hostChecks: [
          { id: 'external', command: process.execPath, args: [check], artifacts: [check] },
        ],
      }),
    );
    const args = ['sample', '--assignment', file, '--project', f.repo],
      preview = spawnSync(process.execPath, [cli, 'inspect', ...args, '--json'], {
        encoding: 'utf8',
      });
    assert.equal(preview.status, 0, preview.stderr);
    const r = spawnSync(process.execPath, [cli, 'run', ...args, '--codex-path', f.executable], {
      encoding: 'utf8',
      env: f.env,
    });
    assert.equal(r.status, 0, r.stderr);
    const v = JSON.parse(r.stdout);
    assert.equal(v.resolvedAssignment.digest, JSON.parse(preview.stdout).digest);
    assert.ok(v.commands.at(-1).args[0].startsWith(join(f.state, 'runs', v.id, 'acceptance')));
    const prompt = readFileSync(join(f.state, 'runs', v.id, 'turns/1/prompt.txt'), 'utf8');
    assert.ok(!prompt.includes(Buffer.from(readFileSync(check)).toString('base64')));
  }
  finalHostVerificationCannotHideAStagedScopeViolation_8(t: TestContext) {
    const f = workflowFixture(t);
    writeFileSync(
      join(f.repo, 'verify.cjs'),
      "const fs=require('fs'),cp=require('child_process');if(fs.existsSync('tests/regression.cjs'))require('./tests/regression.cjs');if(fs.readFileSync('source.txt','utf8')==='after'){fs.writeFileSync('outside.txt','secret');cp.execFileSync('git',['add','outside.txt']);fs.unlinkSync('outside.txt');}",
    );
    f.commit();
    const r = f.run('--max-attempts', '2');
    assert.equal(r.status, 1);
    const v = JSON.parse(r.stdout);
    assert.match(r.stderr, /Out-of-scope/);
    assert.equal(v.implementationAttempts, 1);
    assert.ok(v.stagedChanges.some((c: any) => c.path === 'outside.txt'));
  }
  async scenario_9(t: TestContext, cancel: any) {
    const f = workflowFixture(t, 'verify-timeout');
    writeFileSync(
      join(f.repo, 'verify.cjs'),
      "const fs=require('fs');if(fs.existsSync('tests/regression.cjs'))require('./tests/regression.cjs');if(fs.existsSync('tests/marker')){console.log('HOST_READY');setInterval(()=>{},1000)}",
    );
    f.commit();
    const child = spawn(
      process.execPath,
      [
        cli,
        'run',
        'sample',
        'Improve behavior',
        '--project',
        f.repo,
        '--codex-path',
        f.executable,
        '--timeout-seconds',
        cancel ? '15' : '4',
      ],
      { env: f.env },
    );
    let out = '';
    child.stdout.on('data', (x: any) => (out += x));
    const closed = new Promise((r: any) => child.on('close', r));
    if (cancel) {
      const start = Date.now();
      let ready = false;
      while (Date.now() - start < 10000) {
        try {
          const run = join(f.state, 'runs', readdirSync(join(f.state, 'runs'))[0]!);
          ready = readdirSync(run)
            .filter((p: any) => p.startsWith('command-'))
            .some((p: any) => readFileSync(join(run, p), 'utf8').includes('HOST_READY'));
        } catch {}
        if (ready) break;
        await new Promise((r: any) => setTimeout(r, 20));
      }
      assert.ok(ready);
      child.kill('SIGINT');
    }
    assert.equal(await closed, cancel ? 130 : 1);
    const v = JSON.parse(out);
    assert.equal(v.stage, 'verification');
    assert.equal(v.agent.status, 'completed');
    assert.equal(v.turns.length, 2);
  }
}
const suite = new StewardTests();

for (const [name, args, expected] of [
  ['default', [], 'gpt-6-luna'],
  ['override', ['--model', 'synthetic-model'], 'synthetic-model'],
])
  test(`SDK uses ${name} model and explicit settings`, (t: any) =>
    suite.scenario_1(t, args, expected));
test('invalid attempt limits and input fail before inference', (t: any) =>
  suite.invalidAttemptLimitsAndInputFailBeforeInference_2(t));
test('baseline failure prevents activation', (t: any) =>
  suite.baselineFailurePreventsActivation_3(t));
for (const mode of ['preflight-fail', 'wrong-thread'])
  test(`${mode} cannot continue`, (t: any) => suite.scenario_4(t, mode));
test('target Codex configuration is rejected before activation', (t: any) =>
  suite.targetCodexConfigurationIsRejectedBeforeActivation_5(t));
for (const activity of ['specification', 'implementation', 'review'])
  for (const cancel of [true, false])
    test(`${activity}: ${cancel ? 'cancellation' : 'timeout'} retains partial turn evidence`, (t: any) =>
      suite.scenario_6(t, activity, cancel));
test('run consumes the same inspected assignment and snapshotted independent check', (t: any) =>
  suite.runConsumesTheSameInspectedAssignmentAndSnapshottedIndependentCheck_7(t));
test('final host verification cannot hide a staged scope violation', (t: any) =>
  suite.finalHostVerificationCannotHideAStagedScopeViolation_8(t));
for (const cancel of [false, true])
  test(`verification ${cancel ? 'cancellation' : 'timeout'} preserves completed agent turn`, (t: any) =>
    suite.scenario_9(t, cancel));
