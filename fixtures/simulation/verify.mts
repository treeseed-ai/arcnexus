import { existsSync, readFileSync } from 'node:fs';

/** Owns simulation verification behavior and its component collaborators. */
class SimulationVerification {
  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  async run(): Promise<void> {
    const regression = './tests/regression.mjs';
    if (existsSync('tests/regression.mjs')) await import(regression);
    if (readFileSync('source.txt', 'utf8') === 'broken') throw new Error('BROKEN_IMPLEMENTATION');
  }
}

await new SimulationVerification().run();
