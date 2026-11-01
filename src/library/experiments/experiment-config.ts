export { PromptExperimentResolver, type PromptExperimentInput } from './prompt-config.js';

import { accessSync, constants, readFileSync, realpathSync, statSync } from 'node:fs';
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
import { InputError } from '../architecture/config.js';
import { ConfigurationReader } from '../architecture/configuration.js';
import { validateSchema } from '../architecture/schema.js';
import { git } from '../operations/process.js';
import { resolveWorkday, type WorkdayInput } from '../workday/workday-config.js';
import { FixtureCatalog, type FixtureKind } from './fixture-catalog.js';

export type EvidenceMode = 'simulation' | 'live' | 'legacy-unspecified' | 'unselected';

export type Scenario = 'success' | 'repair' | 'boundary' | 'failure' | 'handoff';

interface LocalProject {
  path: string;
  base?: string;
  bindings?: string;
}

interface ExperimentBindings {
  schemaVersion: 1;
  runner: string;
  codexPath?: string;
  projects: Record<string, LocalProject>;
  tools: Record<string, string>;
  priorEvidence?: Record<string, NonNullable<Assignment['priorEvidence']>[number]>;
  issues?: Record<string, string>;
}

interface DefinitionCase {
  workday?: string;
  id: string;
  project: string;
  base?: string;
  component: string;
  assignment: string;
  expectedOutcome: string;
  acceptance: HostCheck[];
  maxAttempts?: number;
  faultInjection?: string;
  scenario?: Scenario;
  priorEvidenceIds?: string[];
}

interface Definition {
  schemaVersion: 1;
  modes: Array<'simulation' | 'live'>;
  cases: DefinitionCase[];
}

export interface ExperimentCase {
  workday?: WorkdayInput;
  id: string;
  project: string;
  base: string;
  component: string;
  assignment: Assignment;
  expectedOutcome: string;
  acceptance: HostCheck[];
  bindings?: string;
  issue?: string;
  maxAttempts?: number;
  faultInjection?: string;
  scenario?: Scenario;
  assignmentDigest?: string;
  resolvedAssignment?: ResolvedAssignment;
}

export interface ExperimentInput {
  configurationSources?: import('../architecture/configuration.js').ConfigurationSource[];
  schemaVersion: 1;
  runner: string;
  codexPath?: string;
  evidenceMode: EvidenceMode;
  cases: ExperimentCase[];
  files: Record<string, string>;
  digest: string;
}

const read = (path: string): unknown => new ConfigurationReader().file(path).value;

function executable(path: string): string {
  if (!isAbsolute(path) || !statSync(path).isFile())
    throw new InputError('Expected absolute executable');
  accessSync(path, constants.X_OK);
  return realpathSync(path);
}

export function fixtureFiles(selection: boolean | FixtureKind = false): Record<string, string> {
  const kind = typeof selection === 'boolean' ? (selection ? 'workday' : 'simulation') : selection;
  return new FixtureCatalog().files(kind);
}

function checkFixture(project: string, base: string, workday = false): void {
  const files = fixtureFiles(workday),
    paths = git(project, 'ls-tree', '-rz', '--name-only', base).split('\0').filter(Boolean);
  if (
    JSON.stringify(paths.sort()) !== JSON.stringify(Object.keys(files).sort()) ||
    paths.some(
      (path) =>
        Buffer.from(git(project, 'show', `${base}:${path}`)).toString('base64') !== files[path],
    )
  )
    throw new InputError('Simulation fixture contract differs from single-steward-v1');
}

function captureFiles(c: ExperimentCase, files: Record<string, string>): void {
  const resolved = resolveAssignment(c.project, c.base, c.component, {
    value: c.assignment,
    bindings: c.bindings ? loadBindings(c.bindings) : undefined,
  });
  c.assignmentDigest = resolved.digest;
  c.resolvedAssignment = resolved;
  const put = (path: string, bytes: string) => {
    if (Object.hasOwn(files, path) && files[path] !== bytes)
      throw new InputError('Conflicting captured input: ' + path);
    files[path] = bytes;
  };
  for (const artifact of resolved.artifacts) put(artifact.path, artifact.content);
  for (const item of resolved.priorEvidence)
    put(item.path, Buffer.from(item.content).toString('base64'));
  for (const command of c.acceptance)
    for (const path of command.artifacts) {
      if (!isAbsolute(path) || !statSync(path).isFile())
        throw new InputError('Expected absolute acceptance artifact');
      put(path, readFileSync(path).toString('base64'));
    }
  if (c.bindings) put(c.bindings, readFileSync(c.bindings).toString('base64'));
}

export function resolveExperiment(
  manifestPath: string,
  bindingPath: string,
  mode?: 'simulation' | 'live',
): ExperimentInput {
  try {
    return new ExperimentResolver(manifestPath, bindingPath, mode).resolve();
  } catch (error) {
    throw new InputError(String(error));
  }
}

