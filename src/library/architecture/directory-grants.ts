import { git } from '../operations/process.js';
import type { Component } from './components.js';
import { InputError } from './config.js';

/** Validates captured Git objects; preparation still checks the actual filesystem. */
export class DirectoryGrants {
  private readonly entries = new Map<string, { mode: string; type: string }>();

  constructor(repository: string, base: string) {
    const listing = git(repository, 'ls-tree', '-r', '-t', '-z', base);
    for (const entry of listing.split('\0').filter(Boolean)) {
      const separator = entry.indexOf('\t');
      const [mode, type] = entry.slice(0, separator).split(' ');
      this.entries.set(entry.slice(separator + 1), { mode: mode!, type: type! });
    }
  }

  validate(component: Component): void {
    for (const path of component.access.writeDirectories) {
      if (path === '.') continue;
      const segments = path.split('/');
      for (let index = 1; index <= segments.length; index++) {
        const entry = this.entries.get(segments.slice(0, index).join('/'));
        if (entry?.mode === '120000')
          throw new InputError(
            `Write directory traverses tracked symlink: ${component.id}: ${path}`,
          );
        if (entry && entry.type !== 'tree')
          throw new InputError(
            `Write directory targets or traverses tracked file: ${component.id}: ${path}`,
          );
      }
    }
  }
}
