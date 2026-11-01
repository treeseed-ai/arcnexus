import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fixtureFiles } from '../../dist/experiments/experiment-config.js';
export function materializeFixture(
  kind: 'identity' | 'http' | 'simulation' | 'workday',
  target: string,
): void {
  for (const [path, content] of Object.entries(fixtureFiles(kind))) {
    const destination = join(target, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, Buffer.from(content, 'base64'));
  }
}
