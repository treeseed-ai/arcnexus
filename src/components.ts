import { commands, InputError, relativePath, type Command } from './config.js';
import { validateAccess, type AccessPolicy } from './permissions.js';
import { git } from './process.js';
export interface Component {
  id: string; type: string; purpose: string; path: string; objectives: string[]; constraints: string[];
  access: AccessPolicy; allowedWritePaths: string[]; verification: Command[]; parentId?: string; questions?: string[]; patterns?: string[];
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(x=>typeof x==='string')) throw new InputError('Expected string array');
  return value;
}
export function loadContext(repository: string, base: string, id: string): Component[] {
  const result: Component[]=[]; const seen=new Set<string>();
  try {
    while(id) {
      if(!/^[a-zA-Z0-9_-]+$/.test(id)||seen.has(id))throw new InputError('Invalid or cyclic component identity');
      seen.add(id);
      const v=JSON.parse(git(repository,'show',`${base}:architecture/components/${id}.json`)) as Component;
      if(v.id!==id||typeof v.type!=='string'||typeof v.purpose!=='string'||!v.purpose)throw new InputError('Invalid component');
      const component:Component={id,type:v.type,purpose:v.purpose,path:relativePath(v.path),objectives:strings(v.objectives),constraints:strings(v.constraints),access:validateAccess(v.access),allowedWritePaths:strings(v.allowedWritePaths).map(relativePath),verification:commands(v.verification)};
      if(v.parentId!==undefined){if(typeof v.parentId!=='string'||!v.parentId)throw new InputError('Invalid parent');component.parentId=v.parentId;}
      if(v.questions!==undefined)component.questions=strings(v.questions);
      if(v.patterns!==undefined)component.patterns=strings(v.patterns);
      result.unshift(component);id=component.parentId??'';
    }
    if(result.at(-1)?.type!=='library'||!result.at(-1)?.verification.length)throw new InputError('Executable library needs verification commands');
    return result;
  }catch(error){throw new InputError(String(error));}
}
