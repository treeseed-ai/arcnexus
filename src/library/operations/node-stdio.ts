import { createWriteStream, fstatSync } from 'node:fs';

/** Restores inherited Node diagnostic descriptors when restricted socket introspection hides their type. */
function restore(name: 'stdout' | 'stderr', fd: number): void {
  if (process[name].constructor.name !== 'Writable' || !fstatSync(fd).isSocket()) return;
  const stream = createWriteStream('', { fd, autoClose: false });
  Object.defineProperty(process, name, { configurable: true, enumerable: true, get: () => stream });
}

restore('stdout', 1);

restore('stderr', 2);
