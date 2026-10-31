import { executeDirect, type CommandResult } from "./process.js";
import type { Command } from "../architecture/config.js";
interface Start {command:Command;cwd:string;log:string;options:{env?:NodeJS.ProcessEnv;timeoutMs?:number}}
const controller=new AbortController();let started=false;
process.on('disconnect',()=>controller.abort(new Error('Command parent disconnected')));
process.on('SIGTERM',()=>controller.abort(new Error('Command supervisor terminated')));
process.on('message',(message:Start|{cancel:string})=>{
 if('cancel'in message){controller.abort(new Error(message.cancel));return;}
 if(started)return;started=true;
 void(async()=>{
  let response:{result?:CommandResult;error?:string};
  try{response={result:await executeDirect(message.command,message.cwd,message.log,controller.signal,message.options)};}
  catch(error){response={error:error instanceof Error?error.message:String(error),...(error&&typeof error==='object'&&'commandResult'in error?{result:error.commandResult as CommandResult}:{})};}
  if(process.connected)process.send?.(response,()=>process.disconnect());
 })();
});
