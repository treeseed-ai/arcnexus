// Prompt campaigns use the same assembled CLI and project host as normal execution.
process.argv.splice(2, 0, 'experiment', 'run');

await import('../dist/cli.js');