/** Resolves ordered campaign cases, fixed checks and local bindings before execution. */
class ExperimentResolver {
  private configurationSources: import('../architecture/configuration.js').ConfigurationSource[] =
    [];

  private files: Record<string, string> = {};

  private ids = new Set<string>();

  private manifest: Definition;

  private bindings: ExperimentBindings;

  private tools: Record<string, string>;

  /** Validates manifest, bindings and mode, then resolves declared tool executables. */
  constructor(
    private manifestPath: string,
    bindingPath: string,
    private mode?: 'simulation' | 'live',
  ) {
    const value = this.read(manifestPath);
    this.manifest = validateSchema<Definition>(
      (value as { schemaVersion?: number }).schemaVersion === 2 ? 'experiment-v2' : 'experiment',
      value,
    );
    this.bindings = validateSchema<ExperimentBindings>(
      'experiment-bindings',
      this.read(bindingPath),
    );
    if (mode && !this.manifest.modes.includes(mode))
      throw new InputError('Experiment does not support selected mode');
    if (mode === 'live' && !this.bindings.codexPath)
      throw new InputError('Live mode requires a bound Codex executable');
    this.tools = Object.fromEntries(
      Object.entries(this.bindings.tools).map(([key, path]) => [key, executable(path)]),
    );
  }

  /** Loads the requested content through this component boundary. */
  private read(path: string): unknown {
    const source = new ConfigurationReader().file(path);
    this.configurationSources.push(source);
    return structuredClone(source.value);
  }

  /** Resolves captured inputs and rejects unsupported or inconsistent configuration. */
  resolve(): ExperimentInput {
    const runner = realpathSync(this.bindings.runner);
    if (!isAbsolute(this.bindings.runner) || !statSync(runner).isFile())
      throw new InputError('Expected absolute supervising runner');
    const cases = this.manifest.cases.map((c) => this.resolveCase(c));
    const data = {
      configurationSources: this.configurationSources,
      schemaVersion: 1 as const,
      runner,
      codexPath: this.bindings.codexPath ? executable(this.bindings.codexPath) : undefined,
      evidenceMode: this.mode ?? ('unselected' as const),
      supportedModes: this.manifest.modes,
      cases,
      files: this.files,
    };
    return { ...data, digest: digest(JSON.stringify(data)) };
  }

  /** Resolves a fixed command through the caller’s tool bindings. */
  private command(check: HostCheck, directory: string): HostCheck {
    const executablePath = Object.hasOwn(this.tools, check.command)
      ? this.tools[check.command]!
      : isAbsolute(check.command)
        ? executable(check.command)
        : undefined;
    if (!executablePath) throw new InputError('Missing command tool binding: ' + check.command);
    const paths = new Map(check.artifacts.map((path) => [path, resolve(directory, path)]));
    return {
      ...check,
      command: executablePath,
      args: check.args.map((arg) => paths.get(arg) ?? arg),
      artifacts: [...paths.values()],
    };
  }

  /** Validates one ordered campaign case before any execution. */
  private resolveCase(c: DefinitionCase): ExperimentCase {
    if (this.ids.has(c.id)) throw new InputError('Duplicate experiment case identity');
    this.ids.add(c.id);
    const project = Object.hasOwn(this.bindings.projects, c.project)
      ? this.bindings.projects[c.project]
      : undefined;
    if (!project || !isAbsolute(project.path))
      throw new InputError('Missing absolute project binding: ' + c.project);
    const base = c.base ?? project.base;
    if (!base || !/^[a-f0-9]{40}$/.test(base))
      throw new InputError('Experiment requires immutable revision');
    const captured = resolveBase(project.path, base);
    if (captured.base !== base) throw new InputError('Revision is not an immutable commit');
    if (
      this.mode === 'simulation' ||
      (this.manifest.modes.length === 1 && this.manifest.modes[0] === 'simulation')
    ) {
      if (!c.scenario) throw new InputError('Simulation requires a fixed scenario');
      checkFixture(captured.source, base, !!c.workday);
    }
    if (this.mode === 'live' && c.scenario)
      throw new InputError('Scripted scenarios cannot be live qualification');
    return c.workday
      ? this.workdayCase(c, project, captured.source, base)
      : this.assignmentCase(c, project, captured.source, base);
  }

  /** Resolves a captured workday case through the existing coordination contract. */
  private workdayCase(
    c: DefinitionCase,
    project: LocalProject,
    source: string,
    base: string,
  ): ExperimentCase {
    if (this.mode === 'simulation' && c.scenario !== 'handoff')
      throw new InputError('Workday simulation requires handoff scenario');
    const workday = resolveWorkday(
      resolve(dirname(this.manifestPath), c.workday!),
      source,
      base,
      project.bindings,
      this.tools,
    );
    const result: ExperimentCase = {
      ...c,
      workday,
      component: workday.requester.resolved.componentId,
      assignment: workday.requester.resolved.assignment,
      project: source,
      base,
      acceptance: c.acceptance.map((check) => this.command(check, dirname(this.manifestPath))),
      bindings: project.bindings,
      issue: this.bindings.issues?.[c.id],
    };
    this.validateWorkdayOwners(workday);
    this.captureWorkday(result, workday);
    return result;
  }

