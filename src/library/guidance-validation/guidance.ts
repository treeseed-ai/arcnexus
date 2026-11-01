import { isUtf8 } from 'node:buffer';
import { accessSync, constants, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, win32 } from 'node:path';
import { parseDocument } from 'yaml';
import { InputError } from '../architecture/config.js';
import { git } from '../operations/process.js';

interface Diagnostic {
  path: string;
  code: string;
  message: string;
}

export interface GuidanceReport {
  schemaVersion: 1;
  project: string;
  status: 'valid' | 'invalid';
  skills: Array<{ path: string; valid: boolean }>;
  agents: Array<{ path: string; readable: boolean }>;
  diagnostics: Diagnostic[];
}

/** Validates metadata and inventories instructions; never approves instruction semantics. */
export class GuidanceValidator {
  /** Rejects inputs that violate the captured configuration contract. */
  validate(project: string): GuidanceReport {
    const inventory = new GuidanceInventory(project);
    const report = inventory.report;
    for (const path of inventory.paths.filter((path) =>
      /^\.agents\/skills\/.+\/SKILL\.md$/.test(path),
    )) {
      const valid = inventory.check(path, 'invalid_skill', () => {
        this.checkSkill(path, inventory.read(path), report.project, inventory.tracked);
      });
      report.skills.push({ path, valid });
    }
    if (!report.skills.length)
      report.diagnostics.push({
        path: '.agents/skills',
        code: 'empty_inventory',
        message: 'No tracked skills found',
      });
    for (const path of inventory.paths.filter((path) => basename(path) === 'AGENTS.md')) {
      const readable = inventory.check(path, 'unreadable_instructions', () => inventory.read(path));
      report.agents.push({ path, readable });
    }
    report.status = report.diagnostics.length ? 'invalid' : 'valid';
    return report;
  }

  /** Validates tracked skill metadata and records file-oriented diagnostics. */
  private checkSkill(path: string, text: string, root: string, tracked: Set<string>): void {
    const lines = text.split(/\r?\n/);
    if (lines[0] !== '---') throw new Error('missing YAML frontmatter');
    const end = lines.indexOf('---', 1);
    if (end < 0) throw new Error('missing closing frontmatter delimiter');
    const document = parseDocument(lines.slice(1, end).join('\n'), {
      version: '1.1',
      uniqueKeys: false,
    });
    if (document.errors.length || document.warnings.length)
      throw new Error((document.errors[0] ?? document.warnings[0])!.message);
    const metadata: unknown = document.toJS();
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
      throw new Error('frontmatter must be a mapping');
    const { name, description, references } = metadata as Record<string, unknown>;
    if (typeof name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
      throw new Error('name must use lowercase letters, digits, and hyphens');
    if (name !== basename(dirname(path))) throw new Error('name must match the skill directory');
    if (typeof description !== 'string' || !description.trim())
      throw new Error('description must be a nonempty string');
    if (Object.hasOwn(metadata, 'references'))
      new GuidanceReferences(root, tracked).validate(references);
  }
}

/** Inventories tracked instruction and skill files without judging their prose. */
class GuidanceInventory {
  readonly paths: string[];

  readonly tracked: Set<string>;

  readonly report: GuidanceReport;

  /** Captures the dependencies and state used throughout this instance’s lifecycle. */
  constructor(project: string) {
    let root: string;
    try {
      root = realpathSync(git(resolve(project), 'rev-parse', '--show-toplevel').trim());
      this.paths = git(root, 'ls-files', '-z').split('\0').filter(Boolean).sort();
    } catch (error) {
      throw new InputError(`Git guidance inventory unavailable: ${String(error)}`);
    }
    this.tracked = new Set(this.paths);
    this.report = {
      schemaVersion: 1,
      project: root,
      status: 'valid',
      skills: [],
      agents: [],
      diagnostics: [],
    };
  }

  /** Loads the requested content through this component boundary. */
  read(path: string): string {
    const bytes = readFileSync(join(this.report.project, path));
    if (!isUtf8(bytes)) throw new Error('File is not UTF-8');
    return bytes.toString('utf8');
  }

  /** Checks the required invariant before allowing the next transition. */
  check(path: string, code: string, action: () => unknown): boolean {
    try {
      action();
      return true;
    } catch (error) {
      this.report.diagnostics.push({
        path,
        code,
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

/** Checks skill reference paths against tracked regular files and traversal restrictions. */
class GuidanceReferences {
  /** Captures the dependencies and state used throughout this instance’s lifecycle. */
  constructor(
    private readonly root: string,
    private readonly tracked: Set<string>,
  ) {}

  /** Rejects inputs that violate the captured configuration contract. */
  validate(value: unknown): void {
    if (!Array.isArray(value) || value.length === 0)
      throw new Error('references must be a nonempty array');
    const seen = new Set<string>();
    for (const reference of value) {
      this.checkPath(reference, seen);
      this.checkFile(reference);
    }
  }

  /** Rejects paths outside the permitted repository-relative boundary. */
  private checkPath(reference: unknown, seen: Set<string>): asserts reference is string {
    if (typeof reference !== 'string' || !reference.trim())
      throw new Error('references entries must be nonempty strings');
    if (isAbsolute(reference) || win32.isAbsolute(reference))
      throw new Error('references paths must be repository-relative');
    const segments = reference.split(/[\\/]/);
    if (segments.some((segment) => segment === '..' || segment === '.'))
      throw new Error('references paths must not contain traversal segments');
    if (reference.includes('\\'))
      throw new Error('references paths must use repository-relative separators');
    if (seen.has(reference)) throw new Error('references paths must be unique');
    seen.add(reference);
    if (!this.tracked.has(reference))
      throw new Error(`referenced file is not tracked: ${reference}`);
  }

  /** Handles check file within this component’s captured contract. */
  private checkFile(reference: string): void {
    let current = this.root;
    const parts = reference.split('/');
    for (let index = 0; index < parts.length; index++) {
      current = join(current, parts[index]!);
      const stat = lstatSync(current);
      if (stat.isSymbolicLink())
        throw new Error(`referenced path traverses a symbolic link: ${reference}`);
      if (index < parts.length - 1 && !stat.isDirectory())
        throw new Error(`referenced path parent is not a directory: ${reference}`);
      if (index === parts.length - 1 && !stat.isFile())
        throw new Error(`referenced path is not a regular file: ${reference}`);
    }
    try {
      accessSync(current, constants.R_OK);
      readFileSync(current);
    } catch {
      throw new Error(`referenced file is not readable: ${reference}`);
    }
  }
}
