import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const cli=resolve('dist/cli.js'),root=mkdtempSync(join(tmpdir(),'arcnexus-reference-acceptance-'));
try{
 const git=(...args)=>{const r=spawnSync('git',['-C',root,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
 git('init','-q');mkdirSync(join(root,'.agents/skills/example'),{recursive:true});mkdirSync(join(root,'docs'));
 writeFileSync(join(root,'docs/guide.md'),'Guide');writeFileSync(join(root,'untracked.md'),'Untracked');
 symlinkSync('docs/guide.md',join(root,'link.md'));symlinkSync('docs',join(root,'linked-docs'));
 mkdirSync(join(root,'nested'));writeFileSync(join(root,'nested/guide.md'),'Guide');git('add','docs/guide.md','link.md','linked-docs','nested/guide.md');rmSync(join(root,'nested'),{recursive:true});symlinkSync('docs',join(root,'nested'));
 const skill=join(root,'.agents/skills/example/SKILL.md');
 const run=(references,expected,label)=>{writeFileSync(skill,'---\nname: example\ndescription: Example\n'+(references===undefined?'':'references: '+JSON.stringify(references)+'\n')+'---\n# Example\n');git('add','.agents/skills/example/SKILL.md');const r=spawnSync(process.execPath,[cli,'guidance','validate','--project',root,'--json'],{encoding:'utf8'});assert.equal(r.status,expected,label+': '+r.stdout+r.stderr);const value=JSON.parse(r.stdout);if(expected===1)assert.ok(value.diagnostics.some(d=>d.path==='.agents/skills/example/SKILL.md'));};
 run(undefined,0,'legacy');run(['docs/guide.md'],0,'valid');
 for(const [label,value] of Object.entries({empty:[],scalar:'docs/guide.md',duplicate:['docs/guide.md','docs/guide.md'],absolute:[join(root,'docs/guide.md')],traversal:['docs/../docs/guide.md'],escape:['../guide.md'],missing:['docs/missing.md'],untracked:['untracked.md'],directory:['docs'],symlink:['link.md'],parentSymlink:['nested/guide.md'],emptyEntry:[''],wrongType:[42]}))run(value,1,label);
 if(process.argv.includes('--combined')){
  const skillText=readFileSync('.agents/skills/documentation-writer/SKILL.md','utf8');assert.match(skillText,/references:/);assert.match(skillText,/docs\/guidance-maintenance\.md/);
  const guide=readFileSync('docs/guidance-maintenance.md','utf8');for(const pattern of [/references/i,/track/i,/readab/i,/integrat/i])assert.match(guide,pattern);
  const r=spawnSync(process.execPath,[cli,'guidance','validate','--project','.'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 }
 console.log('Independent references policy acceptance passed');
}finally{rmSync(root,{recursive:true,force:true});}
