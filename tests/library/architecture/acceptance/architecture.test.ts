import { fixture } from '../support/architecture-fixture.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { stringify } from 'yaml';

/** Exercises architecture behavior through observable scenarios. */
class ArchitectureTests {
  /** Verifies that built clireads yamlat acaptured revision and snapshots source hashes. */
  builtCLIReadsYAMLAtACapturedRevisionAndSnapshotsSourceHashes(t: TestContext) {
    const f = fixture(t);
    for (const path of ['components/sample', 'environment']) {
      const source = join(f.repo, 'architecture', path + '.json');
      const value = JSON.parse(String(readFileSync(source, 'utf8')));
      renameSync(source, source.replace('.json', '.yaml'));
      writeFileSync(source.replace('.json', '.yaml'), stringify(value));
    }
    f.commit();
    const r = f.run('inspect', 'sample', 'Improve behavior', '--json');
    assert.equal(r.status, 0, r.stderr);
    const snapshots = JSON.parse(r.stdout).configurationSources;
    const source = snapshots.find((s: any) => s.path === 'architecture/components/sample.yaml');
    assert.match(source.sourceHash, /^[a-f0-9]{64}$/);
    assert.match(source.normalizedHash, /^[a-f0-9]{64}$/);
    assert.match(source.text, /id: sample/);
    assert.equal(f.run('validate').status, 0);
  }

