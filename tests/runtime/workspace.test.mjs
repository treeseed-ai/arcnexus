import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, lstatSync, symlinkSync, readlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
const cli = resolve('dist/cli.js');
function fixture(t, setup = []) {
  const root = mkdtempSync(join(tmpdir(), 'arcnexus-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repo'), state = join(root, 'state');
  mkdirSync(join(repo, 'architecture'), { recursive: true });
  const git = (...args) => { const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  git('init', '-b', 'main'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test');
  writeFileSync(join(repo, '.gitignore'), 'generated/\n.env\n');
  writeFileSync(join(repo, 'source.txt'), 'original\n');
  writeFileSync(join(repo, 'architecture/environment.json'), JSON.stringify({schemaVersion:1,prerequisites: [], setup, generatedDirectories: ['generated']}));
  git('add', '.'); git('commit', '-m', 'fixture');
  const env = { ...process.env, ARCNEXUS_STATE_DIR: state };
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { env, encoding: 'utf8' });
  const prepare = (...args) => run('prepare', '--project', repo, ...args);
  return {root, repo, state, git, env, run, prepare};
}
test('built prepare creates a pinned workspace, runs setup there and cleanup retains branch/report', t => {
  const f = fixture(t, [{command: 'node', args: ['-e', "require('fs').mkdirSync('generated');require('fs').writeFileSync('generated/cwd',process.cwd())"]}]);
  const base = f.git('rev-parse', 'HEAD');
  const result = f.prepare('--issue', '7'); assert.equal(result.status, 0, result.stderr);
  const record = JSON.parse(result.stdout);
  assert.equal(record.base, base); assert.match(record.branch, /^codex\/7-/);
  assert.equal(readFileSync(join(record.workspace, 'generated/cwd'), 'utf8'), record.workspace);
  assert.equal(f.git('status', '--porcelain'), ''); assert.equal(f.git('branch', '--show-current'), 'main');
  assert.equal(f.run('cleanup', record.id).status, 0);
  assert.equal(existsSync(record.workspace), false);
  assert.equal(f.git('rev-parse', record.branch), base);
  assert.equal(existsSync(join(f.state, 'runs', record.id, 'report.json')), true);
  assert.equal(f.run('cleanup', record.id).status, 0);
});
test('dirty source is rejected without preparation', t => {
  const f = fixture(t); writeFileSync(join(f.repo, 'source.txt'), 'dirty');
  const r = f.prepare(); assert.equal(r.status, 2); assert.match(r.stderr, /clean/i);
});
test('setup failure retains evidence and workspace', t => {
  const f = fixture(t, [{command:'node', args:['-e', 'console.error("setup broke");process.exit(4)']}]);
  const r = f.prepare(); assert.equal(r.status, 1);
  const record = JSON.parse(r.stdout); assert.equal(record.status, 'failed'); assert.ok(existsSync(record.workspace));
  assert.match(readFileSync(join(f.state,'runs',record.id,'command-0.log'),'utf8'), /setup broke/);
});
test('setup source mutation is rejected and cleanup refuses to lose it', t => {
  const f = fixture(t, [{command:'node',args:['-e',"require('fs').writeFileSync('source.txt','changed')"]}]);
  const r = f.prepare(); assert.equal(r.status, 1);
  const record = JSON.parse(r.stdout); assert.equal(f.run('cleanup', record.id).status, 1);
  assert.equal(readFileSync(join(record.workspace, 'source.txt'),'utf8'),'changed');
});
test('cleanup refuses unknown ignored files and untracked files', t => {
  const f = fixture(t); const r = f.prepare(); assert.equal(r.status,0,r.stderr); const record=JSON.parse(r.stdout);
  for (const name of ['.env','valuable.txt']) {
    writeFileSync(join(record.workspace,name),'keep');
    assert.equal(f.run('cleanup',record.id).status,1);
    assert.equal(readFileSync(join(record.workspace,name),'utf8'),'keep'); rmSync(join(record.workspace,name));
  }
  assert.equal(f.run('cleanup',record.id).status,0);
});
test('overall timeout retains a failed record', t => {
  const f = fixture(t,[{command:'node',args:['-e','setInterval(()=>{},1000)']}]);
  const r=f.prepare('--timeout-seconds','0.2'); assert.equal(r.status,1); assert.match(r.stderr,/timed out/i);
  assert.equal(JSON.parse(r.stdout).status,'failed');
});
test('SIGINT cancels command and releases lock', async t => {
  const f=fixture(t,[{command:'node',args:['-e','console.log("READY");setInterval(()=>{},1000)']}]);
  const child=spawn(process.execPath,[cli,'prepare','--project',f.repo],{env:f.env});
  let output=''; child.stdout.on('data',b=>output+=b);
  const exited=new Promise(r=>child.once('close',r));t.after(()=>child.kill('SIGKILL'));let ready=false;const deadline=Date.now()+10000;
  while(Date.now()<deadline){try{const run=join(f.state,'runs',readdirSync(join(f.state,'runs'))[0]);ready=readdirSync(run).filter(n=>n.startsWith('command-')).some(n=>readFileSync(join(run,n),'utf8').includes('READY'));}catch{}if(ready)break;await new Promise(r=>setTimeout(r,20));}
  assert.ok(ready,'setup command must be running before cancellation');child.kill('SIGINT');
  const code=await exited; assert.equal(code,130);
  assert.equal(JSON.parse(output).status,'cancelled'); assert.equal(existsSync(join(f.state,'active.lock')),false);
});
test('invalid configuration and missing prerequisite fail at their respective stages', t => {
  const f=fixture(t);
  writeFileSync(join(f.repo,'architecture/environment.json'),JSON.stringify({schemaVersion:1,prerequisites:[],setup:[],generatedDirectories:['../escape']}));
  f.git('add','.');f.git('commit','-m','invalid'); assert.equal(f.prepare().status,2);
  writeFileSync(join(f.repo,'architecture/environment.json'),JSON.stringify({schemaVersion:1,prerequisites:[{command:'arcnexus-nonexistent-tool',args:[]}],setup:[],generatedDirectories:[]}));
  f.git('add','.');f.git('commit','-m','missing tool'); const r=f.prepare();assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).commands.length,1);
});
test('lock prevents overlapping operations and ownership tampering refuses cleanup', t => {
  const f=fixture(t);const r=f.prepare();assert.equal(r.status,0,r.stderr);const record=JSON.parse(r.stdout);
  writeFileSync(join(f.state,'active.lock'),'interrupted');assert.equal(f.prepare().status,1);rmSync(join(f.state,'active.lock'));
  const path=join(f.state,'runs',record.id,'report.json');writeFileSync(path,JSON.stringify({...record,workspace:f.repo}));
  assert.equal(f.run('cleanup',record.id).status,1);assert.ok(existsSync(f.repo));
});
test('explicit base remains pinned while source HEAD advances', t => {
  const f=fixture(t), base=f.git('rev-parse','HEAD');
  writeFileSync(join(f.repo,'source.txt'),'new');f.git('add','.');f.git('commit','-m','advance');
  const r=f.prepare('--base',base);assert.equal(r.status,0,r.stderr);
  assert.equal(readFileSync(join(JSON.parse(r.stdout).workspace,'source.txt'),'utf8'),'original\n');
  assert.equal(readFileSync(join(f.repo,'source.txt'),'utf8'),'new');
});
test('worktree creation does not overwrite a colliding branch or directory', async t => {
  const {createWorkspace,prepareWorkspace}=await import('../../dist/workspace.js');
  const {stateRoot}=await import('../../dist/state.js');
  const f=fixture(t); const previous=process.env.ARCNEXUS_STATE_DIR;process.env.ARCNEXUS_STATE_DIR=f.state;
  t.after(()=>{if(previous===undefined)delete process.env.ARCNEXUS_STATE_DIR;else process.env.ARCNEXUS_STATE_DIR=previous;});
  const root=stateRoot(), record=createWorkspace(root,{project:f.repo});
  f.git('branch',record.branch);await assert.rejects(prepareWorkspace(root,record,new AbortController().signal));
  f.git('branch','-D',record.branch);mkdirSync(record.workspace);writeFileSync(join(record.workspace,'precious'),'keep');
  await assert.rejects(prepareWorkspace(root,record,new AbortController().signal));
  assert.equal(readFileSync(join(record.workspace,'precious'),'utf8'),'keep');
});

