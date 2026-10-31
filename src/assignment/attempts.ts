import { cpSync, existsSync, mkdirSync, unlinkSync, openSync, readSync, closeSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RecordData } from "../workspace/state.js";

const artifacts = ['prompt.txt','response-schema.json','execution.json','events.jsonl','agent-result.json','agent-result.raw.txt','sandbox-preflight.json','changes.patch','staged.patch','unstaged.patch','new-files.json'];

export function beginAttempt(root: string, record: RecordData): void {
  const dir=join(root,'runs',record.id);
  for(const name of [...artifacts,'codex.pid']) {
    try { unlinkSync(join(dir,name)); } catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error; }
  }
  delete record.error;delete record.agent;delete record.attemptReportedUsage;delete record.sandboxPreflight;
}

export function logExcerpt(path: string): string {
  const fd=openSync(path,'r'),buffer=Buffer.alloc(16384);
  try { return buffer.subarray(0,readSync(fd,buffer,0,buffer.length,0)).toString('utf8').slice(0,4096); }
  finally { closeSync(fd); }
}

export function archiveAttempt(root: string, record: RecordData, number: number, commandStart: number, prompt: string, collection: 'attempts'|'turns'='attempts'): void {
  const dir=join(root,'runs',record.id), target=join(dir,collection,String(number));
  mkdirSync(join(dir,collection),{recursive:true,mode:0o700});
  mkdirSync(target,{mode:0o700});
  for(const name of artifacts){const source=join(dir,name);if(existsSync(source))cpSync(source,join(target,name));}
  const probe=record.sandboxPreflight as {log?:string}|undefined;
  if(probe?.log&&existsSync(probe.log))cpSync(probe.log,join(target,'sandbox-preflight.log'));
  for(let i=commandStart;i<record.commands.length;i++){
    const command=record.commands[i] as {log?:string};
    if(command.log&&existsSync(command.log))cpSync(command.log,join(target,`command-${i}.log`));
  }
  writeFileSync(join(target,'prompt.txt'),prompt,{mode:0o600});
  const summary=(record[collection] as Array<Record<string,unknown>>).find(a=>a.number===number);
  if(summary)writeFileSync(join(target,'report.json'),JSON.stringify({...record,attempts:undefined,attempt:summary},null,2)+'\n',{mode:0o600});
}

export function usageDelta(previous: unknown, current: unknown): Record<string,number>|null {
  if(!current||typeof current!=='object'||Array.isArray(current))return null;
  const before=previous&&typeof previous==='object'?previous as Record<string,unknown>:{};
  const after=current as Record<string,unknown>,out:Record<string,number>={};
  for(const key of new Set([...Object.keys(before),...Object.keys(after)])){
    const value=after[key],prior=before[key]??0;
    if(typeof value!=='number'||!Number.isFinite(value)||typeof prior!=='number'||!Number.isFinite(prior)||value<prior||value<0)return null;
    out[key]=value-prior;
  }
  return Object.keys(out).length?out:null;
}
