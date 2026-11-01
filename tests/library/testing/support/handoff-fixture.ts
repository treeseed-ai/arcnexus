import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { workflowFixture } from './workflow-fixture.js';

export function handoffFixture(t: TestContext, mode = 'implementation'): any {
  return new HandoffFixture(t, mode).create();
}

/** Exercises handoff fixture behavior through observable scenarios. */
class HandoffFixture {
  private f: ReturnType<typeof workflowFixture>;

  private check: string;

  private manifest: string;

  /** Reuses an isolated workflow repository and locates its external handoff evidence files. */
  constructor(
    t: TestContext,
    private mode: string,
  ) {
    this.f = workflowFixture(t);
    this.check = join(this.f.root, 'acceptance.cjs');
    this.manifest = join(this.f.root, 'workday.json');
  }

  /** Assembles a committed two-owner fixture and its external workday manifest. */
  create() {
    this.setup();
    this.profile();
    this.refresh();
    this.f.commit();
    this.assignments();
    this.acceptance();
    this.definition();
    this.executable();
    return { ...this.f, manifest: this.manifest, historical: true };
  }

  /** Creates disjoint owner files and verification commands for a real contract dependency. */
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

  /** Selects planned execution stages and explicit fixture-only turn allowances. */
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

  /** Declares generated-artifact rebuilding for scenarios that switch candidate views. */
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

  /** Writes caller-owned requester and recipient assignments outside their candidate scope. */
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

  /** Writes an independent check requiring both owner changes in the combined candidate. */
  private acceptance(): void {
    writeFileSync(
      this.check,
      "const fs=require('fs');if(fs.readFileSync('source.txt','utf8')!=='uses:after'||fs.readFileSync('dependency.txt','utf8')!=='after'||fs.existsSync('new.txt'))process.exit(9)",
    );
  }

  /** Captures the permitted dependency edge, participant envelopes and combined acceptance. */
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

  /** Selects requester refresh and recipient correction settings for the scripted scenario. */
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

  /** Writes a controlled Codex launcher using the compiled handoff scenario. */
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
