import { registerSuite } from '../../../../dist/library/testing/suite.js';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { endpointClosed } from '../../../../dist/library/operations/service-state.js';
import { operationFixture } from '../../testing/support/operations-fixture.js';
import { TestProcess, waitFor } from '../../testing/support/test-process.js';
import { cli } from '../../testing/support/workflow-fixture.js';

/** Exercises services behavior through observable scenarios. */
class ServicesTests {
  /** Verifies that built cliprobes starts owned httpservice checks it and ends its lease. */
  builtCLIProbesStartsOwnedHTTPServiceChecksItAndEndsItsLease(t: TestContext) {
    const f = fixture(t),
      r = f.run('--kind', 'research');
    assert.equal(r.status, 0, r.stderr);
    const v = JSON.parse(r.stdout);
    assert.ok(v.probes.length);
    assert.equal(v.services[0].status, 'stopped');
    assert.equal(v.services[0].endpointClosed, true);
    assert.ok(v.services[0].port > 0);
  }

  /** Verifies the scenario retains service failure evidence. */
  retainsServiceFailureEvidence(t: TestContext, mode: any) {
    const f = fixture(t, mode),
      r = f.run('--kind', 'research');
    assert.equal(r.status, 1, r.stderr);
    const v = JSON.parse(r.stdout);
    if (mode === 'probe-fail') assert.equal(v.turns.length, 0);
    else assert.notEqual(v.status, 'completed');
  }

