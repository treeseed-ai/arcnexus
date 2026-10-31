import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {checkSummary} from './check-report-summary.mjs';
const marker=new URL('./fault-injection.json',import.meta.url),path=join(process.cwd(),'src/report.ts');
const hash=s=>createHash('sha256').update(s).digest('hex');
if(!existsSync(marker)){
 const before=readFileSync(path,'utf8'),signature='export function markdownReport(record: RecordData): string {';
 if(!before.includes(signature))throw new Error('Fault injection signature unavailable; campaign must be reviewed');
 const after=before.replace(signature,signature+"\n  record = {...record, outcome: 'INJECTED_WRONG_OUTCOME'}; // qualification fault injection\n");
 writeFileSync(path,after);writeFileSync(marker,JSON.stringify({label:'deliberate outcome substitution',before:hash(before),injected:hash(after),path,at:new Date().toISOString()}));
 console.log('FAULT_INJECTED: narrow outcome substitution before independent acceptance');
 const build=spawnSync('npm',['run','build'],{encoding:'utf8'});if(build.status!==0)throw new Error(build.stderr+build.stdout);
}else{
 const evidence=JSON.parse(readFileSync(marker));evidence.repaired=hash(readFileSync(path));writeFileSync(marker,JSON.stringify(evidence));
 console.log('FAULT_REPAIR_OBSERVED: '+evidence.repaired);
}
await checkSummary();
