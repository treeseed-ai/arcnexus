// Explicit, one-time fault injection. The marker is outside candidate scope.
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {basename} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const [markerPrefix,acceptance]=process.argv.slice(2);
if(!markerPrefix||!acceptance)throw new Error('Expected external marker and acceptance script');
const marker=markerPrefix+'.'+basename(process.cwd());
if(!existsSync(marker)){
 const path='src/report/report.ts',before=readFileSync(path,'utf8');
 if(!before.includes('## Operations'))throw new Error('Fault injection requires implemented Operations heading');
 const after=before.replace('## Operations','## Injected incorrect heading');
 const hash=s=>createHash('sha256').update(s).digest('hex');
 writeFileSync(marker,JSON.stringify({label:'deliberate qualification fault injection',path,before:hash(before),after:hash(after),at:new Date().toISOString()}),{mode:0o600,flag:'wx'});
 writeFileSync(path,after);
 const build=spawnSync('npm',['run','build'],{stdio:'inherit'});if(build.status!==0)process.exit(build.status??1);
 console.log('FAULT_INJECTED: report Operations heading changed; repair src/report/report.ts without changing acceptance.');
}
const result=spawnSync(process.execPath,[acceptance],{stdio:'inherit'});process.exit(result.status??1);