function evidence(f, record) {
  const dir = join(f.state, 'runs', record.id);
  const reports = ['report.json', 'report.md'].map(name => readFileSync(join(dir, name)));
  return { dir, assertReports() {
    for (const [i, name] of ['report.json', 'report.md'].entries()) {
      assert.deepEqual(readFileSync(join(dir, name)), reports[i], `${name} changed`);
    }
  } };
}
for (const failed of [false, true]) test(`cleanup preserves ${failed ? 'failed' : 'successful'} run evidence and receipt on retry`, t => {
  const f = fixture(t, failed ? [{command:'node', args:['-e','process.exit(4)']}] : []);
  const prepared = f.prepare(); assert.equal(prepared.status, failed ? 1 : 0, prepared.stderr);
  const record = JSON.parse(prepared.stdout), original = evidence(f, record);
  const first = f.run('cleanup', record.id); assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(JSON.parse(first.stdout), {...record, cleanupStatus:'removed'});
  original.assertReports();
  const receiptPath = join(original.dir, 'cleanup.json'), receipt = readFileSync(receiptPath);
  const metadata = JSON.parse(receipt);
  assert.equal(metadata.cleanupStatus, 'removed');
  assert.ok(Number.isFinite(Date.parse(metadata.removedAt)));
  assert.equal(existsSync(record.workspace), false);
  const second = f.run('cleanup', record.id); assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(JSON.parse(second.stdout), {...record, cleanupStatus:'removed'});
  original.assertReports(); assert.deepEqual(readFileSync(receiptPath), receipt);
});
for (const legacy of [false, true]) test(`cleanup refuses replacement paths and safely handles ${legacy ? 'legacy' : 'current'} removal`, t => {
  const f = fixture(t), prepared = f.prepare(); assert.equal(prepared.status, 0, prepared.stderr);
  const record = JSON.parse(prepared.stdout);
  if (legacy) {
    f.git('worktree', 'remove', record.workspace);
    record.status = 'removed';
    writeFileSync(join(f.state, 'runs', record.id, 'report.json'), JSON.stringify(record));
  } else {
    const result = f.run('cleanup', record.id); assert.equal(result.status, 0, result.stderr);
  }
  const original = evidence(f, record), receiptPath = join(original.dir, 'cleanup.json');
  const receipt = legacy ? undefined : readFileSync(receiptPath);
  const checkEvidence = () => {
    original.assertReports();
    if (legacy) assert.equal(existsSync(receiptPath), false);
    else assert.deepEqual(readFileSync(receiptPath), receipt);
  };
  for (const kind of ['file', 'directory', 'symlink', 'dangling symlink']) {
    if (kind === 'file') writeFileSync(record.workspace, 'keep');
    else if (kind === 'directory') { mkdirSync(record.workspace); writeFileSync(join(record.workspace, 'keep'), 'keep'); }
    else symlinkSync(kind === 'symlink' ? f.repo : join(f.root, 'missing'), record.workspace);
    const result = f.run('cleanup', record.id);
    assert.equal(result.status, 1, `${kind}: ${result.stderr}`);
    if (kind.includes('symlink')) {
      assert.ok(lstatSync(record.workspace).isSymbolicLink());
      assert.equal(readlinkSync(record.workspace), kind === 'symlink' ? f.repo : join(f.root, 'missing'));
    } else assert.equal(readFileSync(kind === 'file' ? record.workspace : join(record.workspace, 'keep'), 'utf8'), 'keep');
    checkEvidence(); rmSync(record.workspace, {recursive:true});
  }
  for (let i = 0; i < 2; i++) {
    const result = f.run('cleanup', record.id); assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {...record, cleanupStatus:'removed'}); checkEvidence();
  }
});

