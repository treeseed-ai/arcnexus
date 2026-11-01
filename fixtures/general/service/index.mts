import { normalizeName } from '../names/index.mjs';

/** Constructs a greeting using the names-owned normalization contract. */
export function greet(name: string): string {
  return 'Hello, ' + normalizeName(name) + '!';
}
