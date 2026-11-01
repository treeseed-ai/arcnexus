import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { TestContext } from 'node:test';
import { workflowFixture, type WorkflowFixture } from '../../testing/support/workflow-fixture.js';

/** Captures a three-owner package and local executable binding for option-free CLI scenarios. */
export class GeneralFixture {
  readonly fixture: WorkflowFixture;

  hostPid?: number;

  /** Builds a committed catalog and registers host cleanup before the fixture directory disappears. */
  constructor(t: TestContext) {
    this.fixture = workflowFixture(t);
    const f = this.fixture;
    this.catalog();
    const module = pathToFileURL(
      resolve('.test-build/library/execution-runtime/support/controlled-general.js'),
    ).href;
    writeFileSync(
      f.executable,
      `#!/usr/bin/env node\nimport(${JSON.stringify(module)}).then(({ControlledGeneral}) => new ControlledGeneral(${JSON.stringify(f.calls)}).run());\n`,
      { mode: 0o755 },
    );
    mkdirSync(join(f.repo, '.git/arcnexus'), { recursive: true });
    writeFileSync(
      join(f.repo, '.git/arcnexus/bindings.yaml'),
      JSON.stringify({ schemaVersion: 1, tools: { codex: f.executable }, repositories: {} }),
    );
    f.commit();
    t.after(() => this.stopHost());
  }

  /** Defines package membership and unlimited worker/director profiles without live API calls. */
  private catalog(): void {
    const f = this.fixture;
    const component = {
      ...f.component,
      parentId: 'package',
      verification: [{ command: 'node', args: ['verify.cjs'] }],
    };
    for (const id of ['a', 'b', 'c'])
      writeFileSync(
        join(f.repo, `architecture/components/${id}.json`),
        JSON.stringify({ ...component, id }),
      );
    this.package();
    this.profiles();
  }

  /** Declares the containing package and its eligible stewardship members. */
  private package(): void {
    const f = this.fixture;
    writeFileSync(
      join(f.repo, 'architecture/components/package.json'),
      JSON.stringify({
        ...f.component,
        id: 'package',
        type: 'package',
        path: '.',
        allowedWritePaths: ['.'],
        members: {
          foundations: [],
          dependencies: [],
          gateways: [],
          libraries: ['a', 'b', 'c'],
          releases: [],
        },
      }),
    );
  }

  /** Selects no-budget profiles for deterministic engineering and independent review. */
  private profiles(): void {
    const f = this.fixture;
    writeFileSync(
      join(f.repo, 'architecture/execution.yaml'),
      'directorProfile: luna\nreviewerProfile: luna\ndefaultPackage: package\n',
    );
    writeFileSync(
      join(f.repo, 'architecture/execution-profiles/luna.yaml'),
      JSON.stringify({
        schemaVersion: 3,
        id: 'luna',
        model: 'gpt-6-luna',
        reasoning: 'medium',
        webSearch: 'disabled',
        operationCategories: [],
      }),
    );
  }

  /** Retains the host PID in memory so cleanup survives removal of fixture files. */
  captureHost(): void {
    const root = join(this.fixture.state, 'projects');
    const project = readdirSync(root)[0]!;
    this.hostPid = JSON.parse(readFileSync(join(root, project, 'host.json'), 'utf8')).pid;
  }

  /** Stops the detached test host so no managed process survives its disposable repository. */
  private stopHost(): void {
    if (!this.hostPid) return;
    try {
      process.kill(this.hostPid, 'SIGTERM');
    } catch {
      /* Already stopped. */
    }
  }
}
