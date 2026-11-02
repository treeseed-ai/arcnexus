import type { Catalog, Component } from '../architecture/components.js';
import { environment, InputError, type Environment } from '../architecture/config.js';
import { ExecutionContext } from '../architecture/execution-context.js';
import { OperationArguments, OperationOrder } from '../operations/operation-definition.js';
import type { Operation } from '../operations/operations.js';
import type { DiscoveredSuite } from './discovery.js';
import type { TestProfile } from './profile.js';

export interface TestOperationPlan {
  catalog: Component[];
  environment: Environment;
  steps: Array<{ operation: Operation; purpose: 'production' | 'tests' | 'test-run' }>;
}

/** Captures test execution from shared definitions and validated current suite selections. */
export class TestOperationPlanning {
  /** Holds immutable architecture while current suites supply only host-validated selection paths. */
  constructor(private readonly catalog: Catalog) {}

  /** Rejects mixed execution families and captures all finite operations before the first launch. */
  capture(suites: DiscoveredSuite[], profiles: TestProfile[]): TestOperationPlan | undefined {
    if (profiles.every((p) => p.schemaVersion === 1)) return undefined;
    const owners = [...new Set(suites.map((s) => s.component))].map(
      (id) => this.catalog.components[id]!,
    );
    if (profiles.some((p) => p.schemaVersion !== 2) || owners.some((c) => c.schemaVersion !== 5))
      throw new InputError(
        'Shared test operations require minimal components and unmixed version-two profiles',
      );
    new ExecutionContext().validateProfiles(
      this.catalog,
      owners.map((c) => c.executionProfile),
    );
    const steps = owners.flatMap((owner) => this.owner(owner, suites, profiles));
    const source = this.catalog.configurationSources.find((s) =>
      /architecture\/environment\.(json|ya?ml)$/.test(s.path),
    );
    const env = environment(source?.value, Object.values(this.catalog.operations));
    if (env.schemaVersion !== 4) throw new InputError('Shared tests require environment schema 4');
    return { catalog: Object.values(this.catalog.components), environment: env, steps };
  }

  /** Resolves the owner's runner and preparation references without accepting arbitrary command recipes. */
  private owner(
    owner: Component,
    suites: DiscoveredSuite[],
    profiles: TestProfile[],
  ): TestOperationPlan['steps'] {
    const profile = profiles.find((p) => p.id === owner.testProfile)!;
    if (profile.schemaVersion !== 2) throw new InputError('Shared test profile required');
    const context = {
      ownerId: owner.id,
      ownedPaths: owner.allowedWritePaths,
      packageRoot: owner.repositoryRoot!,
      testOutputRoot: profile.outputRoot,
      selectedTestFiles: suites.filter((s) => s.component === owner.id).map((s) => s.compiled),
    };
    const references = [
      ...profile.preparation,
      { operation: profile.run, purpose: 'test-run' as const },
    ];
    return references.flatMap((step) =>
      this.operations(owner, step).map((definition) => ({
        operation: new OperationArguments().capture(definition, context),
        purpose: step.purpose,
      })),
    );
  }

  /** Validates required usages and finite prerequisite definitions before resolving any arguments. */
  private operations(owner: Component, step: { operation: string; purpose: string }): Operation[] {
    const usages = step.purpose === 'test-run' ? ['agent', 'verify'] : ['setup', 'refresh'];
    if (
      !usages.some((usage) => owner.operationPlan?.[usage]?.some((op) => op.id === step.operation))
    )
      throw new InputError(
        `Test operation ${step.operation} requires owner usage ${usages.join(' or ')}`,
      );
    const definitions = new OperationOrder(this.catalog.operations).resolve([step.operation]);
    for (const definition of definitions)
      if (definition.kind !== 'command' || definition.schemaVersion !== 4)
        throw new InputError(`Finite shared test command required: ${definition.id}`);
    return definitions;
  }
}
