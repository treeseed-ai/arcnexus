import { validateContractSchemas } from './contract-schemas.js';
import { RevisionArtifacts } from './revision-artifacts.js';
import { posix } from 'node:path';
import type { Catalog, Component } from './components.js';
import { relativePath } from './config.js';
import { ConfigurationReader } from './configuration.js';
import { validateSchema } from './schema.js';

export interface ContractDefinition {
  id: string;
  version: string;
  kind: 'json-schema' | 'typescript';
  path: string;
  compatibility: string;
}

export interface ReferenceArtifact {
  path: string;
  text: string;
  sha256: string;
}

interface PatternDefinition {
  schemaVersion: 1;
  id: string;
  owner: string;
  purpose: string;
  applicability: string;
  document: string;
  examples: string[];
  operationIds: string[];
}

/** Captures referenced guidance and contracts without adding execution authority. */
export class ArchitectureReferences {
  constructor(
    private readonly repository: string,
    private readonly base: string,
    private readonly catalog: Catalog,
  ) {}

  resolve(): void {
    const contracts = this.contracts();
    for (const component of Object.values(this.catalog.components)) {
      if (component.schemaVersion !== 4) continue;
      component.providedSnapshots = [...contracts.values()].filter(
        (entry) => entry.owner === component.id,
      );
      component.patternSnapshots = (component.patternIds ?? []).map((id) => this.pattern(id));
      component.contractSnapshots = (component.consumes ?? []).map((reference) => {
        const contract = contracts.get(reference.id);
        if (!contract || contract.version !== reference.version)
          throw new Error(`Missing or incompatible contract: ${reference.id}`);
        return contract;
      });
    }
  }

  private contracts() {
    const result = new Map<
      string,
      ContractDefinition & { owner: string; artifact?: ReferenceArtifact }
    >();
    for (const component of Object.values(this.catalog.components)) {
      for (const definition of component.provides ?? []) {
        if (result.has(definition.id)) throw new Error(`Duplicate contract: ${definition.id}`);
        const path = this.ownedPath(component, definition.path);
        const artifact = this.artifact(path, component.repository);
        if (definition.kind === 'json-schema' && artifact) JSON.parse(artifact.text);
        result.set(definition.id, { ...definition, path, owner: component.id, artifact });
      }
    }
    validateContractSchemas(
      [...result.values()]
        .filter((entry) => entry.kind === 'json-schema' && entry.artifact)
        .map((entry) => JSON.parse(entry.artifact!.text)),
    );
    return result;
  }

  private pattern(id: string) {
    relativePath(id);
    if (id.includes('/')) throw new Error(`Invalid pattern identity: ${id}`);
    const source = new ConfigurationReader().definition(
      this.repository,
      this.base,
      `architecture/patterns/${id}`,
    );
    const pattern = validateSchema<PatternDefinition>('pattern', source.value);
    if (pattern.id !== id) throw new Error(`Pattern identity mismatch: ${id}`);
    const owner = this.catalog.components[pattern.owner];
    if (!owner) throw new Error(`Missing pattern owner: ${pattern.owner}`);
    for (const operation of pattern.operationIds)
      if (!owner.operationIds?.includes(operation))
        throw new Error(`Pattern check outside owner's operations: ${operation}`);
    if (!this.catalog.configurationSources.some((entry) => entry.path === source.path))
      this.catalog.configurationSources.push(source);
    const artifacts = [pattern.document, ...pattern.examples].map((p) =>
      this.artifact(this.ownedPath(owner, p), owner.repository),
    );
    if (artifacts.some((artifact) => !artifact))
      throw new Error(`Pattern requires repository binding: ${pattern.owner}`);
    return { ...pattern, artifacts: artifacts as ReferenceArtifact[] };
  }

  private ownedPath(owner: Component, path: string): string {
    relativePath(path);
    const resolved = posix.join(owner.repositoryRoot ?? '.', path);
    if (
      !owner.allowedWritePaths.some(
        (p) => p === '.' || resolved === p || resolved.startsWith(p + '/'),
      )
    )
      throw new Error(`Reference outside owner: ${owner.id}: ${resolved}`);
    return resolved;
  }

  private artifact(path: string, repository: string): ReferenceArtifact | undefined {
    const revision = this.catalog.repositoryRevisions?.[repository];
    if (!revision) return undefined;
    return new RevisionArtifacts(revision.source, revision.base).read(path);
  }
}
