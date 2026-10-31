import type { Operation } from './operations.js';
import { commands, environment, InputError, relativePath, type Command } from './config.js';
import { validateAccess, type AccessPolicy } from './permissions.js';
import { git } from './process.js';
import { validateSchema } from './schema.js';
export interface Component {
  schemaVersion: 1|2; operationIds?:string[]; id: string; type: string; repository: string; purpose: string; path: string;
  objectives: string[]; constraints: string[]; access: AccessPolicy; allowedWritePaths: string[];
  verification: Command[]; parentId?: string; questions: string[]; patterns: string[];
  interfaces: string[]; documentation: string[]; tests: string[]; relatedIds: string[];
  role: string; executionProfile: string;
  members?: { foundations: string[]; dependencies: string[]; gateways: string[]; libraries: string[]; releases: string[] };
}
export interface Role { schemaVersion: 1; id: string; purpose: string; responsibilities: string[]; activities: string[] }
export interface ExecutionProfile { schemaVersion: 1|2; id: string; model: string; reasoning: 'low'|'medium'|'high'; webSearch: 'live'|'disabled'; timeoutSeconds: number; commandTimeoutSeconds: number; operationCategories?:string[];maxOperationCalls?:number;maxTurns: 3|4; maxCorrectiveTurns: 2 }
export interface CompositionProfile {schemaVersion:1;id:string;platformId:string;packageIds:string[]}
export interface Catalog { operations:Record<string,Operation>; compositions: Record<string,CompositionProfile>; components: Record<string, Component>; roles: Record<string, Role>; profiles: Record<string, ExecutionProfile> }
export const covered = (path: string, scope: string[]) => scope.some(p => p === '.' || path === p || path.startsWith(`${p}/`));
export const scopePath = (path: string) => path === '.' ? path : relativePath(path);
function read<T>(repository: string, base: string, path: string, schema: string): T {
  const mode = git(repository, 'ls-tree', base, '--', path).split(' ')[0];
  if (mode !== '100644' && mode !== '100755') throw new InputError(`Definition must be a regular tracked file: ${path}`);
  return validateSchema<T>(schema, JSON.parse(git(repository, 'show', `${base}:${path}`)));
}
export function ancestry(catalog: Catalog, id: string): Component[] {
  const result: Component[] = [], seen = new Set<string>();
  while (id) {
    if (seen.has(id)) throw new InputError(`cyclic component ancestry: ${id}`);
    seen.add(id);
    const c = Object.hasOwn(catalog.components,id) ? catalog.components[id] : undefined;
    if (!c) throw new InputError(`Missing component: ${id}`);
    result.unshift(c); id = c.parentId ?? '';
  }
  return result;
}
export function loadCatalog(repository: string, base: string): Catalog {
  try {
    const catalog: Catalog = { operations:{},compositions: {}, components: {}, roles: {}, profiles: {} };
    const paths = git(repository, 'ls-tree', '-r', '--name-only', base, '--', 'architecture').split('\n').sort();
    const groups = [['components','component',catalog.components],['roles','role',catalog.roles],['execution-profiles','execution-profile',catalog.profiles]] as const;
    for (const [directory, schema, target] of groups) for (const path of paths.filter(p => p.startsWith(`architecture/${directory}/`) && p.endsWith('.json'))) {
      const value = read<Component & Role & ExecutionProfile>(repository, base, path, schema);
      if (path !== `architecture/${directory}/${value.id}.json`) throw new InputError(`Identity must match filename: ${path}`);
      Object.defineProperty(target, value.id, { value, enumerable: true, configurable: true });
    }
    for(const path of paths.filter(p=>p.startsWith('architecture/operations/')&&p.endsWith('.json'))){const operation=read<Operation>(repository,base,path,'operation');if(path!==`architecture/operations/${operation.id}.json`)throw new InputError('Operation identity must match filename');scopePath(operation.cwd);operation.generatedDirectories.forEach(scopePath);operation.artifacts.forEach(scopePath);commands([operation,...operation.probes]);Object.defineProperty(catalog.operations,operation.id,{value:operation,enumerable:true});}
    environment(read(repository, base, 'architecture/environment.json', 'environment'));
    if (!Object.keys(catalog.components).length) throw new InputError('No components defined');
    for (const c of Object.values(catalog.components)) {
      scopePath(c.path); validateAccess(c.access);
      for (const p of [...c.allowedWritePaths, ...c.documentation, ...c.tests]) scopePath(p);
      commands(c.verification);
      for(const id of c.operationIds??[]){const op=catalog.operations[id];if(!Object.hasOwn(catalog.operations,id)||op?.repository!==c.repository)throw new InputError('Missing operation or conflicting repository owner: '+id);if(!op.activities.every(a=>catalog.roles[c.role]?.activities.includes(a)))throw new InputError('Operation activity outside role');}
      if (!Object.hasOwn(catalog.roles,c.role) || !Object.hasOwn(catalog.profiles,c.executionProfile)) throw new InputError(`Missing role/execution profile for ${c.id}`);
      if (c.allowedWritePaths.some(p => !covered(p,c.access.writeDirectories))) throw new InputError(`Uncovered writable scope: ${c.id}`);
      const ancestors = ancestry(catalog,c.id).slice(0,-1);
      const parent = ancestors.at(-1);
      if (c.type === 'platform' && parent) throw new InputError('Platform cannot have an owner');
      if (parent && c.type === 'package' && parent.type !== 'platform') throw new InputError('Package owner must be a platform');
      if (parent && c.type !== 'package' && c.repository !== parent.repository) throw new InputError(`Conflicting repository ownership: ${c.id}`);
      for (const a of ancestors.filter(a => a.repository === c.repository)) {
        if (c.allowedWritePaths.some(p => !covered(p,a.allowedWritePaths)) || c.access.writeDirectories.some(p => !covered(p,a.access.writeDirectories))) throw new InputError(`Child widens ancestor authority: ${c.id}`);
      }
      for (const id of c.relatedIds) if (!Object.hasOwn(catalog.components,id)) throw new InputError(`Missing related component: ${id}`);
      if (c.type === 'package' && !c.members) throw new InputError(`Package requires member declarations: ${c.id}`);
      if (c.members) {
        if (c.type !== 'package') throw new InputError('Only packages declare members');
        for (const [kind, ids] of Object.entries(c.members)) for (const id of ids) {
          const member = Object.hasOwn(catalog.components,id) ? catalog.components[id] : undefined;
          if (!member || (kind !== 'dependencies' && member.parentId !== c.id) || (['foundations','gateways','libraries'].includes(kind) && member.type !== ({foundations:'foundation',gateways:'gateway',libraries:'library'} as Record<string,string>)[kind])) throw new InputError(`Invalid ${kind} member: ${id}`);
        }
      }
    }
    for (const path of paths.filter(p=>p.startsWith('architecture/composition-profiles/') && p.endsWith('.json'))) {
      const profile = read<CompositionProfile>(repository,base,path,'composition-profile');
      if(path !== `architecture/composition-profiles/${profile.id}.json` || catalog.components[profile.platformId]?.type !== 'platform') throw new InputError('Invalid composition platform');
      Object.defineProperty(catalog.compositions,profile.id,{value:profile,enumerable:true});
      for(const id of profile.packageIds) if(catalog.components[id]?.type !== 'package' || catalog.components[id]?.parentId !== profile.platformId) throw new InputError(`Invalid composition package: ${id}`);
    }
    return catalog;
  } catch(error) { throw new InputError(String(error)); }
}
export function loadContext(repository: string, base: string, id: string): Component[] {
  return ancestry(loadCatalog(repository,base),id);
}
