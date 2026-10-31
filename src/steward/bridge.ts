import { createServer, type Socket } from 'node:net';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
export interface BridgeTool {name:string;description:string;inputSchema:{type:'object';[key:string]:unknown}}
export async function openBridge(tools:BridgeTool[],call:(name:string,args:unknown)=>Promise<unknown>,disconnect:()=>void=()=>{}):Promise<{config:Record<string,unknown>;close:()=>Promise<void>}>{
 const directory=mkdtempSync(join(tmpdir(),'arcnexus-ipc-'));chmodSync(directory,0o700);const path=join(directory,'host.sock');const sockets=new Set<Socket>();let closing=false;
 const server=createServer(socket=>{sockets.add(socket);let input='',busy=false;
  socket.on('close',()=>{sockets.delete(socket);if(!closing)disconnect();});socket.on('error',()=>{});
  socket.on('data',data=>{input+=data.toString();if(Buffer.byteLength(input)>128*1024){socket.destroy();return;}
   let boundary:number;while((boundary=input.indexOf('\n'))>=0){const line=input.slice(0,boundary);input=input.slice(boundary+1);
    void(async()=>{let acquired=false;let request:{id:number;method:string;name?:string;args?:unknown}|undefined;try{request=JSON.parse(line);if(!request||!Number.isSafeInteger(request.id))throw new Error('Invalid bridge request');if(busy)throw new Error('Concurrent bridge request denied');busy=true;acquired=true;const result=request.method==='list'?tools:request.method==='call'&&tools.some(t=>t.name===request!.name)?await call(request.name!,request.args):(()=>{throw new Error('Unknown bridge request');})();socket.write(JSON.stringify({id:request.id,result})+'\n');}catch(error){socket.write(JSON.stringify({id:request?.id,error:String(error)})+'\n');}finally{if(acquired)busy=false;}})();
   }
  });
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(path,resolve);});chmodSync(path,0o600);
 return {config:{mcp_servers:{arcnexus:{default_tools_approval_mode:'approve',command:process.execPath,args:[fileURLToPath(new URL("./bridge-client.js",import.meta.url)),path],startup_timeout_sec:10,tool_timeout_sec:125}}},close:async()=>{closing=true;for(const s of sockets)s.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(directory,{recursive:true,force:true});}};
}
