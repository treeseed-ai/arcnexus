// Supply a version-3 live campaign and bindings; there is no alternate sample runtime.
process.argv.splice(2, 0, 'experiment', 'run');

process.argv.push('--mode', 'live');

await import('../dist/cli.js');
