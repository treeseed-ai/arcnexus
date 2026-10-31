import { validateSchema } from './schema.js';
import { posix } from 'node:path';
export class InputError extends Error {}
export interface Command { command: string; args: string[] }
export interface Environment { schemaVersion: 1; prerequisites: Command[]; setup: Command[]; generatedDirectories: string[] }
export function relativePath(value: unknown): string {
  if (typeof value !== 'string' || !value || value === '.' || value.startsWith('/') || value.includes('\\') || value.includes('\0') || posix.normalize(value) !== value || value.split('/').some(p => p === '..' || p.toLowerCase() === '.git')) throw new InputError(`Invalid relative path: ${String(value)}`);
  return value;
}
export function commands(value: unknown): Command[] {
  if (!Array.isArray(value)) throw new InputError('Expected command array');
  return value.map(c => {
    if (!c || typeof c.command !== 'string' || !c.command || c.command.includes('\0') || !Array.isArray(c.args) || !c.args.every((a: unknown) => typeof a === 'string' && !a.includes('\0'))) throw new InputError('Invalid command/args');
    return { command: c.command, args: c.args };
  });
}
export function environment(value: unknown): Environment {
  let v: Environment;
  try { v = validateSchema<Environment>('environment', value); } catch(error) { throw new InputError(String(error)); }
  if (!v || !Array.isArray(v.generatedDirectories)) throw new InputError('Invalid environment definition');
  return { schemaVersion: 1, prerequisites: commands(v.prerequisites), setup: commands(v.setup), generatedDirectories: v.generatedDirectories.map(relativePath) };
}
