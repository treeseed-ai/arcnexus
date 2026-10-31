import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { operationFixture } from '../development-tooling/operations-fixture.js';
class ServicesTests {
  builtCLIProbesStartsOwnedHTTPServiceChecksItAndEndsItsLease_1(t: TestContext) {
    const f = fixture(t),
      r = f.run('--kind', 'research');
    assert.equal(r.status, 0, r.stderr);
    const v = JSON.parse(r.stdout);
    assert.ok(v.probes.length);
    assert.equal(v.services[0].status, 'stopped');
    assert.equal(v.services[0].endpointClosed, true);
    assert.ok(v.services[0].port > 0);
  }
  scenario_2(t: TestContext, mode: any) {
    const f = fixture(t, mode),
      r = f.run('--kind', 'research');
    assert.equal(r.status, 1, r.stderr);
    const v = JSON.parse(r.stdout);
    if (mode === 'probe-fail') assert.equal(v.turns.length, 0);
    else assert.notEqual(v.status, 'completed');
  }
  nonLoopbackBindIsRejectedEvenWhenAnnouncementClaimsLoopback_3(t: TestContext) {
    const f = fixture(t);
    const path = join(f.repo, 'server.mjs');
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace("process.env.ARCNEXUS_HOST??'127.0.0.1'", "'0.0.0.0'"),
    );
    f.commit();
    const r = f.run('--kind', 'research');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /loopback|Codex exec/);
    const v = JSON.parse(r.stdout);
    assert.equal(v.services[0].status, 'stopped');
  }
  probeMutationStopsBeforeAnyPlanningOrExecution_4(t: TestContext) {
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
  async scenario_5(t: TestContext, signal: any) {
    const { spawn } = await import('node:child_process'),
      { setTimeout: delay } = await import('node:timers/promises'),
      { existsSync } = await import('node:fs');
    const { cli } = await import('../development-tooling/workflow-fixture.js');
    const { endpointClosed } = await import('../../dist/operations/service-state.js');
    const f = fixture(t);
    writeFileSync(
      f.executable,
      readFileSync(f.executable, 'utf8').replace(
        "const reply=await client.callTool({name:'operations.run'",
        "await new Promise(()=>{setInterval(()=>{},1000)});const reply=await client.callTool({name:'operations.run'",
      ),
    );
    const child = spawn(
      process.execPath,
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
      { env: f.env, stdio: 'ignore' },
    );
    const finished = new Promise((resolve: any) => child.once('close', resolve));
    let record: any, dir: any;
    try {
      for (let n = 0; n < 200; n++) {
        await delay(50);
        if (!existsSync(join(f.state, 'runs'))) continue;
        const ids = readdirSync(join(f.state, 'runs'));
        if (!ids.length) continue;
        dir = join(f.state, 'runs', ids[0]!);
        try {
          record = JSON.parse(String(readFileSync(join(dir, 'report.json'))));
        } catch {
          continue;
        }
        if (record.services?.[0]?.status === 'ready') break;
      }
      assert.equal(record?.services?.[0]?.status, 'ready');
      child.kill(signal);
      await finished;
      const path = record.services[0].recordPath;
      let resource: any;
      for (let n = 0; n < 100; n++) {
        resource = JSON.parse(String(readFileSync(path)));
        if (resource.status === 'stopped') break;
        await delay(50);
      }
      assert.equal(resource.status, 'stopped');
      assert.equal(resource.endpointClosed, true);
      assert.equal(await endpointClosed(resource.port), true);
    } finally {
      child.kill('SIGKILL');
      if (dir && existsSync(join(dir, 'codex.pid'))) {
        const pid = Number(readFileSync(join(dir, 'codex.pid')));
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {}
      }
    }
  }
  async cleanupRefusesUnresolvedServiceOwnership_6(t: TestContext) {
    const { assertServicesStopped } = await import('../../dist/operations/service-state.js');
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
  async fixedPortCollisionFailsWithoutTouchingTheUnrelatedListener_7(t: TestContext) {
    const { createServer } = await import('node:http'),
      { spawn } = await import('node:child_process');
    const { cli } = await import('../development-tooling/workflow-fixture.js');
    const server = createServer((req: any, res: any) => res.end('unrelated'));
    await new Promise((resolve: any) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    const f = fixture(t),
      path = join(f.repo, 'architecture/operations/test.json'),
      op = JSON.parse(String(readFileSync(path)));
    op.service.port = (server.address() as import('node:net').AddressInfo).port;
    writeFileSync(path, JSON.stringify(op));
    f.commit();
    const child = spawn(
      process.execPath,
      [
        cli,
        'run',
        'sample',
        'Read',
        '--kind',
        'research',
        '--project',
        f.repo,
        '--codex-path',
        f.executable,
      ],
      { env: f.env },
    );
    let output = '';
    child.stdout.on('data', (d: any) => (output += d));
    child.stderr.resume();
    const code = await new Promise((resolve: any) => child.once('close', resolve));
    assert.equal(code, 1);
    assert.equal(JSON.parse(output).services[0].status, 'stopped');
    assert.equal(
      await (
        await fetch(`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`)
      ).text(),
      'unrelated',
    );
  }
  async HTTPChecksRejectExternalPathsAndNeverFollowRedirects_8() {
    const { localRequest } = await import('../../dist/operations/services.js');
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
  anUnexpectedServiceExitCannotBeReportedAsSuccessfulLeaseCompletion_9(t: TestContext) {
    const f = fixture(t);
    const path = join(f.repo, 'server.mjs');
    writeFileSync(path, readFileSync(path, 'utf8') + '\nsetTimeout(()=>process.exit(3),500);\n');
    f.commit();
    writeFileSync(
      f.executable,
      readFileSync(f.executable, 'utf8').replace(
        "await client.callTool({name:'services.status',arguments:{id:'test'}});",
        "await client.callTool({name:'services.status',arguments:{id:'test'}});await new Promise(r=>setTimeout(r,800));",
      ),
    );
    const r = f.run('--kind', 'research');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /unexpectedly/);
  }
  async inspectRefusesHTTPOperationNarrowingThatRemovesItsService_10(t: TestContext) {
    const { spawnSync } = await import('node:child_process'),
      { cli } = await import('../development-tooling/workflow-fixture.js');
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
  writeFileSync(join(f.repo, 'server.mjs'), readFileSync('fixtures/http/server.mjs'));
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
  f.commit();
  let code = readFileSync(f.executable, 'utf8');
  code = code.replace(
    'const reply=await client.callTool({name:\'operations.run\',arguments:{id:"test"}});',
    `const started=await client.callTool({name:'services.start',arguments:{id:'test'}});if(started.isError)throw new Error(JSON.stringify(started));
 const reply=await client.callTool({name:'operations.run',arguments:{id:'http-check'}});if(reply.isError)throw new Error(JSON.stringify(reply));
 await client.callTool({name:'services.logs',arguments:{id:'test'}});
 await client.callTool({name:'services.status',arguments:{id:'test'}});`,
  );
  writeFileSync(f.executable, code);
  return f;
}
test('built CLI probes, starts owned HTTP service, checks it and ends its lease', (t: any) =>
  suite.builtCLIProbesStartsOwnedHTTPServiceChecksItAndEndsItsLease_1(t));
for (const mode of ['probe-fail', 'not-ready', 'crash'])
  test(`service execution retains ${mode} evidence`, (t: any) => suite.scenario_2(t, mode));
test('non-loopback bind is rejected even when announcement claims loopback', (t: any) =>
  suite.nonLoopbackBindIsRejectedEvenWhenAnnouncementClaimsLoopback_3(t));
test('probe mutation stops before any planning or execution', (t: any) =>
  suite.probeMutationStopsBeforeAnyPlanningOrExecution_4(t));
for (const signal of ['SIGINT', 'SIGKILL'])
  test(`service stops when assignment receives ${signal}`, (t: any) => suite.scenario_5(t, signal));
test('cleanup refuses unresolved service ownership', (t: any) =>
  suite.cleanupRefusesUnresolvedServiceOwnership_6(t));
test('fixed-port collision fails without touching the unrelated listener', (t: any) =>
  suite.fixedPortCollisionFailsWithoutTouchingTheUnrelatedListener_7(t));
test('HTTP checks reject external paths and never follow redirects', () =>
  suite.HTTPChecksRejectExternalPathsAndNeverFollowRedirects_8());
test('an unexpected service exit cannot be reported as successful lease completion', (t: any) =>
  suite.anUnexpectedServiceExitCannotBeReportedAsSuccessfulLeaseCompletion_9(t));
test('inspect refuses HTTP operation narrowing that removes its service', (t: any) =>
  suite.inspectRefusesHTTPOperationNarrowingThatRemovesItsService_10(t));