  /** Verifies that non loopback bind is rejected even when announcement claims loopback. */
  nonLoopbackBindIsRejectedEvenWhenAnnouncementClaimsLoopback(t: TestContext) {
    const f = fixture(t);
    const path = join(f.repo, 'server.mjs');
    const before = readFileSync(path, 'utf8');
    const after = before.replace("process.env.ARCNEXUS_HOST ?? '127.0.0.1'", "'0.0.0.0'");
    assert.notEqual(after, before, 'fixture must actually bind outside loopback');
    writeFileSync(path, after);
    f.commit();
    const r = f.run('--kind', 'research');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /loopback|Codex exec/);
    const v = JSON.parse(r.stdout);
    assert.equal(v.services[0].status, 'stopped');
  }

  /** Verifies that probe mutation stops before any planning or execution. */
  probeMutationStopsBeforeAnyPlanningOrExecution(t: TestContext) {
    const f = fixture(t);
    const path = join(f.repo, 'architecture/operations/test.json'),
      op = JSON.parse(String(readFileSync(path)));
    op.probes = [
      {
        command: process.execPath,
        args: ['-e', "require('fs').writeFileSync('source.txt','changed')"],
      },
    ];
    writeFileSync(path, JSON.stringify(op));
    f.commit();
    const r = f.run('--kind', 'research');
    assert.equal(r.status, 1);
    assert.equal(JSON.parse(r.stdout).turns.length, 0);
  }

  /** Verifies the scenario stops services after interruption. */
  async stopsServicesAfterInterruption(t: TestContext, signal: NodeJS.Signals) {
    const f = fixture(t);
    f.configure({ holdService: true });
    const child = this.startResearch(t, f);
    let record: any, directory: string | undefined;
    try {
      await waitFor(() => {
        const captured = this.serviceRecord(f);
        record = captured.record;
        directory = captured.directory;
        return record.services?.[0]?.status === 'ready';
      }, 'Service must become ready');
      child.kill(signal);
      await child.closed;
      await this.assertStoppedService(record.services[0].recordPath);
    } finally {
      child.kill('SIGKILL');
      this.stopCodex(directory);
    }
  }

  /** Handles start research within this component’s captured contract. */
  private startResearch(t: TestContext, f: any): TestProcess {
    return new TestProcess(
      t,
      [
        cli,
        'run',
        'sample',
        'Inspect service',
        '--kind',
        'research',
        '--project',
        f.repo,
        '--codex-path',
        f.executable,
      ],
      f.env,
    );
  }

  /** Handles service record within this component’s captured contract. */
  private serviceRecord(f: any) {
    for (const id of readdirSync(join(f.state, 'runs'))) {
      const directory = join(f.state, 'runs', id);
      const record = JSON.parse(readFileSync(join(directory, 'report.json'), 'utf8'));
      if (record.services?.length) return { directory, record };
    }
    return { directory: undefined, record: {} };
  }

  /** Handles assert stopped service within this component’s captured contract. */
  private async assertStoppedService(path: string): Promise<void> {
    let resource: any;
    await waitFor(
      () => {
        resource = JSON.parse(readFileSync(path, 'utf8'));
        return resource.status === 'stopped';
      },
      'Service must stop',
      5000,
    );
    assert.equal(resource.endpointClosed, true);
    assert.equal(await endpointClosed(resource.port), true);
  }

  /** Handles stop codex within this component’s captured contract. */
  private stopCodex(directory?: string): void {
    if (!directory || !existsSync(join(directory, 'codex.pid'))) return;
    const pid = Number(readFileSync(join(directory, 'codex.pid'), 'utf8'));
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      /* Already stopped. */
    }
  }

  /** Verifies that cleanup refuses unresolved service ownership. */
  async cleanupRefusesUnresolvedServiceOwnership(t: TestContext) {
    const { assertServicesStopped } =
      await import('../../../../dist/library/operations/service-state.js');
    const { mkdirSync } = await import('node:fs');
    const f = fixture(t),
      dir = join(f.state, 'runs', 'sample', 'services');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'resource.json'),
      JSON.stringify({ runId: 'sample', status: 'starting' }),
    );
    assert.throws(() => assertServicesStopped(f.state, 'sample'), /unresolved/);
  }

  /** Verifies that fixed port collision fails without touching the unrelated listener. */
  async fixedPortCollisionFailsWithoutTouchingTheUnrelatedListener(t: TestContext) {
    const { createServer } = await import('node:http');
    const server = createServer((req: any, res: any) => res.end('unrelated'));
    await new Promise((resolve: any) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    const f = fixture(t),
      path = join(f.repo, 'architecture/operations/test.json'),
      op = JSON.parse(String(readFileSync(path)));
    op.service.port = (server.address() as import('node:net').AddressInfo).port;
    writeFileSync(path, JSON.stringify(op));
    f.commit();
    const child = this.startResearch(t, f);
    const code = await child.closed;
    assert.equal(code, 1);
    assert.equal(JSON.parse(child.stdout).services[0].status, 'stopped');
    assert.equal(
      await (
        await fetch(`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`)
      ).text(),
      'unrelated',
    );
  }

  /** Verifies that httpchecks reject external paths and never follow redirects. */
  async HTTPChecksRejectExternalPathsAndNeverFollowRedirects() {
    const { localRequest } = await import('../../../../dist/library/operations/services.js');
    const { createServer } = await import('node:http');
    assert.throws(
      () => localRequest(1, 'https://example.com', new AbortController().signal),
      /local/,
    );
    const server = createServer((req: any, res: any) => {
      res.writeHead(302, { location: 'https://example.com' });
      res.end();
    });
    await new Promise((resolve: any) => server.listen(0, '127.0.0.1', resolve));
    try {
      await assert.rejects(
        localRequest(
          (server.address() as import('node:net').AddressInfo).port,
          '/redirect',
          new AbortController().signal,
        ),
        /redirects/,
      );
    } finally {
      server.close();
    }
  }

  /** Verifies that an unexpected service exit cannot be reported as successful lease completion. */
  anUnexpectedServiceExitCannotBeReportedAsSuccessfulLeaseCompletion(t: TestContext) {
    const f = fixture(t);
    const path = join(f.repo, 'server.mjs');
    writeFileSync(path, readFileSync(path, 'utf8') + '\nsetTimeout(()=>process.exit(3),500);\n');
    f.commit();
    f.configure({ delayedServiceExit: true });
    const r = f.run('--kind', 'research');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /unexpectedly/);
  }

  /** Verifies that inspect refuses httpoperation narrowing that removes its service. */
  async inspectRefusesHTTPOperationNarrowingThatRemovesItsService(t: TestContext) {
    const { spawnSync } = await import('node:child_process'),
      { cli } = await import('../../testing/support/workflow-fixture.js');
    const f = fixture(t),
      path = join(f.root, 'assignment.json');
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 2,
        kind: 'research',
        objective: 'Inspect',
        expectedOutcome: 'Evidence',
        acceptanceCriteria: ['Evidence'],
        hostChecks: [],
        operationIds: ['http-check'],
      }),
    );
    const r = spawnSync(
      process.execPath,
      [cli, 'inspect', 'sample', '--assignment', path, '--project', f.repo],
      { encoding: 'utf8' },
    );
    assert.equal(r.status, 2);
    assert.match(r.stderr, /requires a declared service/);
  }
}

