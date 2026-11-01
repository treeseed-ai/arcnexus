// Compatibility entry point; implementation is compiled from TypeScript.
import { fileURLToPath } from 'node:url';
import { checkSummary } from '../dist/experiments/checks/check-report-summary.js';
export { checkSummary };
if (process.argv[1] === fileURLToPath(import.meta.url)) await checkSummary();
