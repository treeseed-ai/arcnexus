import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isScalar, parseDocument, visit } from 'yaml';
import { git } from '../operations/process.js';

export interface ConfigurationSource {
  path: string;
  text: string;
  value: unknown;
  sourceHash: string;
  normalizedHash: string;
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex');

export const isConfiguration = (path: string) => /\.(json|yaml|yml)$/.test(path);

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, normalize(item)]),
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new Error('Expected finite JSON-compatible number');
  return value;
}

/** The only parser for project-authored configuration; evidence remains JSON. */
export class ConfigurationReader {
  /** Parses the restricted YAML data model and reports source-local diagnostics. */
  parse(path: string, text: string): ConfigurationSource {
    try {
      const document = parseDocument(text, { uniqueKeys: true, strict: true });
      if (document.errors.length) throw document.errors[0];
      if (document.warnings.length) throw document.warnings[0];
      visit(document, {
        /** Rejects YAML aliases rather than expanding hidden shared configuration. */
        Alias() {
          throw new Error('YAML aliases are not permitted');
        },
        /** Rejects custom tags outside the supported JSON-compatible data model. */
        Node(_key, node) {
          if (node.tag || node.anchor) throw new Error('YAML tags and anchors are not permitted');
        },
        /** Rejects unsupported mapping keys before schema validation. */
        Pair(_key, pair) {
          if (!isScalar(pair.key) || typeof pair.key.value !== 'string' || pair.key.value === '<<')
            throw new Error('Expected string mapping key; merge keys are not permitted');
        },
      });
      const value: unknown = path.endsWith('.json') ? JSON.parse(text) : document.toJS();
      const normalized = JSON.stringify(normalize(value));
      return { path, text, value, sourceHash: hash(text), normalizedHash: hash(normalized) };
    } catch (error) {
      throw new Error(`${path}: ${String(error)}`, { cause: error });
    }
  }

  /** Reads configuration bytes from a caller-selected local file. */
  file(path: string): ConfigurationSource {
    return this.parse(path, readFileSync(path, 'utf8'));
  }

  /** Reads configuration bytes from the immutable Git revision. */
  revision(repository: string, base: string, path: string): ConfigurationSource {
    const mode = git(repository, 'ls-tree', base, '--', path).split(' ')[0];
    if (!['100644', '100755'].includes(mode!))
      throw new Error(`Definition must be a regular tracked file: ${path}`);
    return this.parse(path, git(repository, 'show', `${base}:${path}`));
  }

  /** Resolves one logical definition and rejects simultaneous YAML and JSON identities. */
  definition(repository: string, base: string, stem: string): ConfigurationSource {
    const paths = git(
      repository,
      'ls-tree',
      '-r',
      '--name-only',
      base,
      '--',
      stem + '.yaml',
      stem + '.yml',
      stem + '.json',
    )
      .trim()
      .split('\n')
      .filter(Boolean);
    if (paths.length !== 1) throw new Error(`Missing or ambiguous definition: ${stem}`);
    return this.revision(repository, base, paths[0]!);
  }
}
