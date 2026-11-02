import { diagnosticExcerpt } from '../operations/diagnostics.js';
import {
  loadBindings,
  bindingEnvironment,
  boundCommand,
  type Bindings,
} from '../architecture/bindings.js';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadCatalog, type Catalog, type Component } from '../architecture/components.js';
import { InputError } from '../architecture/config.js';
import { execute, git, type CommandResult } from '../operations/process.js';
import { stateRoot } from '../workspace/state.js';
import { TestDiscovery, matches, type DiscoveredSuite, type TestFilters } from './discovery.js';
import { loadTestProfile, type TestProfile } from './profile.js';
import { TestOperationPlanning, type TestOperationPlan } from './operation-plan.js';
import { SharedTestExecution } from './operation-execution.js';

export interface TestSelection {
  project: string;
  bindings: Bindings;
  revision: string;
  inference: false;
  suites: DiscoveredSuite[];
  profiles: TestProfile[];
  operationPlan?: TestOperationPlan;
  requiresSharedOperations?: boolean;
}

export interface TestExecution {
  schemaVersion: 1;
  output: string | null;
  outputTruncated: boolean;
  selection: TestSelection;
  status: 'running' | 'passed' | 'failed' | 'cancelled';
  exitCode: number;
  evidence: string;
  commands: CommandResult[];
  productionBuild: 'caller-prepared' | 'service-prepared';
  error?: string;
  operationEvidence?: string;
}

/** Selects owner-declared suites and executes their fixed Node profile with retained evidence. */
export class ComponentTesting {
  /** Resolves the requested view without modifying candidate source. */
  inspect(
    project: string,
    filters: TestFilters = {},
    bindings: Bindings = loadBindings(),
  ): TestSelection {
    try {
      return this.selection(project, filters, bindings);
    } catch (error) {
      throw error instanceof InputError ? error : new InputError(String(error));
    }
  }

  /** Combines captured catalog/profile authority with current discovered test metadata. */
  private selection(project: string, filters: TestFilters, bindings: Bindings): TestSelection {
    this.filters(filters);
    project = resolve(project);
    const revision = git(project, 'rev-parse', 'HEAD').trim();
    const catalog = loadCatalog(project, revision, bindings);
    const owners = this.owners(catalog, filters.component);
    const { profiles, suites } = this.discover(project, revision, owners);
    const selected = suites.filter((suite) => matches(suite, filters));
    if (!selected.length) throw new InputError('No tests match the required selection');
    const selection: TestSelection = {
      project,
      bindings,
      revision,
      inference: false,
      requiresSharedOperations: owners.some((owner) => owner.schemaVersion === 5),
      suites: selected,
      profiles: [...profiles.values()].filter((profile) =>
        selected.some((suite) => suite.profile === profile.id),
      ),
    };
    selection.operationPlan = new TestOperationPlanning(catalog).capture(
      selected,
      selection.profiles,
    );
    return selection;
  }

  /** Captures each shared profile once and discovers suites independently for every selected owner. */
  private discover(project: string, revision: string, owners: Component[]) {
    const profiles = new Map<string, TestProfile>();
    const suites: DiscoveredSuite[] = [];
    for (const owner of owners) {
      const profile =
        profiles.get(owner.testProfile!) ?? loadTestProfile(project, revision, owner.testProfile!);
      profiles.set(profile.id, profile);
      suites.push(...new TestDiscovery(project).discover(owner, profile.outputRoot));
    }
    return { profiles, suites };
  }

  /** Selects executable test owners without granting inherited container profiles their own suites. */
  private owners(catalog: Catalog, id?: string) {
    const owners = Object.values(catalog.components).filter((owner) =>
      id
        ? owner.id === id
        : Boolean(owner.testProfile) && !['platform', 'package'].includes(owner.type),
    );
    if (!owners.length) throw new InputError(`Unknown component: ${id}`);
    for (const owner of owners) {
      if (['platform', 'package'].includes(owner.type))
        throw new InputError(`Container has no test ownership: ${owner.id}`);
      if (!owner.testProfile) throw new InputError(`No test profile for ${owner.id}`);
    }
    return owners;
  }

  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  async run(
    selection: TestSelection,
    signal: AbortSignal,
    productionBuilt = false,
  ): Promise<TestExecution> {
    if (selection.requiresSharedOperations && !selection.operationPlan)
      throw new InputError(
        'Migrate test profile to schemaVersion 2 before executing minimal components',
      );
    const result = this.record(selection, productionBuilt);
    try {
      await this.execute(result, signal, productionBuilt);
      result.status = 'passed';
      result.exitCode = 0;
    } catch (error) {
      const cancelled = signal.aborted && signal.reason?.name !== 'TimeoutError';
      result.status = cancelled ? 'cancelled' : 'failed';
      result.exitCode = cancelled ? 130 : 1;
      result.error = String(error);
    }
    const last = result.commands.at(-1);
    if (last) this.captureOutput(result, last.log);
    this.save(result);
    return result;
  }