const suite = new ServicesTests();

function fixture(t: any, mode: any = 'success'): any {
  const f = operationFixture(t);
  writeFileSync(join(f.repo, 'server.mjs'), readFileSync('.fixture-build/http/server.mjs'));
  const path = join(f.repo, 'architecture/operations/test.json'),
    op = JSON.parse(String(readFileSync(path)));
  Object.assign(op, {
    kind: 'service',
    args: ['server.mjs'],
    service: { port: 0, readinessPath: '/health', expectedStatus: 200, startupTimeoutSeconds: 2 },
    probes: [
      {
        command: process.execPath,
        args: [
          '-e',
          "console.log(process.version);if(require('child_process').spawnSync(process.execPath,['-e','process.exit(0)']).status!==0)process.exit(1)",
        ],
      },
    ],
  });
  if (mode === 'probe-fail') op.probes[0].args = ['-e', 'process.exit(9)'];
  if (mode === 'not-ready') op.service.readinessPath = '/absent';
  if (mode === 'crash') op.args = ['-e', 'process.exit(2)'];
  writeFileSync(path, JSON.stringify(op));
  registerHttpCheck(f, op);
  f.commit();
  f.configure({ managedService: true });
  return f;
}

function registerHttpCheck(f: any, op: any): void {
  const check = {
    ...op,
    id: 'http-check',
    kind: 'http',
    http: { serviceId: 'test', path: '/health', expectedStatus: 200 },
    probes: [],
  };
  delete check.service;
  delete check.command;
  delete check.args;
  writeFileSync(join(f.repo, 'architecture/operations/http-check.json'), JSON.stringify(check));
  f.component.operationIds = ['test', 'http-check'];
  writeFileSync(join(f.repo, 'architecture/components/sample.json'), JSON.stringify(f.component));
}

test('built CLI probes, starts owned HTTP service, checks it and ends its lease', (t: any) =>
  suite.builtCLIProbesStartsOwnedHTTPServiceChecksItAndEndsItsLease(t));

for (const mode of ['probe-fail', 'not-ready', 'crash'])
  test(`service execution retains ${mode} evidence`, (t: any) =>
    suite.retainsServiceFailureEvidence(t, mode));

test('non-loopback bind is rejected even when announcement claims loopback', (t: any) =>
  suite.nonLoopbackBindIsRejectedEvenWhenAnnouncementClaimsLoopback(t));

test('probe mutation stops before any planning or execution', (t: any) =>
  suite.probeMutationStopsBeforeAnyPlanningOrExecution(t));

for (const signal of ['SIGINT', 'SIGKILL'] as const)
  test(`service stops when assignment receives ${signal}`, (t: any) =>
    suite.stopsServicesAfterInterruption(t, signal));

test('cleanup refuses unresolved service ownership', (t: any) =>
  suite.cleanupRefusesUnresolvedServiceOwnership(t));

test('fixed-port collision fails without touching the unrelated listener', (t: any) =>
  suite.fixedPortCollisionFailsWithoutTouchingTheUnrelatedListener(t));

test('HTTP checks reject external paths and never follow redirects', () =>
  suite.HTTPChecksRejectExternalPathsAndNeverFollowRedirects());

test('an unexpected service exit cannot be reported as successful lease completion', (t: any) =>
  suite.anUnexpectedServiceExitCannotBeReportedAsSuccessfulLeaseCompletion(t));

test('inspect refuses HTTP operation narrowing that removes its service', (t: any) =>
  suite.inspectRefusesHTTPOperationNarrowingThatRemovesItsService(t));

registerSuite({ component: 'operations', level: 'acceptance', tags: ['deterministic'] });
