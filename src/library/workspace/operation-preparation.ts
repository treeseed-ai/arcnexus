import { mkdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ancestry, loadCatalog, type Component, type Catalog } from '../architecture/components.js';
import { environment, InputError } from '../architecture/config.js';
import { ConfigurationReader } from '../architecture/configuration.js';
import { ExecutionContext } from '../architecture/execution-context.js';
import type { Bindings } from '../architecture/bindings.js';
import { OperationExecution } from '../operations/operation-execution.js';
import type { Operation } from '../operations/operations.js';
import { memberEnvironment, type Member } from './members.js';
import { save, type RecordData } from './state.js';

/** Captures and executes preparation from shared definitions without inventing engineering assignments. */
export class WorkspaceOperations {
  /** Binds preparation evidence and cancellation to the supervising workspace run. */
  constructor(
    private readonly root: string,
    private readonly record: RecordData,
    private readonly signal: AbortSignal,
  ) {}

  /** Resolves operation authority from the source revision, independently of retained candidate edits. */
  static capture(
    record: RecordData,
    project: string,
    authorityBase: string,
    packageId?: string,
  ): void {
    if (record.environment.schemaVersion !== 4) return;
    const catalog = loadCatalog(record.source, authorityBase, record.bindings as Bindings);
    this.validate(catalog);
    record.operationCatalog = Object.values(catalog.components);
    record.preparationOwners = this.owners(catalog, record.source, project, packageId);
    record.environment = environment(
      new ConfigurationReader().definition(record.source, authorityBase, 'architecture/environment')
        .value,
      Object.values(catalog.operations),
    );
    const bindingSource = (record.bindings as Bindings).configurationSource;
    record.configurationSources = [
      ...catalog.configurationSources,
      ...(bindingSource ? [bindingSource] : []),
    ];
    for (const member of (record.members ?? []) as Member[])
      member.definition = record.environment.workspace!.dependencies.find(
        (d) => d.id === member.id,
      )!;
  }

  /** Preserves an already selected package when a retained runtime passes the repository root. */
  private static owners(
    catalog: Catalog,
    source: string,
    project: string,
    packageId?: string,
  ): string[] {
    const platform = Object.values(catalog.components).find((c) => c.type === 'platform');
    const selected = packageId
      ? catalog.components[packageId]
      : new ExecutionContext().selectPackage(
          catalog,
          relative(source, resolve(project)),
          platform?.defaultPackage,
        );
    if (
      !selected ||
      selected.type !== 'package' ||
      selected.repository !== catalog.primaryRepository
    )
      throw new InputError('Preparation requires a declared package in the primary repository');
    return Object.values(catalog.components)
      .filter((c) => ancestry(catalog, c.id).some((a) => a.id === selected.id))
      .map((c) => c.id);
  }

  /** Refuses mixed executable families and obsolete profile budgets before dispatch. */
  private static validate(catalog: Catalog): void {
    const components = Object.values(catalog.components);
    if (components.some((c) => c.schemaVersion !== 5))
      throw new InputError('Environment schema 4 requires version-five component definitions');
    new ExecutionContext().validateProfiles(
      catalog,
      components
        .filter((c) => !['platform', 'package'].includes(c.type))
        .map((c) => c.executionProfile),
    );
  }

  /** Runs the selected package's finite preparation without allowing incomplete source changes. */
  async primary(): Promise<void> {
    const assignment = this.record.resolvedAssignment as { componentId: string } | undefined;
    const ids = new Set(
      assignment ? [assignment.componentId] : (this.record.preparationOwners as string[]),
    );
    const owners = this.catalog().filter((c) => ids.has(c.id));
    await this.execute(this.record, owners);
  }

  /** Prepares a mounted repository under its own read-only source authority and retained child evidence. */
  async member(member: Member): Promise<void> {
    const owners = this.catalog().filter((c) => c.repository === member.id);
    const child: RecordData = {
      ...this.record,
      id: `${this.record.id}-${member.id}`,
      source: member.source,
      workspace: member.workspace,
      commonDir: member.commonDir,
      base: member.base,
      commands: [],
      environment: { ...memberEnvironment(member), schemaVersion: 4 },
      parentRunId: this.record.id,
      operationInvocations: [],
      status: 'preparing',
    };
    delete child.resolvedAssignment;
    mkdirSync(join(this.root, 'runs', child.id), { recursive: true, mode: 0o700 });
    save(this.root, child);
    await this.execute(child, owners);
    child.status = 'prepared';
    save(this.root, child);
  }

  /** Orders lifecycle classes and deduplicates identical resolved commands only within this checkpoint. */
  private async execute(record: RecordData, owners: Component[]): Promise<void> {
    const seen = new Set<string>();
    for (const usage of ['preflight', 'setup']) {
      for (const operation of owners.flatMap((c) => c.operationPlan?.[usage] ?? [])) {
        const identity = this.identity(operation);
        if (seen.has(identity)) continue;
        seen.add(identity);
        record.commands.push(
          await new OperationExecution(this.root, record, this.signal).run(operation, usage),
        );
      }
    }
  }

  /** Requires the immutable catalog snapshot captured before any setup command was dispatched. */
  private catalog(): Component[] {
    if (!Array.isArray(this.record.operationCatalog))
      throw new Error('Missing captured setup authority');
    return this.record.operationCatalog as Component[];
  }

  /** Includes complete resolved execution semantics while excluding unused owner context. */
  private identity(operation: Operation): string {
    const { resolvedContext: _context, ...resolved } = operation;
    return JSON.stringify(resolved);
  }
}
