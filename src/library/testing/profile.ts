import { type ConfigurationSource, ConfigurationReader } from '../architecture/configuration.js';
import { commands, relativePath, type Command } from '../architecture/config.js';
import { validateSchema } from '../architecture/schema.js';

export interface TestProfile {
  configuration: ConfigurationSource;
  schemaVersion: 1;
  id: string;
  adapter: 'node';
  outputRoot: string;
  preparation: Array<Command & { purpose: 'production' | 'tests' }>;
}

/** Resolves fixed preparation commands from the same immutable catalog revision. */
export function loadTestProfile(project: string, revision: string, id: string): TestProfile {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`Invalid test profile: ${id}`);
  const source = new ConfigurationReader().definition(
    project,
    revision,
    `architecture/test-profiles/${id}`,
  );
  const profile = validateSchema<TestProfile>('test-profile', source.value);
  if (profile.id !== id) throw new Error(`Test profile identity mismatch: ${id}`);
  relativePath(profile.outputRoot);
  commands(profile.preparation.map(({ command, args }) => ({ command, args })));
  return { ...profile, configuration: source };
}
