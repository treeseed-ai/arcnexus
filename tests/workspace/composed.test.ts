import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { cli, workflowFixture } from '../development-tooling/workflow-fixture.js';
class ComposedTests {
  builtPrepareCreatesPinnedDependencyWorktreesAndGuardedCleanupPreservesOriginals_1(
    t: TestContext,
  ) {
    const f = composed(t),
      r = f.prepare();
    assert.equal(r.status, 0, r.stderr);
    const v = JSON.parse(r.stdout),
      member = v.members[0];
    assert.equal(member.base, f.environment.workspace.dependencies[0].commit);
    assert.equal(readFileSync(join(member.workspace, 'generated/cwd'), 'utf8'), member.workspace);
    assert.equal(f.dg('status', '--porcelain'), '');
    assert.equal(f.git('status', '--porcelain'), '');
    const report = readFileSync(join(f.state, 'runs', v.id, 'report.json'));
    assert.equal(f.cleanup(v.id).status, 0);
    assert.equal(existsSync(member.workspace), false);
    assert.equal(existsSync(v.workspace), false);
    assert.equal(f.cleanup(v.id).status, 0);
    assert.deepEqual(readFileSync(join(f.state, 'runs', v.id, 'report.json')), report);
    assert.equal(f.git('rev-parse', v.branch), v.base);
  }
  scenario_2(t: TestContext, kind: any) {
    const f = composed(t),
      r = f.prepare();
    assert.equal(r.status, 0, r.stderr);
    const v = JSON.parse(r.stdout),
      member = v.members[0];
    const p = join(
      member.workspace,
      kind === 'tracked' ? 'source.txt' : kind === 'untracked' ? 'precious' : 'unknown/precious',
    );
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, 'keep');
    assert.equal(f.cleanup(v.id).status, 1);
    assert.ok(existsSync(v.workspace));
    assert.equal(readFileSync(p, 'utf8'), 'keep');
  }
  scenario_3(t: TestContext, kind: any) {
    const f = composed(t),
      dep = f.environment.workspace.dependencies[0];
    if (kind === 'identity') dep.repository = 'https://example.invalid/wrong.git';
    if (kind === 'dirty') writeFileSync(join(f.dependency, 'source.txt'), 'dirty');
    if (kind === 'overlap')
      f.environment.workspace.dependencies.push({
        ...dep,
        id: 'other',
        path: 'packages/dependency/nested',
      });
    if (kind === 'tracked-mount') {
      mkdirSync(join(f.repo, 'packages/dependency'), { recursive: true });
      writeFileSync(join(f.repo, 'packages/dependency/owned'), 'source');
      f.git('add', '-f', 'packages');
    }
    if (kind === 'generated-overlap') f.environment.generatedDirectories = ['packages'];
    if (kind === 'missing-binding')
      writeFileSync(f.bindings, JSON.stringify({ schemaVersion: 1, repositories: {}, tools: {} }));
    f.commit();
    const r = f.prepare();
    assert.equal(r.status, 2, r.stderr);
  }
  runGrantsDependencyReadAccessAndRetainsUnchangedInventory_4(t: TestContext) {
    const f = composed(t),
      r = f.run('--bindings', f.bindings);
    assert.equal(r.status, 0, r.stderr);
    const v = JSON.parse(r.stdout);
    assert.equal(v.settings.filesystem[v.members[0].workspace], 'read');
    assert.ok(v.members[0].inventoryDigest);
  }
  failedDependencyPreparationRetainsOwnershipAndSupportsSafeCleanup_5(t: TestContext) {
    const f = composed(t);
    f.environment.workspace.dependencies[0].setup = [
      { command: 'node', args: ['-e', 'process.exit(6)'] },
    ];
    f.commit();
    const r = f.prepare();
    assert.equal(r.status, 1);
    const v = JSON.parse(r.stdout);
    assert.equal(v.members[0].status, 'created');
    assert.equal(v.commands.at(-1).exitCode, 6);
    assert.ok(existsSync(v.members[0].workspace));
    assert.equal(f.cleanup(v.id).status, 0);
  }
  cleanupRejectsAMemberPathSubstitutedOutsideTheOwnedWorkspace_6(t: TestContext) {
    const f = composed(t),
      r = f.prepare();
    assert.equal(r.status, 0, r.stderr);
    const v = JSON.parse(r.stdout);
    v.members[0].workspace = f.dependency;
    writeFileSync(join(f.state, 'runs', v.id, 'report.json'), JSON.stringify(v));
    const cleanup = f.cleanup(v.id);
    assert.equal(cleanup.status, 1);
    assert.match(cleanup.stderr, /ownership/);
    assert.equal(readFileSync(join(f.dependency, 'source.txt'), 'utf8'), 'dependency');
  }
  declaredDisposableDependencyOutputsCanBeCleanedAfterCallerUse_7(t: TestContext) {
    const f = composed(t),
      r = f.prepare();
    assert.equal(r.status, 0, r.stderr);
    const v = JSON.parse(r.stdout);
    writeFileSync(join(v.members[0].workspace, 'generated/cwd'), 'caller rebuild');
    assert.equal(f.cleanup(v.id).status, 0);
  }
  inspectCapturesResolvedDependencyRevisionsWithoutCreatingWorktrees_8(t: TestContext) {
    const f = composed(t),
      r = spawnSync(
        process.execPath,
        [
          cli,
          'inspect',
          'sample',
          'Improve behavior',
          '--project',
          f.repo,
          '--bindings',
          f.bindings,
          '--json',
        ],
        { env: f.env, encoding: 'utf8' },
      );
    assert.equal(r.status, 0, r.stderr);
    const v = JSON.parse(r.stdout);
    assert.equal(v.workspaceMembers[0].base, f.environment.workspace.dependencies[0].commit);
    assert.equal(existsSync(f.state), false);
  }
  assignmentCannotActivateAComponentOwnedByADependencyRepository_9(t: TestContext) {
    const f = composed(t);
    f.environment.workspace.primary.id = 'different-owner';
    f.commit();
    const r = f.run('--bindings', f.bindings);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /primary repository/);
  }
  dependencyChangesByAControlledExecutableFailTheHostBoundaryCheck_10(t: TestContext) {
    const f = composed(t);
    f.configure({ dependencyMutation: true });
    const r = f.run('--bindings', f.bindings);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /changed source|dependency/i);
    assert.equal(f.dg('status', '--porcelain'), '');
  }
  dependencySetupTimeoutRetainsPartialRecordsAndCanBeCleaned_11(t: TestContext) {
    const f = composed(t);
    f.environment.workspace.dependencies[0].setup = [
      { command: 'node', args: ['-e', 'setInterval(()=>{},1000)'] },
    ];
    f.commit();
    const r = spawnSync(
      process.execPath,
      [cli, 'prepare', '--project', f.repo, '--bindings', f.bindings, '--timeout-seconds', '0.5'],
      { env: f.env, encoding: 'utf8' },
    );
    assert.equal(r.status, 1);
    const v = JSON.parse(r.stdout);
    assert.equal(v.members[0].status, 'created');
    assert.ok(v.commands.at(-1).durationMs > 0);
    assert.equal(f.cleanup(v.id).status, 0);
  }
}
const suite = new ComposedTests();

