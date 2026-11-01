import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { cli, workflowFixture } from './workflow-fixture.js';

export function handoffFixture(t: TestContext, mode = 'implementation'): any {
  return new HandoffFixture(t, mode).create();
}

/** Exercises handoff fixture behavior through observable scenarios. */
class HandoffFixture {
  private f: ReturnType<typeof workflowFixture>;

  private check: string;

  private manifest: string;

  /** Captures the dependencies and state used throughout this instance’s lifecycle. */
  constructor(
    t: TestContext,
    private mode: string,
  ) {
    this.f = workflowFixture(t);
    this.check = join(this.f.root, 'acceptance.cjs');
    this.manifest = join(this.f.root, 'workday.json');
  }

  /** Handles create within this component’s captured contract. */
  create() {
    this.setup();
    this.profile();
    this.refresh();
    this.f.commit();
    this.assignments();
    this.acceptance();
    this.definition();
    this.executable();
    return { ...this.f, manifest: this.manifest, workday: () => this.run() };
  }

  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  private run() {
    const f = this.f;
    return spawnSync(
      process.execPath,
      [cli, 'workday', 'run', this.manifest, '--project', f.repo, '--codex-path', f.executable],
      { encoding: 'utf8', env: f.env, timeout: 30 * 60 * 1000 },
    );
  }

  /** Handles setup within this component’s captured contract. */
  private setup(): void {
    const f = this.f;
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
  }

  /** Handles profile within this component’s captured contract. */
  private profile(): void {
    const f = this.f;
    const profile = JSON.parse(
      String(readFileSync(join(f.repo, 'architecture/execution-profiles/luna.yaml'))),
    );
    Object.assign(profile, {
      schemaVersion: 2,
      maxTurns: 4,
      operationCategories: [],
      maxOperationCalls: 24,
    });
    writeFileSync(
      join(f.repo, 'architecture/execution-profiles/luna.yaml'),
      JSON.stringify(profile),
    );
  }

  /** Handles refresh within this component’s captured contract. */
  private refresh(): void {
    const f = this.f,
      mode = this.mode;
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
  }

  /** Handles assignments within this component’s captured contract. */
  private assignments(): void {
    const f = this.f;
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
  }

  /** Handles acceptance within this component’s captured contract. */
  private acceptance(): void {
    writeFileSync(
      this.check,
      "const fs=require('fs');if(fs.readFileSync('source.txt','utf8')!=='uses:after'||fs.readFileSync('dependency.txt','utf8')!=='after'||fs.existsSync('new.txt'))process.exit(9)",
    );
  }

  /** Handles definition within this component’s captured contract. */
  private definition(): void {
    writeFileSync(
      this.manifest,
      JSON.stringify({
        schemaVersion: 1,
        ...this.participants(),
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
            args: [this.check],
            artifacts: [this.check],
          },
        ],
      }),
    );
  }

  /** Handles participants within this component’s captured contract. */
  private participants() {
    const mode = this.mode;
    return {
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
    };
  }

  /** Handles executable within this component’s captured contract. */
  private executable(): void {
    const f = this.f,
      mode = this.mode;
    writeFileSync(
      f.executable,
      `#!/usr/bin/env node
import(${JSON.stringify(new URL('./controlled-workday.js', import.meta.url).href)}).then(({run}) => run(${JSON.stringify({ mode, root: f.root, calls: f.calls })}));`,
      { mode: 0o755 },
    );
  }
}