test('hard parent death stops a finite setup process group and preserves incomplete evidence', async t => {
  const f=fixture(t,[{command:process.execPath,args:['-e',"console.log('COMMAND_PID='+process.pid);setInterval(()=>{},1000)"]}]);
  const child=spawn(process.execPath,[cli,'prepare','--project',f.repo],{env:f.env,stdio:'ignore'});
  let pid,record,log;
  t.after(()=>{child.kill('SIGKILL');if(pid)try{process.kill(-pid,'SIGKILL');}catch{}});
  const deadline=Date.now()+10000;
  while(Date.now()<deadline&&!pid){
    if(existsSync(join(f.state,'runs')))for(const id of readdirSync(join(f.state,'runs'))){const path=join(f.state,'runs',id,'command-0.log');if(existsSync(path)){const match=readFileSync(path,'utf8').match(/COMMAND_PID=(\d+)/);if(match){pid=Number(match[1]);log=path;record=join(f.state,'runs',id,'report.json');}}}
    if(!pid)await new Promise(r=>setTimeout(r,25));
  }
  assert.ok(pid,'command reached observable running state');
  const exited=new Promise(r=>child.once('close',r));child.kill('SIGKILL');await exited;
  const {groupMembers}=await import('../../dist/service-state.js');
  const stopped=Date.now()+5000;while(groupMembers(pid).length&&Date.now()<stopped)await new Promise(r=>setTimeout(r,25));
  assert.deepEqual(groupMembers(pid),[],'parent-loss supervisor stops command group');
  assert.match(readFileSync(log,'utf8'),/COMMAND_PID=/);assert.equal(JSON.parse(readFileSync(record)).finishedAt,undefined);
});
test('cleanup reconciles primary removal only with durable matching intent', t => {
  const f=fixture(t),r=f.prepare();assert.equal(r.status,0,r.stderr);const record=JSON.parse(r.stdout);
  const dir=join(f.state,'runs',record.id),stat=lstatSync(record.workspace);
  const intent={schemaVersion:1,id:record.id,source:record.source,commonDir:record.commonDir,base:record.base,branch:record.branch,workspace:record.workspace,device:stat.dev,inode:stat.ino,members:record.members,status:'removing'};
  writeFileSync(join(dir,'cleanup-intent.json'),JSON.stringify(intent));
  writeFileSync(join(dir,'members-cleanup.json'),JSON.stringify({removed:[]}));
  const before=readFileSync(join(dir,'report.json'));
  f.git('worktree','remove',record.workspace);
  const result=f.run('cleanup',record.id);assert.equal(result.status,0,result.stderr);
  assert.deepEqual(readFileSync(join(dir,'report.json')),before);
  assert.equal(JSON.parse(readFileSync(join(dir,'cleanup-intent.json'))).status,'removed');
  assert.equal(f.run('cleanup',record.id).status,0);
});
test('cleanup refuses unexplained disappearance and replacement after intent',t=>{
 const f=fixture(t),record=JSON.parse(f.prepare().stdout),dir=join(f.state,'runs',record.id),stat=lstatSync(record.workspace);
 const intent={schemaVersion:1,id:record.id,source:record.source,commonDir:record.commonDir,base:record.base,branch:record.branch,workspace:record.workspace,device:stat.dev,inode:stat.ino,members:record.members,status:'removing'};
 f.git('worktree','remove',record.workspace);assert.equal(f.run('cleanup',record.id).status,1);
 writeFileSync(join(dir,'cleanup-intent.json'),JSON.stringify(intent));mkdirSync(record.workspace);writeFileSync(join(record.workspace,'precious'),'keep');assert.equal(f.run('cleanup',record.id).status,1);assert.equal(readFileSync(join(record.workspace,'precious'),'utf8'),'keep');
});
