import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InputError } from '../architecture/config.js';

export type FixtureKind = 'identity' | 'http' | 'simulation' | 'workday' | 'general';

/** Materializes known fixture contracts and compiled payloads for deterministic experiments. */
export class FixtureCatalog {
  /** Copies the declared fixture payload without inferring additional repository members. */
  files(kind: FixtureKind): Record<string, string> {
    const output: Record<string, string> = {};
    const compiled = fileURLToPath(new URL(`../../../.fixture-build/${kind}`, import.meta.url));
    if (!existsSync(compiled))
      throw new InputError('Compiled fixture unavailable; run npm run build');
    this.read(
      fileURLToPath(new URL(`../../../fixtures/${kind}`, import.meta.url)),
      '',
      output,
      true,
    );
    this.read(compiled, '', output, false);
    return output;
  }

  /** Loads the requested content through this component boundary. */
  private read(
    root: string,
    directory: string,
    output: Record<string, string>,
    source: boolean,
  ): void {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      if (source && (entry.name.endsWith('.mts') || entry.name === 'node_modules')) continue;
      const path = directory ? directory + '/' + entry.name : entry.name;
      if (entry.isDirectory()) this.read(root, path, output, source);
      else if (entry.isFile()) {
        if (Object.hasOwn(output, path)) throw new InputError('Duplicate fixture payload: ' + path);
        output[path] = readFileSync(join(root, path)).toString('base64');
      } else throw new Error('Invalid bundled fixture');
    }
  }
}
