import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Assignment, HostCheck } from '../architecture/assignment.js';
import { InputError } from '../architecture/config.js';
import type { WorkdayParticipant } from '../workday/workday-config.js';
import type { ExperimentCase, ExperimentInput } from './experiment-config.js';
import { hash } from './experiment-hash.js';
import type { Campaign } from './experiments.js';

export interface PreparedCase extends ExperimentCase {
  directory: string;
  assignmentPath: string;
  workdayPath?: string;
  codexPath?: string;
}

/** Snapshots campaign inputs and supervising artifacts before the first case executes. */
export class ExperimentCapture {
  /** Retains resolved campaign inputs and their external evidence destination. */
  constructor(
    private campaign: Campaign,
    private output: string,
  ) {}

  /** Establishes the prerequisites required by the subsequent execution. */
  prepare(input: ExperimentInput): PreparedCase[] {
    return input.cases.map((c) => this.prepareCase(c, input));
  }

  /** Writes immutable campaign inputs and artifact hashes before the first case. */
  private snapshot(path: string, directory: string, input: ExperimentInput): string {
    if (!isAbsolute(path) || !Object.hasOwn(input.files, path))
      throw new InputError('Missing captured artifact: ' + path);
    const bytes = Buffer.from(input.files[path]!, 'base64'),
      destination = join(directory, 'files', path.slice(1));
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    if (existsSync(destination)) {
      if (hash(readFileSync(destination)) !== hash(bytes))
        throw new Error('Conflicting artifact snapshots');
    } else writeFileSync(destination, bytes, { mode: 0o500 });
    this.campaign.snapshots.push({
      path,
      snapshot: destination,
      sha256: hash(bytes),
    });
    return destination;
  }

  /** Captures fixed command inputs before candidate execution can alter their source. */
  private captureCommand(command: HostCheck, directory: string, input: ExperimentInput): HostCheck {
    const paths = new Map(
      command.artifacts.map((path) => [path, this.snapshot(path, directory, input)]),
    );
    return {
      ...command,
      command: paths.get(command.command) ?? command.command,
      args: command.args.map(
        (arg) =>
          paths.get(arg) ?? (arg === '{faultMarker}' ? join(directory, 'fault-marker.json') : arg),
      ),
      artifacts: [...paths.values()],
    };
  }

  /** Resolves case prerequisites before invoking the production runtime. */
  private prepareCase(c: ExperimentCase, input: ExperimentInput): PreparedCase {
    const directory = join(this.output, c.id);
    mkdirSync(directory, { mode: 0o700 });
    const path = this.assignment(c.assignment, 'assignment', directory, input);
    const codexPath = this.codex(c, directory, input);
    const workdayPath = this.workday(c, directory, input);
    return {
      ...c,
      directory,
      assignmentPath: path,
      workdayPath,
      codexPath,
      bindings: c.bindings ? this.snapshot(c.bindings, directory, input) : undefined,
      acceptance: c.acceptance.map((check) => this.captureCommand(check, directory, input)),
    };
  }

  /** Captures one assignment and its independently maintained checks. */
  private assignment(
    value: Assignment,
    name: string,
    directory: string,
    input: ExperimentInput,
  ): string {
    const assignment = structuredClone(value);
    if (assignment.priorEvidence)
      assignment.priorEvidence = assignment.priorEvidence.map((ref) => ({
        ...ref,
        path: this.snapshot(ref.path, directory, input),
      }));
    assignment.hostChecks = assignment.hostChecks.map((check) =>
      this.captureCommand(check, directory, input),
    );
    const path = join(directory, name + '.json');
    writeFileSync(path, JSON.stringify(assignment), { mode: 0o400 });
    return path;
  }

  /** Captures the owner envelope used by a workday participant. */
  private participant(
    owner: WorkdayParticipant,
    name: string,
    directory: string,
    input: ExperimentInput,
  ) {
    const file = this.assignment(owner.resolved.assignment, name, directory, input);
    return {
      component: owner.resolved.componentId,
      assignment: file,
      maxAttempts: owner.maxAttempts,
      refresh: owner.refresh,
    };
  }

  /** Captures the selected executable and simulation/live execution identity. */
  private codex(c: ExperimentCase, directory: string, input: ExperimentInput): string | undefined {
    let codexPath = input.codexPath;
    if (input.evidenceMode === 'simulation') {
      codexPath = join(directory, 'simulated-codex');
      const module = this.simulationModule(input.runner, Boolean(c.workday));
      writeFileSync(
        codexPath,
        `#!/usr/bin/env node\nprocess.argv.splice(2,0,${JSON.stringify(c.scenario)});import(${JSON.stringify(module)});\n`,
        { mode: 0o700 },
      );
    }
    return codexPath;
  }

  /** Selects the bundled controlled executable for the captured fixture scenario. */
  private simulationModule(runner: string, workday: boolean): string {
    const name = workday ? 'workday-simulation.js' : 'simulation-codex.js';
    const candidates = ['library/experiments', 'experiments'].map((directory) =>
      join(dirname(runner), directory, name),
    );
    const module = candidates.find(existsSync);
    if (!module) throw new InputError('Supervising build has no compatible simulation executable');
    return pathToFileURL(module).href;
  }

  /** Captures the combined workday input and final acceptance artifacts. */
  private workday(
    c: ExperimentCase,
    directory: string,
    input: ExperimentInput,
  ): string | undefined {
    let workdayPath: string | undefined;
    if (c.workday) {
      workdayPath = join(directory, 'workday.json');
      writeFileSync(
        workdayPath,
        JSON.stringify({
          schemaVersion: 1,
          requester: this.participant(c.workday.requester, 'requester', directory, input),
          recipient: this.participant(c.workday.recipient, 'recipient', directory, input),
          dependency: c.workday.dependency,
          acceptance: c.workday.acceptance.map((check) =>
            this.captureCommand(check, directory, input),
          ),
        }),
        { mode: 0o400 },
      );
    }
    return workdayPath;
  }
}
