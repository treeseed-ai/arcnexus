import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
class GuidanceTests {
  guidanceAcceptsTrackedMetadataAndInventoriesAGENTSWithoutSemanticApproval_1(t: TestContext) {
    const f = fixture(t);
    f.skill(valid.replace('description:', 'metadata:\n  owner: test\ndescription:'));
    f.write('AGENTS.md', 'Conflicting instructions are not deterministically evaluated.');
    const r = f.run('--json');
    assert.equal(r.status, 0, r.stderr);
    const data = JSON.parse(r.stdout);
    assert.equal(data.skills.length, 1);
    assert.deepEqual(data.agents, [{ path: 'AGENTS.md', readable: true }]);
    assert.equal(data.status, 'valid');
    assert.deepEqual(data.diagnostics, []);
  }
  guidanceRejectsMetadataWithFileDiagnostics_2(t: TestContext) {
    const f = fixture(t);
    for (const content of [
      '# No header',
      '---\nname: [broken\n---',
      '---\n- sequence\n---',
      valid.replace('example', 'other'),
      valid.replace('Useful guidance', 'false'),
      valid.replace('Useful guidance', '""'),
      '---\nname: example\ndescription: Missing closing delimiter',
    ]) {
      f.skill(content);
      const r = f.run('--json');
      assert.equal(r.status, 1, r.stderr);
      const data = JSON.parse(r.stdout);
      assert.equal(data.diagnostics[0].path, '.agents/skills/example/SKILL.md');
      assert.ok(data.diagnostics[0].code);
      assert.doesNotMatch(r.stderr, /Traceback/);
    }
  }
  GUIDANCEREFERENCESREQUIRED_3(t: TestContext) {
    const f = fixture(t);
    f.skill(
      valid.replace('description: Useful guidance', 'description: Useful guidance\nreferences: []'),
    );
    const r = f.run();
    assert.equal(r.status, 1, r.stderr);
  }
  guidanceValidatesOptionalReferencesAsTrackedRegularRepositoryFiles_4(t: TestContext) {
    const f = fixture(t);
    f.write('refs/guide.md', 'guide');
    f.write('refs/data.bin', Buffer.from([0, 255, 1]));
    f.skill(
      valid.replace(
        'description: Useful guidance',
        'description: Useful guidance\nreferences:\n  - refs/guide.md\n  - refs/data.bin',
      ),
    );
    assert.equal(f.run().status, 0);
    for (const refs of [
      '- /etc/passwd',
      '- ""',
      '- 3',
      '- ../outside',
      '- missing.md',
      '- .agents/skills',
      '- refs/guide.md\n  - refs/guide.md',
    ]) {
      f.skill(
        valid.replace(
          'description: Useful guidance',
          `description: Useful guidance\nreferences:\n  ${refs.replace(/\n/g, '\n  ')}`,
        ),
      );
      assert.equal(f.run().status, 1, refs);
    }
  }
  guidanceRejectsReferencesTraversingATrackedSymlinkParent_5(t: TestContext) {
    const f = fixture(t);
    f.write('real/nested/guide.md', 'guide');
    f.git('add', 'real/nested/guide.md');
    rmSync(join(f.repo, 'real'), { recursive: true });
    symlinkSync('target', join(f.repo, 'real'));
    f.skill(
      valid.replace(
        'description: Useful guidance',
        'description: Useful guidance\nreferences:\n  - real/nested/guide.md',
      ),
    );
    assert.equal(f.run().status, 1);
  }
  untrackedSkillsDoNotSatisfyTrackedInventory_6(t: TestContext) {
    const f = fixture(t);
    f.skill(valid, false);
    const r = f.run();
    assert.equal(r.status, 1);
    assert.match(r.stderr, /No tracked skills/);
  }
  untrackedInvalidSkillDoesNotInvalidateTrackedSkills_7(t: TestContext) {
    const f = fixture(t);
    f.skill();
    f.write('.agents/skills/local/SKILL.md', 'invalid', false);
    assert.equal(f.run().status, 0);
  }
  changedLineWhitespaceRemainsASeparateExecutableGitGate_8(t: TestContext) {
    const f = fixture(t);
    f.skill();
    f.git('commit', '-qm', 'baseline');
    const base = f.git('rev-parse', 'HEAD');
    f.skill(valid + 'Trailing space \n');
    f.git('commit', '-qm', 'whitespace');
    const r = spawnSync('git', ['-C', f.repo, 'diff', '--check', base, 'HEAD'], {
      encoding: 'utf8',
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, /trailing whitespace/);
  }
  guidanceRejectsNonGitProjectsAndInvalidInvocationWithExit2_9(t: TestContext) {
    const f = fixture(t);
    rmSync(join(f.repo, '.git'), { recursive: true });
    assert.equal(f.run().status, 2);
    assert.equal(
      spawnSync(process.execPath, [cli, 'guidance', 'validate'], { encoding: 'utf8' }).status,
      2,
    );
  }
  guidanceReadsWorkingBytesAndReportsDeletedAGENTSAsUnreadable_10(t: TestContext) {
    const f = fixture(t);
    f.skill();
    f.write('nested/AGENTS.md', 'Readable');
    f.write('.agents/skills/example/SKILL.md', 'invalid', false);
    rmSync(join(f.repo, 'nested/AGENTS.md'));
    const r = f.run('--json');
    assert.equal(r.status, 1);
    const data = JSON.parse(r.stdout);
    assert.deepEqual(data.agents, [{ path: 'nested/AGENTS.md', readable: false }]);
    assert.equal(data.diagnostics.length, 2);
  }
}
const suite = new GuidanceTests();

const cli = resolve('dist/cli.js'),
  valid = '---\nname: example\ndescription: Useful guidance\n---\n# Example\n';
function fixture(t: any): any {
  const repo = mkdtempSync(join(tmpdir(), 'arcnexus-guidance-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args: any) => {
    const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  git('init', '-q');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');
  const write = (path: any, text: any, track: any = true) => {
    mkdirSync(join(repo, path, '..'), { recursive: true });
    writeFileSync(join(repo, path), text);
    if (track) git('add', path);
  };
  const skill = (text: any = valid, track: any = true) =>
    write('.agents/skills/example/SKILL.md', text, track);
  const run = (...args: any) =>
    spawnSync(process.execPath, [cli, 'guidance', 'validate', '--project', repo, ...args], {
      encoding: 'utf8',
    });
  return { repo, git, write, skill, run };
}
test('guidance accepts tracked metadata and inventories AGENTS without semantic approval', (t: any) =>
  suite.guidanceAcceptsTrackedMetadataAndInventoriesAGENTSWithoutSemanticApproval_1(t));
test('guidance rejects metadata with file diagnostics', (t: any) =>
  suite.guidanceRejectsMetadataWithFileDiagnostics_2(t));
test('GUIDANCE_REFERENCES_REQUIRED', (t: any) => suite.GUIDANCEREFERENCESREQUIRED_3(t));
test('guidance validates optional references as tracked regular repository files', (t: any) =>
  suite.guidanceValidatesOptionalReferencesAsTrackedRegularRepositoryFiles_4(t));
test('guidance rejects references traversing a tracked symlink parent', (t: any) =>
  suite.guidanceRejectsReferencesTraversingATrackedSymlinkParent_5(t));
test('untracked skills do not satisfy tracked inventory', (t: any) =>
  suite.untrackedSkillsDoNotSatisfyTrackedInventory_6(t));
test('untracked invalid skill does not invalidate tracked skills', (t: any) =>
  suite.untrackedInvalidSkillDoesNotInvalidateTrackedSkills_7(t));
test('changed-line whitespace remains a separate executable Git gate', (t: any) =>
  suite.changedLineWhitespaceRemainsASeparateExecutableGitGate_8(t));
test('guidance rejects non-Git projects and invalid invocation with exit 2', (t: any) =>
  suite.guidanceRejectsNonGitProjectsAndInvalidInvocationWithExit2_9(t));
test('guidance reads working bytes and reports deleted AGENTS as unreadable', (t: any) =>
  suite.guidanceReadsWorkingBytesAndReportsDeletedAGENTSAsUnreadable_10(t));
