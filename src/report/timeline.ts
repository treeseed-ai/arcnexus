import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { InputError } from "../architecture/config.js";
import type { RecordData } from "../workspace/state.js";
export interface TimelineEvent { schemaVersion:1; sequence:number; observedAt:string; runId:string; componentId?:string; turn:number; type:string; payload:unknown }
const observers=new Map<string,(event:TimelineEvent)=>void>();
export function observeExecution(root:string,id:string,listener:(event:TimelineEvent)=>void):()=>void{const key=root+'/'+id;observers.set(key,listener);return ()=>{observers.delete(key);};}
export function observe(root:string,record:RecordData,type:string,payload:unknown):void {
 const sequence=Number(record.timelineSequence??0)+1;
 const event:TimelineEvent={schemaVersion:1,sequence,observedAt:new Date().toISOString(),runId:record.id,componentId:(record.resolvedAssignment as {componentId?:string}|undefined)?.componentId,turn:Array.isArray(record.turns)?record.turns.length:0,type,payload};
 appendFileSync(join(root,'runs',record.id,'timeline.jsonl'),JSON.stringify(event)+'\n',{mode:0o600});record.timelineSequence=sequence;observers.get(root+'/'+record.id)?.(event);
}
export function readTimeline(directory:string):{events:TimelineEvent[];complete:boolean;problem?:string} {
 const path=join(directory,'timeline.jsonl');if(!existsSync(path))return {events:[],complete:false,problem:'No timeline available (historical or not started)'};
 const text=readFileSync(path,'utf8'),lines=text.split('\n'),events:TimelineEvent[]=[];lines.pop();
 try{for(const line of lines){const event=JSON.parse(line) as TimelineEvent;if(event.schemaVersion!==1||event.sequence!==events.length+1)throw new Error('Invalid timeline sequence/version');events.push(event);}}
 catch(error){return {events,complete:false,problem:String(error)};}
 return {events,complete:text.endsWith('\n'),...(!text.endsWith('\n')?{problem:'Incomplete trailing timeline record'}:{})};
}
export function readStatus(root:string,id:string) {
 if(!/^[a-zA-Z0-9_-]+$/.test(id))throw new InputError('Invalid workspace ID');
 const directory=join(root,'runs',id);let record:RecordData;
 try{record=JSON.parse(readFileSync(join(directory,'report.json'),'utf8')) as RecordData;}catch{throw new InputError('Workspace report unavailable');}
 const timeline=readTimeline(directory),last=timeline.events.at(-1);
 const elapsedMs=record.elapsedMs??Math.max(0,Date.now()-Date.parse(record.startedAt));
 return {id:record.id,status:record.status,activity:record.stage,operation:record.currentOperation,plan:record.plan,elapsedMs,timeoutSeconds:(record.resolvedAssignment as {executionProfile?:{timeoutSeconds:number}}|undefined)?.executionProfile?.timeoutSeconds,requests:record.requests,lastEvent:last,timeline:{complete:timeline.complete,problem:timeline.problem},finalized:!!record.finishedAt,record,events:timeline.events};
}
export async function viewExecution(root:string,id:string,follow:boolean,json:boolean,after:number,signal:AbortSignal):Promise<void>{
 let cursor=after;
 do{
  const {record,events,...status}=readStatus(root,id);
  if(!follow){console.log(json?JSON.stringify(status):`${id}: ${status.status}\nActivity: ${String(status.activity??'unavailable')}\nElapsed: ${status.elapsedMs}ms\n${JSON.stringify(status.plan??'No plan recorded',null,2)}\n${status.timeline.problem??''}`);return;}
  for(const event of events.filter(e=>e.sequence>cursor)){console.log(json?JSON.stringify(event):`${event.sequence} ${event.observedAt} ${event.type} ${JSON.stringify(event.payload)}`);cursor=event.sequence;}
  if(status.finalized){if(status.timeline.problem)console.error(status.timeline.problem);return;}
  try{await delay(100,undefined,{signal});}catch{if(signal.aborted)return;throw new Error('Follow interrupted');}
 }while(!signal.aborted);
}
