import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { loadCatalog } from '../../../../dist/library/architecture/components.js';
import { resolveAssignment } from '../../../../dist/library/architecture/assignment.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { workflowFixture } from '../../testing/support/workflow-fixture.js';

/** Guards against reconstructing the whole architecture during each project-host activation. */
class CapturedCatalogScenario {
  /** Observes Git reads to distinguish captured resolution from a full catalog inventory scan. */
  run(t: TestContext): void {
    const f = workflowFixture(t);
    const base = f.git('rev-parse', 'HEAD');
    const capturedCatalog = loadCatalog(f.repo, base);
    const log = join(f.root, 'git-reads.jsonl');
    const restore = this.instrument(f.root, log);
    try {
      const resolved = resolveAssignment(f.repo, base, 'sample', {
        objective: 'Retain captured authority',
        capturedCatalog,
      });
      assert.equal(resolved.componentId, 'sample');
      assert.equal(resolved.context.at(-1)!.purpose, capturedCatalog.components.sample!.purpose);
      const calls = readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      assert.ok(calls.length > 0);
      assert.ok(
        !calls.some((args: string[]) =>
          args.some((a) => a.endsWith('architecture/components/sample.json')),
        ),
        'Captured owner definitions must not be reread during an activation',
      );
    } finally {
      restore();
    }
  }

  /** Records actual subprocess arguments without changing Git responses or imposing an execution budget. */
  private instrument(root: string, log: string): () => void {
    const directory = join(root, 'tools');
    mkdirSync(directory);
    const program = join(directory, 'git');
    writeFileSync(
      program,
      `#!/usr/bin/node\nconst fs=require('node:fs'),cp=require('node:child_process');
fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(process.argv.slice(2))+'\\n');
const r=cp.spawnSync('/usr/bin/git',process.argv.slice(2),{stdio:'inherit'});process.exit(r.status??1);\n`,
    );
    chmodSync(program, 0o755);
    const previous = process.env.PATH;
    process.env.PATH = directory + ':' + previous;
    return () => {
      process.env.PATH = previous;
    };
  }
}

const scenario = new CapturedCatalogScenario();

test('retained catalog resolves an assignment without reconstructing owner definitions', (t) =>
  scenario.run(t));

registerSuite({ component: 'architecture', level: 'acceptance', tags: ['deterministic'] });
