import { accessSync, constants, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  maxAttempts?: 1 | 2;
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
  maxAttempts?: 1 | 2;
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
export function fixtureFiles(workday = false): Record<string, string> {
  const root = fileURLToPath(
      new URL(workday ? '../../fixtures/workday' : '../../fixtures/simulation', import.meta.url),
    ),
    out: Record<string, string> = {};
  const visit = (directory: string) => {
    for (const entry of readdirSync(join(root, directory), {
      withFileTypes: true,
    })) {
      const path = directory ? directory + '/' + entry.name : entry.name;
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) out[path] = readFileSync(join(root, path)).toString('base64');
      else throw new Error('Invalid bundled fixture');
    }
  };
  visit('');
  return out;
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
    const configurationSources: import('../architecture/configuration.js').ConfigurationSource[] =
      [];
    const read = (path: string) => {
      const source = new ConfigurationReader().file(path);
      configurationSources.push(source);
      return structuredClone(source.value);
    };
    const manifestValue = read(manifestPath);
    const manifest = validateSchema<Definition>(
        (manifestValue as { schemaVersion?: number }).schemaVersion === 2
          ? 'experiment-v2'
          : 'experiment',
        manifestValue,
      ),
      bindings = validateSchema<ExperimentBindings>('experiment-bindings', read(bindingPath));
    if (mode && !manifest.modes.includes(mode))
      throw new InputError('Experiment does not support selected mode');
    if (mode === 'live' && !bindings.codexPath)
      throw new InputError('Live mode requires a bound Codex executable');
    const runner = realpathSync(bindings.runner);
    if (!isAbsolute(bindings.runner) || !statSync(runner).isFile())
      throw new InputError('Expected absolute supervising runner');
    const tools = Object.fromEntries(
      Object.entries(bindings.tools).map(([key, path]) => [key, executable(path)]),
    );
    const files: Record<string, string> = {},
      ids = new Set<string>();
    const command = (check: HostCheck, directory: string): HostCheck => {
      const executablePath = Object.hasOwn(tools, check.command)
        ? tools[check.command]!
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
    };
    const cases = manifest.cases.map((c) => {
      if (ids.has(c.id)) throw new InputError('Duplicate experiment case identity');
      ids.add(c.id);
      const project = Object.hasOwn(bindings.projects, c.project)
        ? bindings.projects[c.project]
        : undefined;
      if (!project || !isAbsolute(project.path))
        throw new InputError('Missing absolute project binding: ' + c.project);
      const base = c.base ?? project.base;
      if (!base || !/^[a-f0-9]{40}$/.test(base))
        throw new InputError('Experiment requires immutable revision');
      const captured = resolveBase(project.path, base);
      if (captured.base !== base) throw new InputError('Revision is not an immutable commit');
      if (
        mode === 'simulation' ||
        (manifest.modes.length === 1 && manifest.modes[0] === 'simulation')
      ) {
        if (!c.scenario) throw new InputError('Simulation requires a fixed scenario');
        checkFixture(captured.source, base, !!c.workday);
      }
      if (mode === 'live' && c.scenario)
        throw new InputError('Scripted scenarios cannot be live qualification');
      if (c.workday) {
        if (mode === 'simulation' && c.scenario !== 'handoff')
          throw new InputError('Workday simulation requires handoff scenario');
        const workday = resolveWorkday(
          resolve(dirname(manifestPath), c.workday),
          captured.source,
          base,
          project.bindings,
          tools,
        );
        const result: ExperimentCase = {
          ...c,
          workday,
          component: workday.requester.resolved.componentId,
          assignment: workday.requester.resolved.assignment,
          project: captured.source,
          base,
          acceptance: c.acceptance.map((check) => command(check, dirname(manifestPath))),
          bindings: project.bindings,
          issue: bindings.issues?.[c.id],
        };
        if (
          mode === 'simulation' &&
          (workday.requester.resolved.componentId !== 'gateway' ||
            workday.recipient.resolved.componentId !== 'identity')
        )
          throw new InputError('Incompatible handoff fixture owners');
        captureFiles(result, files);
        for (const participant of [workday.requester, workday.recipient]) {
          for (const a of participant.resolved.artifacts) files[a.path] = a.content;
          for (const e of participant.resolved.priorEvidence)
            files[e.path] = Buffer.from(e.content).toString('base64');
        }
        for (const a of workday.artifacts) files[a.path] = a.content;
        return result;
      }
      const path = resolve(dirname(manifestPath), c.assignment),
        assignment = validateSchema<Assignment>('assignment', read(path));
      if (
        (mode === 'simulation' ||
          (manifest.modes.length === 1 && manifest.modes[0] === 'simulation')) &&
        (c.component !== 'sample' ||
          assignment.kind !== 'change' ||
          assignment.changeType === 'documentation' ||
          assignment.acceptanceCriteria.length !== 1 ||
          (c.scenario === 'repair' && c.maxAttempts !== 2))
      )
        throw new InputError(
          'Assignment is incompatible with the fixed simulation fixture contract',
        );
      assignment.hostChecks = assignment.hostChecks.map((check) => command(check, dirname(path)));
      if (assignment.priorEvidence)
        assignment.priorEvidence = assignment.priorEvidence.map((ref) => ({
          ...ref,
          path: resolve(dirname(path), ref.path),
        }));
      for (const id of c.priorEvidenceIds ?? []) {
        const ref =
          bindings.priorEvidence && Object.hasOwn(bindings.priorEvidence, id)
            ? bindings.priorEvidence[id]
            : undefined;
        if (!ref) throw new InputError('Missing prior evidence binding: ' + id);
        (assignment.priorEvidence ??= []).push(ref);
      }
      const result: ExperimentCase = {
        ...c,
        workday: undefined,
        project: captured.source,
        base,
        assignment,
        acceptance: c.acceptance.map((check) => command(check, dirname(manifestPath))),
        bindings: project.bindings,
        issue:
          bindings.issues && Object.hasOwn(bindings.issues, c.id)
            ? bindings.issues[c.id]
            : undefined,
      };
      captureFiles(result, files);
      return result;
    });
    const data = {
      configurationSources,
      schemaVersion: 1 as const,
      runner,
      codexPath: bindings.codexPath ? executable(bindings.codexPath) : undefined,
      evidenceMode: mode ?? ('unselected' as const),
      supportedModes: manifest.modes,
      cases,
      files,
    };
    return { ...data, digest: digest(JSON.stringify(data)) };
  } catch (error) {
    throw new InputError(String(error));
  }
}
export function resolveLegacy(path: string): ExperimentInput {
  const manifest = validateSchema<{
    schemaVersion: 1;
    runner: string;
    codexPath?: string;
    cases: Array<Omit<ExperimentCase, 'assignment'> & { assignment: string }>;
  }>('campaign', read(path));
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
