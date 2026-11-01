import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { relativePath, type Command } from '../architecture/config.js';
import { git } from './process.js';

export interface ConfinementAuthority {
  workspace: string;
  reads: string[];
  outputs: string[];
  maintainedPaths?: string[];
  network?: boolean;
  temporaryRoot: string;
  executable: string;
  toolDirectories?: string[];
}

/** Builds an enforced read-only source policy with narrowly declared disposable output mounts. */
export class SourceConfinement {
  readonly filesystem: Record<string, 'read' | 'write'> = { ':minimal': 'read' };

  readonly overrides: string[];

  readonly temporaryRoot: string;

  readonly workspace: string;

  /** Validates all aliases and output intersections before creating writable sandbox roots. */
  constructor(private readonly authority: ConfinementAuthority) {
    this.workspace = realpathSync(authority.workspace);
    this.temporaryRoot = resolve(authority.temporaryRoot);
    if (
      this.inside(this.temporaryRoot, this.workspace) ||
      this.inside(this.workspace, this.temporaryRoot)
    )
      throw new Error('Private temporary storage must be outside source');
    this.validateSource();
    const outputs = authority.outputs.map((path) => this.output(path));
    for (const path of authority.reads) this.read(path);
    for (const path of authority.toolDirectories ?? []) this.tool(path);
    for (const path of [...outputs, this.temporaryRoot]) {
      this.validateSegments(path);
      mkdirSync(path, { recursive: true, mode: 0o700 });
      this.filesystem[path] = 'write';
    }
    this.configurationHome();
    this.overrides = this.configuration();
  }

  /** Pins configuration read-only explicitly; the installed runtime otherwise grants its home writes. */
  private configurationHome(): void {
    const path = this.temporaryRoot + '-configuration';
    if (this.inside(path, this.workspace) || this.inside(this.workspace, path))
      throw new Error('Private configuration must be outside source');
    this.validateSegments(path);
    mkdirSync(path, { recursive: true, mode: 0o700 });
    this.filesystem[path] = 'read';
  }

  /** Prevents executable bindings from implicitly granting filesystem-wide read access. */
  private tool(path: string): void {
    const canonical = realpathSync(path);
    if (canonical === '/') throw new Error('Tool directory cannot be the filesystem root');
    this.filesystem[canonical] = 'read';
  }

  /** Returns the exact wrapper command; unsupported installed enforcement fails without fallback. */
  command(command: Command, cwd = this.workspace): Command {
    const actual = realpathSync(cwd);
    this.rejectConfiguration(actual);
    if (!this.inside(actual, this.workspace)) throw new Error('Operation cwd escapes source');
    const args = ['sandbox', '-P', 'arcnexus', '-C', actual];
    for (const override of this.overrides) args.push('-c', override);
    return {
      command: this.authority.executable,
      args: [...args, '--', command.command, ...command.args],
    };
  }

  /** Rejects ignored project settings along the actual command path before policy resolution. */
  private rejectConfiguration(cwd: string): void {
    let current = cwd;
    while (this.inside(current, this.workspace)) {
      if (existsSync(join(current, '.codex/config.toml')))
        throw new Error('Target Codex configuration cannot alter execution confinement');
      if (current === this.workspace) break;
      current = resolve(current, '..');
    }
  }

  /** Uses private configuration and temporary storage instead of caller-writable configuration. */
  environment(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
    return {
      ...base,
      CODEX_HOME: this.temporaryRoot + '-configuration',
      TMPDIR: this.temporaryRoot,
    };
  }

  /** Rejects tracked aliases and target configuration that could override the active policy. */
  private validateSource(): void {
    const files = git(
      this.workspace,
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '-z',
    )
      .split('\0')
      .filter(Boolean);
    for (const file of files) {
      if (file === '.codex/config.toml' || file.endsWith('/.codex/config.toml'))
        throw new Error('Target Codex configuration cannot alter execution confinement');
      const path = join(this.workspace, file);
      this.validateSegments(path);
      if (existsSync(path) && lstatSync(path).isFile() && lstatSync(path).nlink !== 1)
        throw new Error(`Maintained source has an unsafe hard link: ${file}`);
    }
  }

  /** Validates source/output separation against the Git index before filesystem creation. */
  private output(path: string): string {
    relativePath(path);
    const tracked = [
      ...git(this.workspace, 'ls-files', '-z').split('\0').filter(Boolean),
      ...(this.authority.maintainedPaths ?? []),
    ];
    if (tracked.some((file) => this.inside(file, path) || this.inside(path, file)))
      throw new Error(`Generated output overlaps tracked source: ${path}`);
    const absolute = resolve(this.workspace, path);
    this.validateSegments(absolute);
    return absolute;
  }

  /** Grants only existing read paths; ownership of future files does not require creating them. */
  private read(path: string): void {
    if (path !== '.') relativePath(path);
    const absolute = resolve(this.workspace, path);
    this.validateSegments(absolute);
    if (existsSync(absolute)) this.filesystem[absolute] = 'read';
  }

  /** Rejects filesystem aliases in existing ancestors, including dangling symlinks. */
  private validateSegments(path: string): void {
    const parts = resolve(path).split('/').filter(Boolean);
    let current = '/';
    for (const part of parts) {
      current = join(current, part);
      try {
        if (lstatSync(current).isSymbolicLink()) throw new Error(`Unsafe symlink: ${current}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
    }
  }

  /** Distinguishes containment from sibling path prefixes. */
  private inside(path: string, root: string): boolean {
    const suffix = relative(root, path);
    return (
      suffix === '' || (!suffix.startsWith('../') && suffix !== '..' && !suffix.startsWith('/'))
    );
  }

  /** Encodes literal TOML values with no shell interpolation or inherited writable defaults. */
  private configuration(): string[] {
    const entries = Object.entries(this.filesystem).map(
      ([path, mode]) => `${JSON.stringify(path)}=${JSON.stringify(mode)}`,
    );
    return [
      'default_permissions="arcnexus"',
      `permissions.arcnexus.filesystem={${entries.join(',')}}`,
      `permissions.arcnexus.network.enabled=${this.authority.network === true}`,
      'features.use_legacy_landlock=false',
    ];
  }
}