  /** Verifies that built clirejects ambiguous jsonand yamlidentities. */
  builtCLIRejectsAmbiguousJSONAndYAMLIdentities(t: TestContext) {
    const f = fixture(t);
    writeFileSync(join(f.repo, 'architecture/components/sample.yaml'), stringify(f.component));
    f.commit();
    const r = f.run('validate');
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /Duplicate|Ambiguous/);
  }

  /** Verifies that built validate enforces declared maintained file ownership. */
  builtValidateEnforcesDeclaredMaintainedFileOwnership(t: TestContext) {
    const f = fixture(t);
    f.put('architecture/ownership.json', {
      schemaVersion: 1,
      maintainedPaths: ['source.txt'],
      owners: [
        {
          component: 'sample',
          paths: ['other.txt'],
          publicModules: [],
          directoryExceptions: ['.'],
        },
      ],
    });
    f.commit();
    const r = f.run('validate');
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /source.txt.*owner|owner.*source.txt/);
  }

  /** Verifies that built validate rejects overlapping ownership even without changed files. */
  builtValidateRejectsOverlappingOwnershipEvenWithoutChangedFiles(t: TestContext) {
    const f = fixture(t);
    f.put('architecture/components/other.json', {
      ...f.component,
      id: 'other',
      allowedWritePaths: ['source.txt'],
    });
    f.put('architecture/ownership.json', {
      schemaVersion: 1,
      maintainedPaths: ['source.txt'],
      owners: ['sample', 'other'].map((component: any) => ({
        component,
        paths: ['source.txt'],
        publicModules: [],
        directoryExceptions: ['.'],
      })),
    });
    f.commit();
    const r = f.run('validate');
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /owner/);
  }

  /** Verifies that built validate rejects asandbox directory outside declared ownership. */
  builtValidateRejectsASandboxDirectoryOutsideDeclaredOwnership(t: TestContext) {
    const f = fixture(t);
    f.put('architecture/ownership.json', {
      schemaVersion: 1,
      maintainedPaths: ['source.txt'],
      owners: [
        { component: 'sample', paths: ['source.txt'], publicModules: [], directoryExceptions: [] },
      ],
    });
    f.commit();
    const r = f.run('validate');
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /Write directory outside ownership/);
  }

  /** Verifies that built inspect preserves normalized equivalence and original source bytes. */
  builtInspectPreservesNormalizedEquivalenceAndOriginalSourceBytes(t: TestContext) {
    const f = fixture(t),
      file = join(f.repo, 'architecture/components/sample.json');
    const before = JSON.parse(f.run('inspect', 'sample', 'Check hashes', '--json').stdout);
    rmSync(file);
    writeFileSync(
      file.replace('.json', '.yaml'),
      '# readable definition\n' + stringify(f.component),
    );
    f.commit();
    const after = JSON.parse(f.run('inspect', 'sample', 'Check hashes', '--json').stdout);
    const first = before.configurationSources.find((s: any) => s.path.endsWith('/sample.json'));
    const second = after.configurationSources.find((s: any) => s.path.endsWith('/sample.yaml'));
    assert.equal(first.normalizedHash, second.normalizedHash);
    assert.notEqual(first.sourceHash, second.sourceHash);
    assert.match(second.text, /^# readable definition/);
  }

  /** Verifies that built inspect captures yamlbindings before normalizing executable locations. */
  builtInspectCapturesYAMLBindingsBeforeNormalizingExecutableLocations(t: TestContext) {
    const f = fixture(t),
      file = join(f.root, 'bindings.yaml');
    const text = stringify({
      schemaVersion: 1,
      repositories: {},
      tools: { node: process.execPath },
    });
    writeFileSync(file, text);
    const r = f.run('inspect', 'sample', 'Capture tool bindings', '--bindings', file, '--json');
    assert.equal(r.status, 0, r.stderr);
    const source = JSON.parse(r.stdout).configurationSources.find((s: any) => s.path === file);
    assert.equal(source.text, text);
    assert.equal(source.value.tools.node, process.execPath);
    assert.match(source.sourceHash, /^[a-f0-9]{64}$/);
  }

  /** Verifies the scenario rejects private cross owner imports. */
  rejectsPrivateCrossOwnerImports(t: TestContext, dynamic: any) {
    const f = fixture(t);
    f.component.allowedWritePaths = ['src/sample'];
    f.put('architecture/components/sample.json', f.component);
    f.put('architecture/components/other.json', {
      ...f.component,
      id: 'other',
      allowedWritePaths: ['src/other'],
    });
    f.source(
      'src/sample/main.ts',
      dynamic ? "await import('../other/private.js');" : "import '../other/private.js';",
    );
    f.source('src/other/private.ts', 'export const value=1;');
    f.put('architecture/ownership.json', {
      schemaVersion: 1,
      maintainedPaths: ['src'],
      owners: ['sample', 'other'].map((component: any) => ({
        component,
        paths: ['src/' + component],
        publicModules: [],
        directoryExceptions: ['.'],
      })),
    });
    f.commit();
    const r = f.run('validate');
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /Private cross-owner import/);
  }

  /** Verifies that built validate rejects aruntime module cycle. */
  builtValidateRejectsARuntimeModuleCycle(t: TestContext) {
    const f = fixture(t);
    f.component.allowedWritePaths = ['src'];
    f.put('architecture/components/sample.json', f.component);
    mkdirSync(join(f.repo, 'src'));
    writeFileSync(join(f.repo, 'src/a.ts'), "import './b.js';");
    writeFileSync(join(f.repo, 'src/b.ts'), "import './a.js';");
    f.put('architecture/ownership.json', {
      schemaVersion: 1,
      maintainedPaths: ['src'],
      owners: [
        { component: 'sample', paths: ['src'], publicModules: [], directoryExceptions: ['.'] },
      ],
    });
    f.commit();
    const r = f.run('validate');
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /Runtime import cycle/);
  }

  /** Verifies the scenario rejects restricted yaml. */
  rejectsRestrictedYaml(t: TestContext, text: any) {
    const f = fixture(t);
    rmSync(join(f.repo, 'architecture/components/sample.json'));
    writeFileSync(join(f.repo, 'architecture/components/sample.yaml'), text);
    f.commit();
    const r = f.run('validate');
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /sample.yaml/);
  }

  /** Verifies that built inspect resolves immutable hierarchy without state or inference. */
  builtInspectResolvesImmutableHierarchyWithoutStateOrInference(t: TestContext) {
    const f = fixture(t),
      r = f.run('inspect', 'sample', 'Improve behavior', '--json');
    assert.equal(r.status, 0, r.stderr);
    const v = JSON.parse(r.stdout);
    assert.deepEqual(
      v.context.map((c: any) => c.id),
      ['platform', 'package', 'sample'],
    );
    assert.equal(v.executionProfile.model, 'gpt-6-luna');
    assert.match(v.digest, /^[a-f0-9]{64}$/);
    assert.equal(existsSync(join(f.root, 'state')), false);
    assert.equal(f.run('validate').status, 0);
  }

  /** Verifies the scenario rejects invalid catalog references. */
  rejectsInvalidCatalogReferences(t: TestContext, mutate: any) {
    const f = fixture(t);
    mutate(f.component);
    f.put('architecture/components/sample.json', f.component);
    f.commit();
    const r = f.run('validate');
    assert.equal(r.status, 2, r.stderr);
  }

  /** Verifies that assignment narrows but cannot widen scope and has astable digest. */
  assignmentNarrowsButCannotWidenScopeAndHasAStableDigest(t: TestContext) {
    const f = fixture(t),
      file = join(f.root, 'assignment.json');
    const assignment = {
      schemaVersion: 1,
      objective: 'Improve behavior',
      kind: 'change',
      expectedOutcome: 'Verified behavior',
      acceptanceCriteria: ['Keep public interface'],
      allowedWritePaths: ['source.txt'],
      hostChecks: [],
    };
    writeFileSync(file, JSON.stringify(assignment));
    const r = f.run('inspect', 'sample', '--assignment', file, '--json');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(
      JSON.parse(r.stdout).digest,
      JSON.parse(f.run('inspect', 'sample', '--assignment', file, '--json').stdout).digest,
    );
    assignment.allowedWritePaths = ['outside.txt'];
    writeFileSync(file, JSON.stringify(assignment));
    assert.equal(f.run('inspect', 'sample', '--assignment', file).status, 2);
  }

  /** Verifies that unused invalid definition is rejected and dirty working definitions cannot change inspection. */
  unusedInvalidDefinitionIsRejectedAndDirtyWorkingDefinitionsCannotChangeInspection(
    t: TestContext,
  ) {
    const f = fixture(t);
    f.component.purpose = 'Uncommitted purpose';
    f.put('architecture/components/sample.json', f.component);
    const r = f.run('inspect', 'sample', 'Improve behavior', '--json');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).context.at(-1).purpose, 'Own sample behavior');
    f.put('architecture/components/unused.json', {
      ...f.component,
      id: 'unused',
      parentId: 'missing',
    });
    f.commit();
    assert.equal(f.run('validate').status, 2);
  }

  /** Verifies that related context does not widen authority and ancestor narrowing fails. */
  relatedContextDoesNotWidenAuthorityAndAncestorNarrowingFails(t: TestContext) {
    const f = fixture(t);
    f.put('architecture/components/related.json', {
      ...f.component,
      id: 'related',
      allowedWritePaths: ['other.txt'],
    });
    f.component.relatedIds = ['related'];
    f.put('architecture/components/sample.json', f.component);
    f.commit();
    const r = f.run('inspect', 'sample', 'Improve behavior', '--json');
    assert.equal(r.status, 0, r.stderr);
    const result = JSON.parse(r.stdout);
    assert.deepEqual(result.allowedWritePaths, ['source.txt']);
    assert.equal(result.related[0].id, 'related');
    f.put('architecture/components/platform.json', {
      ...f.component,
      id: 'platform',
      type: 'platform',
      parentId: undefined,
      allowedWritePaths: ['docs'],
      relatedIds: [],
    });
    f.commit();
    assert.equal(f.run('validate').status, 2);
  }

  /** Verifies that captures acceptance modules. */
  async capturesAcceptanceModules(t: TestContext) {
    const f = fixture(t),
      check = join(f.root, 'check.mjs'),
      helper = join(f.root, 'helper.mjs'),
      file = join(f.root, 'assignment.json');
    writeFileSync(check, "import {value} from './helper.mjs';if(value!==7)process.exit(2)");
    writeFileSync(helper, 'export const value=7;');
    writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        objective: 'Improve behavior',
        kind: 'change',
        expectedOutcome: 'Checked',
        acceptanceCriteria: ['External check'],
        hostChecks: [
          { id: 'check', command: process.execPath, args: [check], artifacts: [check, helper] },
        ],
      }),
    );
    const r = f.run('inspect', 'sample', '--assignment', file, '--json');
    assert.equal(r.status, 0, r.stderr);
    const { materializeChecks } =
      await import('../../../../dist/library/architecture/assignment.js');
    const [command] = materializeChecks(JSON.parse(r.stdout), join(f.root, 'captured'));
    assert.ok(command);
    writeFileSync(helper, 'throw new Error("mutable external input");');
    const result = spawnSync(command.command, command.args, { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
}

const suite = new ArchitectureTests();

test('built CLI reads YAML at a captured revision and snapshots source hashes', (t: any) =>
  suite.builtCLIReadsYAMLAtACapturedRevisionAndSnapshotsSourceHashes(t));

test('built CLI rejects ambiguous JSON and YAML identities', (t: any) =>
  suite.builtCLIRejectsAmbiguousJSONAndYAMLIdentities(t));

test('built validate enforces declared maintained-file ownership', (t: any) =>
  suite.builtValidateEnforcesDeclaredMaintainedFileOwnership(t));

test('built validate rejects overlapping ownership even without changed files', (t: any) =>
  suite.builtValidateRejectsOverlappingOwnershipEvenWithoutChangedFiles(t));

test('built validate rejects a sandbox directory outside declared ownership', (t: any) =>
  suite.builtValidateRejectsASandboxDirectoryOutsideDeclaredOwnership(t));

test('built inspect preserves normalized equivalence and original source bytes', (t: any) =>
  suite.builtInspectPreservesNormalizedEquivalenceAndOriginalSourceBytes(t));

test('built inspect captures YAML bindings before normalizing executable locations', (t: any) =>
  suite.builtInspectCapturesYAMLBindingsBeforeNormalizingExecutableLocations(t));

for (const dynamic of [false, true])
  test(
    'built validate rejects private cross-owner ' + (dynamic ? 'dynamic' : 'static') + ' imports',
    (t: any) => suite.rejectsPrivateCrossOwnerImports(t, dynamic),
  );

test('built validate rejects a runtime module cycle', (t: any) =>
  suite.builtValidateRejectsARuntimeModuleCycle(t));

for (const text of [
  'id: sample\nid: other\n',
  'id: &identity sample\npurpose: *identity\n',
  'id: !custom sample\n',
  'id: sample\n---\nid: other\n',
  '? [a, b]\n: value\n',
  '<<: {id: sample}\n',
])
  test('built CLI rejects restricted YAML: ' + text, (t: any) =>
    suite.rejectsRestrictedYaml(t, text),
  );

test('built inspect resolves immutable hierarchy without state or inference', (t: any) =>
  suite.builtInspectResolvesImmutableHierarchyWithoutStateOrInference(t));

for (const [name, mutate] of [
  ['version', (c: any) => (c.schemaVersion = 99)],
  ['unknown field', (c: any) => (c.surprise = true)],
  ['missing parent', (c: any) => (c.parentId = 'missing')],
  ['cycle', (c: any) => (c.parentId = 'sample')],
  ['escaping path', (c: any) => (c.path = '../escape')],
  ['uncovered write', (c: any) => (c.access.writeDirectories = ['docs'])],
  ['ownership', (c: any) => (c.repository = 'other')],
])
  test(`catalog rejects ${name}`, (t: any) => suite.rejectsInvalidCatalogReferences(t, mutate));

test('assignment narrows but cannot widen scope and has a stable digest', (t: any) =>
  suite.assignmentNarrowsButCannotWidenScopeAndHasAStableDigest(t));

test('unused invalid definition is rejected and dirty working definitions cannot change inspection', (t: any) =>
  suite.unusedInvalidDefinitionIsRejectedAndDirtyWorkingDefinitionsCannotChangeInspection(t));

test('related context does not widen authority and ancestor narrowing fails', (t: any) =>
  suite.relatedContextDoesNotWidenAuthorityAndAncestorNarrowingFails(t));

test('host acceptance snapshots preserve module extensions and declared relative imports', (t: any) =>
  suite.capturesAcceptanceModules(t));

registerSuite({ component: 'architecture', level: 'acceptance', tags: ['deterministic'] });