  /** Rejects unsupported participant ownership or repository combinations. */
  private validateWorkdayOwners(workday: WorkdayInput): void {
    if (
      this.mode === 'simulation' &&
      (workday.requester.resolved.componentId !== 'gateway' ||
        workday.recipient.resolved.componentId !== 'identity')
    )
      throw new InputError('Incompatible handoff fixture owners');
  }

  /** Snapshots workday inputs for later integrity checks and inspection. */
  private captureWorkday(result: ExperimentCase, workday: WorkdayInput): void {
    captureFiles(result, this.files);
    for (const participant of [workday.requester, workday.recipient]) {
      for (const a of participant.resolved.artifacts) this.files[a.path] = a.content;
      for (const e of participant.resolved.priorEvidence)
        this.files[e.path] = Buffer.from(e.content).toString('base64');
    }
    for (const a of workday.artifacts) this.files[a.path] = a.content;
  }

  /** Loads the case assignment from its declared manifest-relative reference. */
  private assignment(c: DefinitionCase): Assignment {
    const path = resolve(dirname(this.manifestPath), c.assignment),
      assignment = validateSchema<Assignment>('assignment', this.read(path));
    if (
      (this.mode === 'simulation' ||
        (this.manifest.modes.length === 1 && this.manifest.modes[0] === 'simulation')) &&
      (c.component !== 'sample' ||
        assignment.kind !== 'change' ||
        assignment.changeType === 'documentation' ||
        assignment.acceptanceCriteria.length !== 1 ||
        (c.scenario === 'repair' && c.maxAttempts !== 2))
    )
      throw new InputError('Assignment is incompatible with the fixed simulation fixture contract');
    assignment.hostChecks = assignment.hostChecks.map((check) =>
      this.command(check, dirname(path)),
    );
    if (assignment.priorEvidence)
      assignment.priorEvidence = assignment.priorEvidence.map((ref) => ({
        ...ref,
        path: resolve(dirname(path), ref.path),
      }));
    this.addPriorEvidence(assignment, c.priorEvidenceIds ?? []);
    return assignment;
  }

  /** Captures explicitly selected historical findings without granting new authority. */
  private addPriorEvidence(assignment: Assignment, ids: string[]): void {
    for (const id of ids) {
      const ref =
        this.bindings.priorEvidence && Object.hasOwn(this.bindings.priorEvidence, id)
          ? this.bindings.priorEvidence[id]
          : undefined;
      if (!ref) throw new InputError('Missing prior evidence binding: ' + id);
      (assignment.priorEvidence ??= []).push(ref);
    }
  }

  /** Resolves one steward case and its expected outcome and acceptance. */
  private assignmentCase(
    c: DefinitionCase,
    project: LocalProject,
    source: string,
    base: string,
  ): ExperimentCase {
    const assignment = this.assignment(c);
    const result: ExperimentCase = {
      ...c,
      workday: undefined,
      project: source,
      base,
      assignment,
      acceptance: c.acceptance.map((check) => this.command(check, dirname(this.manifestPath))),
      bindings: project.bindings,
      issue:
        this.bindings.issues && Object.hasOwn(this.bindings.issues, c.id)
          ? this.bindings.issues[c.id]
          : undefined,
    };
    captureFiles(result, this.files);
    return result;
  }
}

type LegacyManifest = {
  schemaVersion: 1;
  runner: string;
  codexPath?: string;
  cases: Array<Omit<ExperimentCase, 'assignment'> & { assignment: string }>;
};

export function resolveLegacy(path: string): ExperimentInput {
  const manifest = validateSchema<LegacyManifest>('campaign', read(path));
  if (!isAbsolute(manifest.runner) || (manifest.codexPath && !isAbsolute(manifest.codexPath)))
    throw new InputError('Runner and Codex executable must be absolute');
  const files: Record<string, string> = {},
    ids = new Set<string>();
  const cases = manifest.cases.map((c) => {
    if (ids.has(c.id)) throw new InputError('Duplicate case identity');
    ids.add(c.id);
    if (!isAbsolute(c.project) || c.acceptance.some((check) => !isAbsolute(check.command)))
      throw new InputError('Legacy projects and acceptance executables must be absolute');
    const result = {
      ...c,
      project: resolveBase(c.project, c.base).source,
      assignment: validateSchema<Assignment>('assignment', read(c.assignment)),
    };
    captureFiles(result, files);
    return result;
  });
  const data = {
    schemaVersion: 1 as const,
    runner: realpathSync(manifest.runner),
    codexPath: manifest.codexPath,
    evidenceMode: 'legacy-unspecified' as const,
    cases,
    files,
  };
  return { ...data, digest: digest(JSON.stringify(data)) };
}
