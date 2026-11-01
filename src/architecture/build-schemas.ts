import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/** Packages trusted application schemas independently of any target catalog. */
class SchemaPackager {
  private readonly registry: Record<string, string> = {};

  build(): void {
    const root = resolve('src');
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const source = join(entry.parentPath, entry.name);
      if (!source.includes('/schemas/')) continue;
      this.copy(root, source, entry.name);
    }
    writeFileSync(
      'dist/architecture/schema-registry.json',
      JSON.stringify(this.registry, null, 2) + '\n',
    );
  }

  private copy(root: string, source: string, name: string): void {
    const id = name.slice(0, -5);
    if (Object.hasOwn(this.registry, id)) throw new Error(`Duplicate runtime schema: ${id}`);
    const destination = join('dist', relative(root, source));
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    this.registry[id] = relative('dist/architecture', destination);
  }
}

new SchemaPackager().build();