function composed(t: any): any {
  const f = workflowFixture(t),
    { dependency, dg } = createDependency(f.root);
  f.git('remote', 'add', 'origin', 'https://example.invalid/primary.git');
  writeFileSync(join(f.repo, '.gitignore'), 'packages/\n');
  const environment = workspaceEnvironment(dg('rev-parse', 'HEAD'));
  const bindings = writeBindings(f.root, dependency);
  const commit = () => {
    writeFileSync(join(f.repo, 'architecture/environment.yaml'), JSON.stringify(environment));
    if (f.git('status', '--porcelain')) f.commit();
  };
  commit();
  const prepare = () =>
    spawnSync(process.execPath, [cli, 'prepare', '--project', f.repo, '--bindings', bindings], {
      env: f.env,
      encoding: 'utf8',
    });
  const cleanup = (id: any) =>
    spawnSync(process.execPath, [cli, 'cleanup', id], { env: f.env, encoding: 'utf8' });
  return { ...f, dependency, dg, environment, bindings, commit, prepare, cleanup };
}
function createDependency(root: string) {
  const dependency = join(root, 'dependency');
  mkdirSync(dependency);
  const dg = (...args: any) => {
    const r = spawnSync('git', ['-C', dependency, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  dg('init', '-b', 'main');
  dg('config', 'user.name', 'Test');
  dg('config', 'user.email', 'test@example.invalid');
  dg('remote', 'add', 'origin', 'https://example.invalid/dependency.git');
  writeFileSync(join(dependency, 'source.txt'), 'dependency');
  writeFileSync(join(dependency, '.gitignore'), 'generated/\nunknown/\n');
  dg('add', '.');
  dg('commit', '-m', 'dependency');
  return { dependency, dg };
}
function writeBindings(root: string, dependency: string): string {
  const bindings = join(root, 'bindings.json');
  writeFileSync(
    bindings,
    JSON.stringify({
      schemaVersion: 1,
      repositories: { dependency },
      tools: { node: process.execPath },
    }),
  );
  return bindings;
}
function workspaceEnvironment(commit: string): any {
  return {
    schemaVersion: 1,
    prerequisites: [],
    setup: [],
    generatedDirectories: [],
    workspace: {
      primary: { id: 'sample', repository: 'https://example.invalid/primary.git' },
      dependencies: [dependencyDefinition(commit)],
    },
  };
}
function dependencyDefinition(commit: string) {
  return {
    id: 'dependency',
    repository: 'https://example.invalid/dependency.git',
    commit,
    path: 'packages/dependency',
    prerequisites: [],
    setup: [
      {
        command: 'node',
        args: [
          '-e',
          "require('fs').mkdirSync('generated');require('fs').writeFileSync('generated/cwd',process.cwd())",
        ],
      },
    ],
    generatedDirectories: ['generated'],
  };
}
test('built prepare creates pinned dependency worktrees and guarded cleanup preserves originals', (t: any) =>
  suite.builtPrepareCreatesPinnedDependencyWorktreesAndGuardedCleanupPreservesOriginals_1(t));
for (const kind of ['tracked', 'untracked', 'ignored'])
  test(`cleanup refuses dependency ${kind} changes before removing any member`, (t: any) =>
    suite.scenario_2(t, kind));
for (const kind of [
  'identity',
  'dirty',
  'overlap',
  'tracked-mount',
  'generated-overlap',
  'missing-binding',
])
  test(`preflight rejects ${kind}`, (t: any) => suite.scenario_3(t, kind));
test('run grants dependency read access and retains unchanged inventory', (t: any) =>
  suite.runGrantsDependencyReadAccessAndRetainsUnchangedInventory_4(t));
test('failed dependency preparation retains ownership and supports safe cleanup', (t: any) =>
  suite.failedDependencyPreparationRetainsOwnershipAndSupportsSafeCleanup_5(t));
test('cleanup rejects a member path substituted outside the owned workspace', (t: any) =>
  suite.cleanupRejectsAMemberPathSubstitutedOutsideTheOwnedWorkspace_6(t));
test('declared disposable dependency outputs can be cleaned after caller use', (t: any) =>
  suite.declaredDisposableDependencyOutputsCanBeCleanedAfterCallerUse_7(t));
test('inspect captures resolved dependency revisions without creating worktrees', (t: any) =>
  suite.inspectCapturesResolvedDependencyRevisionsWithoutCreatingWorktrees_8(t));
test('assignment cannot activate a component owned by a dependency repository', (t: any) =>
  suite.assignmentCannotActivateAComponentOwnedByADependencyRepository_9(t));
test('dependency changes by a controlled executable fail the host boundary check', (t: any) =>
  suite.dependencyChangesByAControlledExecutableFailTheHostBoundaryCheck_10(t));
test('dependency setup timeout retains partial records and can be cleaned', (t: any) =>
  suite.dependencySetupTimeoutRetainsPartialRecordsAndCanBeCleaned_11(t));
