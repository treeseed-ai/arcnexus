import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Builds a clean distribution and generated compatibility entry point. */
class BuildApplication {
  async run(): Promise<void> {
    rmSync('dist', { recursive: true, force: true });
    this.compile([]);
    const schemas = await import(
      pathToFileURL(resolve('dist/library/architecture/build-schemas.js')).href
    );
    new schemas.SchemaPackager().build();
    writeFileSync('dist/cli.js', "#!/usr/bin/env node\nimport './gateway/cli/cli.js';\n", {
      mode: 0o755,
    });
    this.compile(['-p', 'tsconfig.fixtures.json']);
  }

  private compile(args: string[]): void {
    const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', ...args], {
      stdio: 'inherit',
    });
    if (result.error || result.status !== 0)
      throw new Error(`TypeScript compilation failed: ${result.error ?? result.status}`);
  }
}

await new BuildApplication().run();
