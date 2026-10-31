import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cli, workflowFixture } from './workflow-fixture.js';
export function handoffFixture(t: any, mode: any = 'implementation'): any {
  const f = workflowFixture(t);
  mkdirSync(join(f.repo, 'dependency-docs'));
  mkdirSync(join(f.repo, 'dependency-tests'));
  writeFileSync(join(f.repo, 'dependency.txt'), 'before');
  writeFileSync(join(f.repo, 'dependency-docs/behavior.md'), 'Before');
  writeFileSync(join(f.repo, 'dependency-tests/.keep'), '');
  const definition = { ...f.component, schemaVersion: 2, operationIds: [] };
  writeFileSync(join(f.repo, 'architecture/components/sample.json'), JSON.stringify(definition));
  writeFileSync(
    join(f.repo, 'architecture/components/dependency.json'),
    JSON.stringify({
      ...definition,
      id: 'dependency',
      path: 'dependency.txt',
      allowedWritePaths: ['dependency.txt', 'dependency-docs', 'dependency-tests'],
      documentation: ['dependency-docs'],
      tests: ['dependency-tests'],
      verification: [{ command: 'node', args: ['dependency-verify.cjs'] }],
    }),
  );
  writeFileSync(
    join(f.repo, 'dependency-verify.cjs'),
    "if(require('fs').existsSync('dependency-tests/regression.cjs'))require('./dependency-tests/regression.cjs')",
  );
  const profile = JSON.parse(
    String(readFileSync(join(f.repo, 'architecture/execution-profiles/luna.yaml'))),
  );
  Object.assign(profile, {
    schemaVersion: 2,
    maxTurns: 4,
    operationCategories: [],
    maxOperationCalls: 24,
  });
  writeFileSync(join(f.repo, 'architecture/execution-profiles/luna.yaml'), JSON.stringify(profile));
  if (mode === 'refresh') {
    writeFileSync(
      join(f.repo, 'refresh.cjs'),
      "const fs=require('fs');fs.mkdirSync('generated',{recursive:true});fs.writeFileSync('generated/value',fs.readFileSync('dependency.txt'));",
    );
    writeFileSync(
      join(f.repo, 'architecture/environment.yaml'),
      JSON.stringify({
        schemaVersion: 1,
        prerequisites: [],
        setup: [{ command: 'node', args: ['refresh.cjs'] }],
        generatedDirectories: ['generated'],
      }),
    );
  }
  f.commit();
  for (const owner of ['sample', 'dependency'])
    writeFileSync(
      join(f.root, owner + '.json'),
      JSON.stringify({
        schemaVersion: 2,
        kind: 'change',
        objective: owner + ' contract change',
        expectedOutcome: 'Verified contract',
        acceptanceCriteria: ['Implement contract'],
        hostChecks: [],
      }),
    );
  const check = join(f.root, 'acceptance.cjs');
  writeFileSync(
    check,
    "const fs=require('fs');if(fs.readFileSync('source.txt','utf8')!=='uses:after'||fs.readFileSync('dependency.txt','utf8')!=='after'||fs.existsSync('new.txt'))process.exit(9)",
  );
  const manifest = join(f.root, 'workday.json');
  writeFileSync(
    manifest,
    JSON.stringify({
      schemaVersion: 1,
      requester: {
        component: 'sample',
        assignment: 'sample.json',
        refresh: mode === 'refresh' ? [{ command: 'node', args: ['refresh.cjs'] }] : [],
      },
      recipient: {
        component: 'dependency',
        assignment: 'dependency.json',
        refresh: [],
        maxAttempts: mode === 'repair' ? 2 : 1,
      },
      dependency: {
        from: 'sample',
        to: 'dependency',
        contract: 'sample-contract',
        delivery: 'Verified dependency value',
      },
      acceptance: [
        {
          id: 'combined',
          command: process.execPath,
          args: [check],
          artifacts: [check],
        },
      ],
    }),
  );
  writeFileSync(
    f.executable,
    `#!/usr/bin/env node
import(${JSON.stringify(new URL('./controlled-workday.js', import.meta.url).href)}).then(({run}) => run(${JSON.stringify({ mode, root: f.root, calls: f.calls })}));`,
    { mode: 0o755 },
  );
  const run = () =>
    spawnSync(
      process.execPath,
      [cli, 'workday', 'run', manifest, '--project', f.repo, '--codex-path', f.executable],
      { encoding: 'utf8', env: f.env, timeout: 60000 },
    );
  return { ...f, manifest, workday: run };
}
