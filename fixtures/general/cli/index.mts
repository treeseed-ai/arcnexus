import { greet } from '../service/index.mjs';

/** Selects the default argument and delegates greeting construction to service. */
export function run(args: string[]): string {
  return greet(args[0] ?? 'world');
}
