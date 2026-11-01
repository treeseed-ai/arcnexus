import { existsSync, readFileSync } from 'node:fs';
class SimulationVerification {
  async run(): Promise<void> {
    const regression = './tests/regression.mjs';
    if (existsSync('tests/regression.mjs')) await import(regression);
    if (readFileSync('source.txt', 'utf8') === 'broken') throw new Error('BROKEN_IMPLEMENTATION');
  }
}
await new SimulationVerification().run();