  /** Publishes shared-operation evidence before dispatch so interrupted CLI runs remain traceable. */
  private async execute(
    result: TestExecution,
    signal: AbortSignal,
    productionBuilt: boolean,
  ): Promise<void> {
    if (!result.selection.operationPlan) return this.legacy(result, signal, productionBuilt);
    const execution = new SharedTestExecution(result, signal);
    this.save(result);
    await execution.run(productionBuilt);
  }

  /** Preserves existing test profiles during explicit migration to shared operations. */
  private async legacy(
    result: TestExecution,
    signal: AbortSignal,
    productionBuilt: boolean,
  ): Promise<void> {
    await this.prepare(result, signal, productionBuilt);
    await this.command(
      result,
      {
        command: result.selection.bindings.tools.node ?? process.execPath,
        args: ['--test', ...result.selection.suites.map((suite) => suite.compiled)],
      },
      signal,
    );
  }

  /** Creates the evidence record before subsequent lifecycle work begins. */
  private record(selection: TestSelection, productionBuilt: boolean): TestExecution {
    const evidence = join(stateRoot(), 'test-runs', randomUUID());
    mkdirSync(evidence, { recursive: true, mode: 0o700 });
    const result: TestExecution = {
      schemaVersion: 1,
      status: 'running',
      exitCode: 1,
      output: null,
      outputTruncated: false,
      selection,
      evidence,
      commands: [],
      productionBuild: productionBuilt ? 'caller-prepared' : 'service-prepared',
    };
    this.save(result);
    return result;
  }

  /** Rejects unsupported selection filters before discovering or running tests. */
  private filters(filters: TestFilters): void {
    if (filters.level && !['unit', 'integration', 'acceptance'].includes(filters.level))
      throw new InputError(`Invalid test level: ${filters.level}`);
    if (filters.category && filters.category !== 'regression')
      throw new InputError(`Invalid test category: ${filters.category}`);
  }

  /** Establishes the prerequisites required by the subsequent execution. */
  private async prepare(
    result: TestExecution,
    signal: AbortSignal,
    productionBuilt: boolean,
  ): Promise<void> {
    const seen = new Set<string>();
    for (const profile of result.selection.profiles) {
      if (profile.schemaVersion !== 1)
        throw new InputError('Shared test profile cannot execute legacy commands');
      for (const step of profile.preparation) {
        const identity = JSON.stringify(step);
        if (seen.has(identity) || (productionBuilt && step.purpose === 'production')) continue;
        seen.add(identity);
        await this.command(result, step, signal);
      }
    }
  }

  /** Runs fixed preparation or test commands and persists output even on failure. */
  private async command(
    result: TestExecution,
    command: { command: string; args: string[] },
    signal: AbortSignal,
  ): Promise<void> {
    const log = join(result.evidence, `${result.commands.length}.log`);
    try {
      result.commands.push(
        await execute(
          boundCommand(result.selection.bindings, command),
          result.selection.project,
          log,
          signal,
          {
            env: { ...bindingEnvironment(result.selection.bindings), NODE_TEST_CONTEXT: undefined },
          },
        ),
      );
    } catch (error) {
      const commandResult = (error as { commandResult?: CommandResult }).commandResult;
      if (commandResult) result.commands.push(commandResult);
      throw error;
    } finally {
      this.captureOutput(result, log);
      this.save(result);
    }
  }

  /** Retains a bounded excerpt while keeping the complete command log separately. */
  private captureOutput(result: TestExecution, log: string): void {
    if (!existsSync(log)) return;
    const output = readFileSync(log);
    const excerpt = diagnosticExcerpt(output);
    result.output = excerpt.output;
    result.outputTruncated = excerpt.truncated;
  }

  /** Persists the current evidence so later inspection can reconstruct this state. */
  private save(result: TestExecution): void {
    writeFileSync(
      join(result.evidence, 'result.json.tmp'),
      JSON.stringify(result, null, 2) + '\n',
      {
        mode: 0o600,
      },
    );
    renameSync(join(result.evidence, 'result.json.tmp'), join(result.evidence, 'result.json'));
  }
}
