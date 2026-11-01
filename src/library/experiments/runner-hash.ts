import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { InputError } from '../architecture/config.js';
import { hash } from './experiment-hash.js';

/** Hashes supervising code and fixture inputs before and after qualification execution. */
export function runnerHash(runner: string): string {
  const entries: Array<[string, string]> = [];
  const visit = (path: string) => {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) entries.push([file, hash(readFileSync(file))]);
      else throw new InputError('Runner files must not be symlinks');
    }
  };
  visit(dirname(runner));
  const legacySchemas = join(dirname(runner), '../schemas');
  if (existsSync(legacySchemas)) visit(legacySchemas);
  const compiledFixtures = join(dirname(runner), '../.fixture-build');
  if (existsSync(compiledFixtures)) visit(compiledFixtures);
  const fixtures = join(dirname(runner), '../fixtures/simulation');
  if (existsSync(fixtures)) visit(fixtures);
  const workdayFixture = join(dirname(runner), '../fixtures/workday');
  if (existsSync(workdayFixture)) visit(workdayFixture);
  entries.push(['lock', hash(readFileSync(join(dirname(runner), '../package-lock.json')))]);
  return hash(JSON.stringify(entries));
}
