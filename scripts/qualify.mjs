// Compatibility entry point; execution lives in the TypeScript application.
import { legacyMain } from '../dist/experiments/experiments.js';
await legacyMain(process.argv.slice(2));
