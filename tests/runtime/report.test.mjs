import {workflowFixture} from './workflow-fixture.mjs';
import {catalogFixture,componentFields,members} from './catalog-fixture.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { markdownReport } from '../../dist/report.js';

const record = { id: 'execution', status: 'failed', objective: 'Improve report', workspace: '/captured', base: 'abc', error: 'failure evidence', commands: [{}] };
const section = report => report.split('## Changed files\n\n')[1]?.split('\n\n')[0];

test('changed files are sorted independently of input and preserve captured evidence', () => {
  const changes = Object.freeze([
    Object.freeze({ path: 'z.txt', kind: '?' }),
    Object.freeze({ path: 'a.txt', kind: 'D' }),
    Object.freeze({ path: 'B.txt', kind: 'M' }),
  ]);
  const captured = Object.freeze({ ...record, changes });
  const before = JSON.stringify(captured);
  const report = markdownReport(captured);
  assert.equal(section(report), '- <code>B.txt</code> — M\n- <code>a.txt</code> — D\n- <code>z.txt</code> — ?');
  assert.equal(markdownReport({ ...record, changes: [...changes].reverse() }), report);
  assert.equal(JSON.stringify(captured), before);
  for (const field of ['# ArcNexus execution execution', 'Status: failed', 'Objective: Improve report', 'Workspace: /captured', 'Base: abc', 'Failure: failure evidence', 'Commands recorded: 1', 'See report.json, events.jsonl, changes.patch and command logs for evidence.']) assert.ok(report.includes(field), field);
});

test('absent and empty changes have an explicit empty section', () => {
  for (const captured of [record, { ...record, changes: [] }]) {
    assert.equal(section(markdownReport(captured)), 'No changed files observed.');
  }
});

test('workflow outcome and activity statuses render from captured data without mutation', () => {
  const activities = Object.freeze([
    Object.freeze({ activity: 'documentation', status: 'completed' }),
    Object.freeze({ activity: 'testing', status: 'skipped' }),
  ]);
  const captured = Object.freeze({ ...record, outcome: 'ready_for_integration', activities });
  const before = JSON.stringify(captured);
  const report = markdownReport(captured);
  assert.equal(report.split('## Outcome\n\n')[1]?.split('\n\n')[0], 'ready_for_integration', 'captured workflow outcome is rendered');
  assert.equal(report.split('## Activities\n\n')[1]?.split('\n\n')[0], '- documentation — completed\n- testing — skipped');
  assert.equal(JSON.stringify(captured), before);
});

test('historical records without workflow fields render safely', () => {
  const report = markdownReport(record);
  assert.ok(report.includes('## Outcome\n\n'));
  assert.ok(report.includes('## Activities\n\n'));
  assert.doesNotMatch(report, /undefined|null/);
});

test('captured Operations and Managed services render their recorded fields without mutation', () => {
  const operations = Object.freeze([
    Object.freeze({ id: 'compile', exitCode: 0, durationMs: 42, log: '/runs/compile.log' }),
    Object.freeze({ id: 'checks', exitCode: 3, durationMs: 81, log: '/runs/checks.log' }),
  ]);
  const services = Object.freeze([
    Object.freeze({ id: 'web', status: 'stopped', endpointClosed: true }),
    Object.freeze({ id: 'api', status: 'unresolved', endpointClosed: false }),
  ]);
  const captured = Object.freeze({ ...record, operations, services });
  const before = JSON.stringify(captured);
  const report = markdownReport(captured);
  assert.ok(report.includes('## Operations\n\n- compile — passed — 42 ms — /runs/compile.log\n- checks — failed — 81 ms — /runs/checks.log'), 'captured Operations summary is rendered');
  assert.ok(report.includes('## Managed services\n\n- web — stopped — endpointClosed: true\n- api — unresolved — endpointClosed: false'), 'captured Managed services summary is rendered');
  assert.equal(JSON.stringify(captured), before);
  assert.doesNotMatch(report, /undefined|null/);
});

test('historical missing and empty operations and service arrays use exact messages', () => {
  for (const captured of [record, { ...record, operations: [], services: [] }]) {
    const report = markdownReport(captured);
    assert.ok(report.includes('## Operations\n\nNo managed operations recorded.'));
    assert.ok(report.includes('## Managed services\n\nNo managed services recorded.'));
    assert.doesNotMatch(report, /undefined|null/);
  }
});

test('filenames remain text instead of Markdown or HTML', () => {
  const path = '[link](https://bad) `code` <img> &amp;\n# heading\r\t*em*_x|';
  const report = markdownReport({ ...record, changes: [{ path, kind: 'A' }] });
  assert.equal(section(report), '- <code>&#91;link&#93;&#40;https&#58;//bad&#41; &#96;code&#96; &#60;img&#62; &#38;amp&#59;&#10;&#35; heading&#13;&#9;&#42;em&#42;&#95;x&#124;</code> — A');
});

test('built CLI run renders observed changes from the production workflow', t => {
  const f=workflowFixture(t),result=f.run();assert.equal(result.status,0,result.stderr);
  const captured=JSON.parse(result.stdout),run=join(f.state,'runs',captured.id);
  const evidence=JSON.parse(readFileSync(join(run,'report.json'),'utf8'));
  assert.deepEqual(evidence.changes,[{kind:'M',path:'docs/behavior.md'},{kind:'M',path:'source.txt'},{path:'tests/regression.cjs',kind:'?'}]);
  assert.equal(section(readFileSync(join(run,'report.md'),'utf8')),'- <code>docs/behavior.md</code> — M\n- <code>source.txt</code> — M\n- <code>tests/regression.cjs</code> — ?');
  const markdown=readFileSync(join(run,'report.md'),'utf8');
  assert.equal(section(markdown),'- <code>docs/behavior.md</code> — M\n- <code>source.txt</code> — M\n- <code>tests/regression.cjs</code> — ?');
  assert.ok(markdown.includes('## Operations\n\nNo managed operations recorded.'));
  assert.ok(markdown.includes('## Managed services\n\nNo managed services recorded.'));
});
test('built CLI report includes coordination evidence and explicit historical absence',t=>{
 const f=workflowFixture(t),r=spawnSync(process.execPath,[resolve('dist/cli.js'),'run','sample','Improve behavior','--project',f.repo,'--codex-path',f.executable],{env:f.env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);const data=JSON.parse(r.stdout),md=readFileSync(join(f.state,'runs',data.id,'report.md'),'utf8');
 for(const heading of ['Execution accounting','Usage','Supplied context','Host checks','Boundary requests','Caller interventions','Findings and uncertainty'])assert.ok(md.includes('## '+heading),heading);
 assert.match(md,/Actual turns: 3/);assert.match(md,/not complete effective Codex context/);
 assert.match(markdownReport(record),/Usage completeness: unavailable/);
});
