import { ConfigurationReader } from "./configuration.js";
import { isUtf8 } from 'node:buffer';
import type { Operation } from "../operations/operations.js";
import { loadBindings, type Bindings } from "./bindings.js";
import { resolveMembers, type Member } from "../workspace/members.js";
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, dirname } from 'node:path';
import { commands, environment, InputError, type Environment, type Command } from "./config.js";
import { validateOperations, ancestry, covered, loadCatalog, scopePath, type Component, type Role, type ExecutionProfile, type CompositionProfile } from "./components.js";
import { validateSchema } from "./schema.js";
import { git } from "../operations/process.js";
export interface HostCheck extends Command { id: string; artifacts: string[] }
export interface PriorEvidence {path:string;sourceId:string;revision:string;reason:string}
export interface EvidenceSnapshot extends PriorEvidence {sha256:string;bytes:number;content:string}
export interface Assignment { priorEvidence?:PriorEvidence[]; schemaVersion: 1|2;operationIds?:string[]; objective: string; kind: 'change'|'research'|'review'; expectedOutcome: string; changeType?: 'behavior'|'documentation'; acceptanceCriteria: string[]; allowedWritePaths?: string[]; hostChecks: HostCheck[] }
export interface ResolvedAssignment {
  configurationSources?: import('./configuration.js').ConfigurationSource[];
  schemaVersion: 1; priorEvidence:EvidenceSnapshot[];operations:Operation[];environment: Environment; workspaceMembers: Omit<Member,'workspace'|'status'>[]; bindings?: Bindings; base: string; owners: string[]; componentId: string; assignment: Assignment; context: Component[]; related: Component[];
  role: Role; compositionProfile?: CompositionProfile; executionProfile: ExecutionProfile; allowedWritePaths: string[]; verification: Command[];
  artifacts: Array<{path: string; sha256: string; content: string}>; pendingChecks: string[]; digest: string;
}
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export function resolveBase(repository: string, ref='HEAD'): {source:string;base:string} {
  try { const source=realpathSync(git(realpathSync(repository),'rev-parse','--show-toplevel').trim());return {source,base:git(source,'rev-parse','--verify','--end-of-options',`${ref}^{commit}`).trim()}; }
  catch(error){throw new InputError(String(error));}
}
export function resolveAssignment(repository:string, base:string, id:string, options:{value?:unknown;bindings?:Bindings;objective?:string;file?:string;kind?:string;model?:string;timeoutSeconds?:number;compositionProfile?:string;executionProfile?:string}):ResolvedAssignment {
  try {
    const catalog=loadCatalog(repository,base),context=ancestry(catalog,id),component=context.at(-1)!;
    const env=environment(new ConfigurationReader().definition(repository,base,'architecture/environment').value);
    if(env.workspace && component.repository!==env.workspace.primary.id)throw new InputError('Assignment component must belong to the writable primary repository');
    const workspaceMembers=resolveMembers(repository,base,'/workspace',env,options.bindings??loadBindings()).map(({workspace,status,...member})=>member);
    if(!['gateway','library','foundation'].includes(component.type)||!component.verification.length)throw new InputError('Executable component requires verification');
    if(options.file && (options.objective!==undefined || options.kind!==undefined))throw new InputError('--assignment excludes objective and --kind');
    const assignmentSource=options.file?new ConfigurationReader().file(options.file):undefined;
    const assignment=validateSchema<Assignment>('assignment',options.value??(assignmentSource?assignmentSource.value:{schemaVersion:1,objective:options.objective,kind:options.kind??'change',expectedOutcome:options.objective,acceptanceCriteria:[options.objective],hostChecks:[]}));
    if(!assignment.objective.trim())throw new InputError('Objective must not be blank');
    const priorEvidence:EvidenceSnapshot[]=[],historyPaths=new Set<string>();let historyBytes=0;
    for(const ref of assignment.priorEvidence??[]){
      if(!isAbsolute(ref.path)||!statSync(ref.path).isFile())throw new InputError('Prior evidence must be an absolute regular text file');
      const canonical=realpathSync(ref.path);if(historyPaths.has(canonical))throw new InputError('Duplicate prior evidence');historyPaths.add(canonical);
      if(statSync(ref.path).size>65536-historyBytes)throw new InputError('Prior evidence exceeds 64 KiB');
      const bytes=readFileSync(ref.path);historyBytes+=bytes.length;if(historyBytes>65536)throw new InputError('Prior evidence exceeds 64 KiB');
      if(!isUtf8(bytes)||bytes.includes(0))throw new InputError('Prior evidence must be UTF-8 text');
      priorEvidence.push({...ref,sha256:digest(bytes),bytes:bytes.length,content:bytes.toString('utf8')});
    }
    const requestedPaths=assignment.allowedWritePaths??component.allowedWritePaths;
    const allowedWritePaths=assignment.kind==='change'?requestedPaths:[];
    for(const p of requestedPaths){scopePath(p);if(!covered(p,component.allowedWritePaths))throw new InputError(`Assignment widens component scope: ${p}`);}
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
    const requestedOperations=assignment.operationIds??component.operationIds??[];
    if(requestedOperations.some(id=>!(component.operationIds??[]).includes(id)))throw new InputError('Assignment widens operation authority');
    const operations=requestedOperations.map(id=>catalog.operations[id]!);
    validateOperations(operations, executionProfile, env);
    const data={configurationSources:[...catalog.configurationSources,...(assignmentSource?[assignmentSource]:[])],schemaVersion:1 as const,priorEvidence,operations,environment:env,workspaceMembers,...(options.bindings?{bindings:options.bindings}:{}),base,owners:Object.keys(catalog.components),componentId:id,assignment,context,related:component.relatedIds.map(id=>catalog.components[id]!),role:catalog.roles[component.role]!,...(compositionProfile?{compositionProfile}:{}),executionProfile,allowedWritePaths,verification:component.verification,artifacts,pendingChecks:['Environment prerequisites/setup','Prepared path and symlink validation','Installed Codex sandbox compatibility']};
    return {...data,digest:digest(JSON.stringify(data))};
  }catch(error){throw new InputError(String(error));}
}
export function materializeChecks(resolved:ResolvedAssignment,directory:string):HostCheck[]{
  mkdirSync(directory,{recursive:true,mode:0o700});
  const replacements=new Map<string,string>();
  resolved.artifacts.forEach(artifact=>{const p=join(directory,'files',artifact.path.slice(1));mkdirSync(dirname(p),{recursive:true,mode:0o700});const bytes=Buffer.from(artifact.content,'base64');if(digest(bytes)!==artifact.sha256)throw new Error('Acceptance snapshot hash mismatch');writeFileSync(p,bytes,{mode:0o500});replacements.set(artifact.path,p);});
  return resolved.assignment.hostChecks.map(check=>({...check,command:replacements.get(check.command)??check.command,args:check.args.map(arg=>replacements.get(arg)??arg)}));
}

export function materializeEvidence(resolved:ResolvedAssignment,directory:string):void{
 mkdirSync(directory,{recursive:true,mode:0o700});
 for(const [index,item] of (resolved.priorEvidence??[]).entries()){if(digest(item.content)!==item.sha256)throw new Error('Prior evidence snapshot hash mismatch');writeFileSync(join(directory,`${index}.txt`),item.content,{mode:0o400});}
 writeFileSync(join(directory,'manifest.json'),JSON.stringify((resolved.priorEvidence??[]).map(({content,...item})=>item),null,2)+'\n',{mode:0o600});
}
