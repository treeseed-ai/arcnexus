import { ConfigurationReader } from "./configuration.js";
import { readFileSync, realpathSync, statSync, accessSync, constants } from 'node:fs';
import { dirname, isAbsolute, delimiter } from 'node:path';
import { validateSchema } from "./schema.js";
import { InputError, type Command } from "./config.js";
import type { RecordData } from "../workspace/state.js";
export interface Bindings { schemaVersion:1; repositories:Record<string,string>; tools:Record<string,string>; configurationSource?: import('./configuration.js').ConfigurationSource }
export function loadBindings(path?:string):Bindings {
 try {
  const source=path?new ConfigurationReader().file(path):undefined;
  const value=source?validateSchema<Bindings>('bindings',structuredClone(source.value)):{schemaVersion:1 as const,repositories:{},tools:{}};
  for(const [key,p] of Object.entries(value.repositories)){if(!isAbsolute(p)||!statSync(p).isDirectory())throw new InputError('Repository binding must be an absolute existing directory');value.repositories[key]=realpathSync(p);}
  for(const [key,p] of Object.entries(value.tools)){if(!isAbsolute(p)||!statSync(p).isFile())throw new InputError('Tool binding must be an absolute existing executable');accessSync(p,constants.X_OK);value.tools[key]=realpathSync(p);}
  return {...value,...(source?{configurationSource:source}:{})};
 }catch(error){throw new InputError(String(error));}
}
export function targetEnvironment(record:RecordData):NodeJS.ProcessEnv {
 const bindings=record.bindings as Bindings|undefined;
 const directories=bindings?[...new Set(Object.values(bindings.tools).map(dirname))]:[];
 return {...process.env,PATH:[...directories,process.env.PATH??''].join(delimiter)};
}
export function targetCommand(record:RecordData,command:Command):Command {
 const bindings=record.bindings as Bindings|undefined;
 return {...command,command:bindings&&Object.hasOwn(bindings.tools,command.command)?bindings.tools[command.command]!:command.command};
}

export function toolDirectories(record:RecordData):string[] {
 const bindings=record.bindings as Bindings|undefined;
 return [...new Set(Object.values(bindings?.tools??{}).map(dirname))];
}
