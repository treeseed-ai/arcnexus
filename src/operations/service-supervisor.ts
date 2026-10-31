import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, renameSync, openSync, writeSync, closeSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { endpointClosed, groupMembers, processStart, type ServiceRecord } from "./service-state.js";
interface Start {record:ServiceRecord;command:string;args:string[];cwd:string;env:NodeJS.ProcessEnv;port:number}
let child:ChildProcess|undefined,record:ServiceRecord|undefined,fd:number|undefined,stopping:Promise<void>|undefined;
const persist=()=>{if(record){writeFileSync(record.recordPath+'.tmp',JSON.stringify(record,null,2),{mode:0o600});renameSync(record.recordPath+'.tmp',record.recordPath);}};
function stop(reason:string):Promise<void>{return stopping??=(async()=>{
 if(!record){process.disconnect?.();return;}record.status='stopping';record.error??=reason==='lease ended'?undefined:reason;persist();
 const pid=child?.pid;if(pid){try{process.kill(-pid,'SIGTERM');}catch{}await delay(300);try{process.kill(-pid,'SIGKILL');}catch{}for(let i=0;i<20&&groupMembers(pid).length;i++)await delay(50);}
 record.endpointClosed=record.port?await endpointClosed(record.port):true;record.status=(!pid||!groupMembers(pid).length)&&record.endpointClosed?'stopped':'unresolved';record.finishedAt=new Date().toISOString();persist();
 if(fd!==undefined){closeSync(fd);fd=undefined;}if(process.connected){process.send?.({type:'stopped',record});process.disconnect();}
 })();}
process.on('disconnect',()=>{void stop('parent disconnected');});process.on('SIGTERM',()=>{void stop('supervisor terminated');});
process.on('message',(message:Start|{stop:true})=>{
 if('stop'in message){void stop('lease ended');return;}if(record)return;
 record={...message.record,supervisorPid:process.pid,status:'starting'};persist();fd=openSync(record.log,'wx',0o600);
 child=spawn(message.command,message.args,{cwd:message.cwd,env:{...message.env,ARCNEXUS_HOST:'127.0.0.1',ARCNEXUS_PORT:String(message.port)},detached:true,stdio:['ignore','pipe','pipe']});record.pid=child.pid;record.startTime=child.pid?processStart(child.pid):undefined;persist();
 let bytes=0,line='';
 const capture=(chunk:Buffer,stdout:boolean)=>{if(fd===undefined)return;const room=64*1024*1024-bytes;if(room>0)writeSync(fd,chunk.subarray(0,room));bytes+=chunk.length;if(bytes>64*1024*1024){void stop('Service output limit exceeded');return;}if(!stdout)return;line+=chunk.toString();if(line.length>65536){line='';return;}let end:number;while((end=line.indexOf('\n'))>=0){const text=line.slice(0,end);line=line.slice(end+1);try{const endpoint=JSON.parse(text).arcnexusEndpoint;if(!endpoint)continue;if(endpoint.host!=='127.0.0.1'||!Number.isInteger(endpoint.port)||endpoint.port<1||endpoint.port>65535||(message.port&&endpoint.port!==message.port))throw new Error('Invalid service endpoint announcement');if(record!.port)continue;record!.port=endpoint.port;persist();process.send?.({type:'endpoint',record});}catch(error){if(text.includes('arcnexusEndpoint'))void stop(String(error));}}};
 child.stdout!.on('data',chunk=>capture(chunk,true));child.stderr!.on('data',chunk=>capture(chunk,false));
 child.on('error',error=>{void stop(String(error));});child.on('close',code=>{if(!stopping)void stop(`Service exited unexpectedly (${code})`);});
});
