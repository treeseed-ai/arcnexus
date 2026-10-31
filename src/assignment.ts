import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, dirname } from 'node:path';
import { commands, InputError, type Command } from './config.js';
import { ancestry, covered, loadCatalog, scopePath, type Component, type Role, type ExecutionProfile, type CompositionProfile } from './components.js';
import { validateSchema } from './schema.js';
import { git } from './process.js';
export interface HostCheck extends Command { id: string; artifacts: string[] }
export interface Assignment { schemaVersion: 1; objective: string; kind: 'change'|'research'|'review'; expectedOutcome: string; acceptanceCriteria: string[]; allowedWritePaths?: string[]; hostChecks: HostCheck[] }
export interface ResolvedAssignment {
  schemaVersion: 1; base: string; componentId: string; assignment: Assignment; context: Component[]; related: Component[];
  role: Role; compositionProfile?: CompositionProfile; executionProfile: ExecutionProfile; allowedWritePaths: string[]; verification: Command[];
  artifacts: Array<{path: string; sha256: string; content: string}>; pendingChecks: string[]; digest: string;
}
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export function resolveBase(repository: string, ref='HEAD'): {source:string;base:string} {
  try { const source=realpathSync(repository);return {source,base:git(source,'rev-parse','--verify','--end-of-options',`${ref}^{commit}`).trim()}; }
  catch(error){throw new InputError(String(error));}
}
export function resolveAssignment(repository:string, base:string, id:string, options:{objective?:string;file?:string;kind?:string;model?:string;timeoutSeconds?:number;compositionProfile?:string;executionProfile?:string}):ResolvedAssignment {
  try {
    const catalog=loadCatalog(repository,base),context=ancestry(catalog,id),component=context.at(-1)!;
    if(!['gateway','library','foundation'].includes(component.type)||!component.verification.length)throw new InputError('Executable component requires verification');
    if(options.file && (options.objective!==undefined || options.kind!==undefined))throw new InputError('--assignment excludes objective and --kind');
    const assignment=validateSchema<Assignment>('assignment',options.file?JSON.parse(readFileSync(options.file,'utf8')):{schemaVersion:1,objective:options.objective,kind:options.kind??'change',expectedOutcome:options.objective,acceptanceCriteria:[options.objective],hostChecks:[]});
    if(!assignment.objective.trim())throw new InputError('Objective must not be blank');
    const allowedWritePaths=assignment.allowedWritePaths??component.allowedWritePaths;
    for(const p of allowedWritePaths){scopePath(p);if(!covered(p,component.allowedWritePaths))throw new InputError(`Assignment widens component scope: ${p}`);}
    const artifacts:ResolvedAssignment['artifacts']=[],seen=new Set<string>();
    for(const check of assignment.hostChecks){
      commands([check]);
      if(!isAbsolute(check.command))throw new InputError('Host check executable must be absolute');
      if(seen.has(check.id))throw new InputError('Duplicate host check identity');seen.add(check.id);
      for(const p of check.artifacts){
        if(!isAbsolute(p)||p.includes('/../')||p.includes('/./')||!statSync(p).isFile())throw new InputError('Host check artifacts must be absolute regular files');
        if(!artifacts.some(a=>a.path===p)){const data=readFileSync(p);artifacts.push({path:p,sha256:digest(data),content:data.toString('base64')});}
      }
    }
    const profileId=options.executionProfile??component.executionProfile;
    if(!Object.hasOwn(catalog.profiles,profileId))throw new InputError(`Unknown execution profile: ${profileId}`);
    const compositionProfile=options.compositionProfile?catalog.compositions[options.compositionProfile]:undefined;
    if(options.compositionProfile && (!Object.hasOwn(catalog.compositions,options.compositionProfile)||!context.some(c=>c.type==='package'&&compositionProfile!.packageIds.includes(c.id))))throw new InputError('Component is outside selected composition profile');
    const executionProfile={...catalog.profiles[profileId]!};
    if(options.model)executionProfile.model=options.model;
    if(options.timeoutSeconds!==undefined)executionProfile.timeoutSeconds=options.timeoutSeconds;
    const data={schemaVersion:1 as const,base,componentId:id,assignment,context,related:component.relatedIds.map(id=>catalog.components[id]!),role:catalog.roles[component.role]!,...(compositionProfile?{compositionProfile}:{}),executionProfile,allowedWritePaths,verification:component.verification,artifacts,pendingChecks:['Environment prerequisites/setup','Prepared path and symlink validation','Installed Codex sandbox compatibility']};
    return {...data,digest:digest(JSON.stringify(data))};
  }catch(error){throw new InputError(String(error));}
}
export function materializeChecks(resolved:ResolvedAssignment,directory:string):HostCheck[]{
  mkdirSync(directory,{recursive:true,mode:0o700});
  const replacements=new Map<string,string>();
  resolved.artifacts.forEach(artifact=>{const p=join(directory,'files',artifact.path.slice(1));mkdirSync(dirname(p),{recursive:true,mode:0o700});const bytes=Buffer.from(artifact.content,'base64');if(digest(bytes)!==artifact.sha256)throw new Error('Acceptance snapshot hash mismatch');writeFileSync(p,bytes,{mode:0o500});replacements.set(artifact.path,p);});
  return resolved.assignment.hostChecks.map(check=>({...check,command:replacements.get(check.command)??check.command,args:check.args.map(arg=>replacements.get(arg)??arg)}));
}
