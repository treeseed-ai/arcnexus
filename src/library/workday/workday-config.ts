import { readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import {
  digest,
  resolveAssignment,
  resolveBase,
  type Assignment,
  type HostCheck,
  type ResolvedAssignment,
} from '../architecture/assignment.js';
import { loadBindings } from '../architecture/bindings.js';
import { covered } from '../architecture/components.js';
import { commands, InputError, type Command } from '../architecture/config.js';
import { ConfigurationReader, type ConfigurationSource } from '../architecture/configuration.js';
import { validateSchema } from '../architecture/schema.js';

interface Participant {
  component: string;
  assignment: string;
  maxAttempts?: number;
  refresh: Command[];
}

interface Definition {
  schemaVersion: 1 | 3;
  timeoutSeconds?: number;
  maxCoordinationTurns?: number;
  requester: Participant;
  recipient: Participant;
  dependency: { from: string; to: string; contract: string; delivery: string };
  acceptance: HostCheck[];
}

export interface WorkdayParticipant {
  resolved: ResolvedAssignment;
  maxAttempts?: number;
  refresh: Command[];
}

export interface WorkdayInput {
  configurationSources?: import('../architecture/configuration.js').ConfigurationSource[];
  schemaVersion: 1 | 3;
  timeoutSeconds?: number;
  maxCoordinationTurns?: number;
  source: string;
  base: string;
  requester: WorkdayParticipant;
  recipient: WorkdayParticipant;
  dependency: Definition['dependency'];
  acceptance: HostCheck[];
  artifacts: ResolvedAssignment['artifacts'];
  digest: string;
}

export function resolveWorkday(
  path: string,
  project: string,
  base?: string,
  bindingsPath?: string,
  tools: Record<string, string> = {},
  initializerModel?: string,
): WorkdayInput {
  try {
    return new WorkdayResolver(
      path,
      project,
      base,
      bindingsPath,
      tools,
      initializerModel,
    ).resolve();
  } catch (error) {
    throw new InputError(String(error));
  }
}

/** Captures two disjoint owners and their permitted dependency before coordination begins. */
class WorkdayResolver {
  private sources: ConfigurationSource[];

  private definition: Definition;

  private selection: ReturnType<typeof resolveBase>;

  private bindings: ReturnType<typeof loadBindings>;

  /** Captures the dependencies and state used throughout this instance’s lifecycle. */
  constructor(
    private path: string,
    project: string,
    base: string | undefined,
    bindingsPath: string | undefined,
    private tools: Record<string, string>,
    private initializerModel?: string,
  ) {
    this.sources = [new ConfigurationReader().file(path)];
    this.definition = validateSchema<Definition>('workday', this.sources[0]!.value);
    this.selection = resolveBase(project, base);
    this.bindings = loadBindings(bindingsPath);
    if (this.bindings.configurationSource) this.sources.push(this.bindings.configurationSource);
  }

  /** Resolves captured inputs and rejects unsupported or inconsistent configuration. */
  resolve(): WorkdayInput {
    const requester = this.participant(this.definition.requester);
    const recipient = this.participant(this.definition.recipient);
    this.validateOwners(requester, recipient);
    const acceptance = this.checks(this.definition.acceptance, dirname(this.path));
    const data = {
      configurationSources: this.sources,
      schemaVersion: this.definition.schemaVersion,
      timeoutSeconds: this.definition.timeoutSeconds,
      maxCoordinationTurns: this.definition.maxCoordinationTurns,
      ...this.selection,
      requester,
      recipient,
      dependency: this.definition.dependency,
      acceptance,
      artifacts: this.artifacts(acceptance),
    };
    return { ...data, digest: digest(JSON.stringify(data)) };
  }

  /** Handles checks within this component’s captured contract. */
  private checks(checks: HostCheck[], directory: string): HostCheck[] {
    return checks.map((check) => ({
      ...check,
      command: this.tools[check.command] ?? this.bindings.tools[check.command] ?? check.command,
      artifacts: check.artifacts.map((path) => resolve(directory, path)),
      args: check.args.map((arg) =>
        check.artifacts.includes(arg) ? resolve(directory, arg) : arg,
      ),
    }));
  }

  /** Handles assignment within this component’s captured contract. */
  private assignment(path: string): Assignment {
    const file = resolve(dirname(this.path), path);
    const source = new ConfigurationReader().file(file);
    this.sources.push(source);
    const value = validateSchema<Assignment>('assignment', structuredClone(source.value));
    value.hostChecks = this.checks(value.hostChecks, dirname(file));
    value.priorEvidence = value.priorEvidence?.map((ref) => ({
      ...ref,
      path: resolve(dirname(file), ref.path),
    }));
    return value;
  }

  /** Handles participant within this component’s captured contract. */
  private participant(participant: Participant): WorkdayParticipant {
    const value = this.assignment(participant.assignment);
    const resolved = resolveAssignment(
      this.selection.source,
      this.selection.base,
      participant.component,
      {
        value,
        bindings: this.bindings,
        initializerModel: this.initializerModel,
      },
    );
    commands(participant.refresh);
    if (
      resolved.executionProfile.model !== 'gpt-6-luna' ||
      resolved.executionProfile.reasoning !== 'medium'
    )
      throw new InputError('Workdays require Luna/medium profiles');
    return {
      resolved,
      maxAttempts: participant.maxAttempts ?? resolved.executionProfile.maxAttempts,
      refresh: participant.refresh,
    };
  }

  /** Checks declared owner paths and directory-granularity exceptions. */
  private validateOwners(requester: WorkdayParticipant, recipient: WorkdayParticipant): void {
    if (
      requester.resolved.componentId === recipient.resolved.componentId ||
      this.definition.dependency.from !== requester.resolved.componentId ||
      this.definition.dependency.to !== recipient.resolved.componentId
    )
      throw new InputError('Invalid two-owner dependency edge');
    const a = requester.resolved.context.at(-1)!,
      b = recipient.resolved.context.at(-1)!;
    if (
      a.repository !== b.repository ||
      (requester.resolved.environment.workspace &&
        a.repository !== requester.resolved.environment.workspace.primary.id)
    )
      throw new InputError('Both owners must belong to the same primary repository');
    if (
      requester.resolved.allowedWritePaths.some(
        (path) =>
          covered(path, recipient.resolved.allowedWritePaths) ||
          recipient.resolved.allowedWritePaths.some((other) => covered(other, [path])),
      )
    )
      throw new InputError('Workday owner writable scopes overlap');
  }

  /** Handles artifacts within this component’s captured contract. */
  private artifacts(checks: HostCheck[]): ResolvedAssignment['artifacts'] {
    const artifacts: ResolvedAssignment['artifacts'] = [],
      ids = new Set<string>();
    for (const check of checks) {
      commands([check]);
      if (!isAbsolute(check.command) || ids.has(check.id))
        throw new InputError('Independent checks require absolute executable and unique identity');
      ids.add(check.id);
      for (const path of check.artifacts) {
        if (!statSync(path).isFile()) throw new InputError('Expected acceptance artifact');
        const bytes = readFileSync(path);
        if (!artifacts.some((artifact) => artifact.path === path))
          artifacts.push({ path, content: bytes.toString('base64'), sha256: digest(bytes) });
      }
    }
    return artifacts;
  }
}
