import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import { delimiter, dirname, isAbsolute } from 'node:path';
import type { RecordData } from '../workspace/state.js';
import { InputError, type Command } from './config.js';
import { ConfigurationReader } from './configuration.js';
import { validateSchema } from './schema.js';
export interface Bindings {
  taskAcceptance?: Record<string, import('./assignment.js').HostCheck[]>;
  taskRefresh?: Record<string, Command[]>;
  schemaVersion: 1;
  repositories: Record<string, string>;
  tools: Record<string, string>;
  configurationSource?: import('./configuration.js').ConfigurationSource;
}
export function loadBindings(path?: string): Bindings {
  try {
    const source = path ? new ConfigurationReader().file(path) : undefined;
    const value = source
      ? validateSchema<Bindings>('bindings', structuredClone(source.value))
      : { schemaVersion: 1 as const, repositories: {}, tools: {} };
    for (const [key, p] of Object.entries(value.repositories)) {
      if (!isAbsolute(p) || !statSync(p).isDirectory())
        throw new InputError('Repository binding must be an absolute existing directory');
      value.repositories[key] = realpathSync(p);
    }
    for (const [key, p] of Object.entries(value.tools)) {
      if (!isAbsolute(p) || !statSync(p).isFile())
        throw new InputError('Tool binding must be an absolute existing executable');
      accessSync(p, constants.X_OK);
      value.tools[key] = realpathSync(p);
    }
    return { ...value, ...(source ? { configurationSource: source } : {}) };
  } catch (error) {
    throw new InputError(String(error));
  }
}
export function bindingEnvironment(bindings?: Bindings): NodeJS.ProcessEnv {
  const directories = bindings ? [...new Set(Object.values(bindings.tools).map(dirname))] : [];
  return { ...process.env, PATH: [...directories, process.env.PATH ?? ''].join(delimiter) };
}

export function boundCommand(bindings: Bindings | undefined, command: Command): Command {
  return {
    ...command,
    command:
      bindings && Object.hasOwn(bindings.tools, command.command)
        ? bindings.tools[command.command]!
        : command.command,
  };
}

export function targetEnvironment(record: RecordData): NodeJS.ProcessEnv {
  return bindingEnvironment(record.bindings as Bindings | undefined);
}

export function targetCommand(record: RecordData, command: Command): Command {
  return boundCommand(record.bindings as Bindings | undefined, command);
}

export function toolDirectories(record: RecordData): string[] {
  const bindings = record.bindings as Bindings | undefined;
  return [...new Set(Object.values(bindings?.tools ?? {}).map(dirname))];
}
