import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workflowFixture } from './workflow-fixture.js';
export function operationFixture(t: any, mode: any = 'success'): any {
  const f = workflowFixture(t, mode),
    profilePath = join(f.repo, 'architecture/execution-profiles/luna.yaml');
  const profile = JSON.parse(String(readFileSync(profilePath)));
  Object.assign(profile, {
    schemaVersion: 2,
    maxTurns: 4,
    operationCategories: ['unit-test'],
    maxOperationCalls: mode === 'budget' ? 1 : 24,
  });
  writeFileSync(profilePath, JSON.stringify(profile));
  Object.assign(f.component, { schemaVersion: 2, operationIds: ['test'] });
  writeFileSync(join(f.repo, 'architecture/components/sample.json'), JSON.stringify(f.component));
  defineOperation(f);
  f.commit();
  f.configure({ planning: true, operations: join(f.root, 'operations.jsonl') });
  return f;
}
function defineOperation(f: any): void {
  mkdirSync(join(f.repo, 'architecture/operations'));
  writeFileSync(
    join(f.repo, 'architecture/operations/test.json'),
    JSON.stringify({
      schemaVersion: 2,
      id: 'test',
      purpose: 'Observe regression',
      kind: 'command',
      repository: 'sample',
      cwd: '.',
      category: 'unit-test',
      activities: ['testing', 'implementation', 'review', 'research'],
      command: process.execPath,
      args: ['verify.cjs'],
      timeoutSeconds: 120,
      generatedDirectories: [],
      artifacts: [],
      probes: [],
    }),
  );
}
