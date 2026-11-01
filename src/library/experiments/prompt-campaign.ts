import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { digest } from '../architecture/assignment.js';
import { InputError } from '../architecture/config.js';
import { HostClient } from '../execution-runtime/host-client.js';
import { execute, git, type CommandResult } from '../operations/process.js';
import type { PromptExperimentCase, PromptExperimentInput } from './prompt-config.js';
import { runnerHash } from './runner-hash.js';

interface PromptCaseReport {
  id: string;
  status: string;
  source: string;
  state: string;
  cwd: string;
  stream: string;
  task?: any;
  execution?: CommandResult;
  error?: string;
}

interface PromptCampaign {
  schemaVersion: 3;
  status: string;
  evidenceMode: string;
  input: PromptExperimentInput;
  runnerHash: string;
  cases: PromptCaseReport[];
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

/** Runs captured prompts through the normal task CLI and preserves each application-owned candidate. */
export class PromptExperimentRunner {
  private output = '';

  private campaign!: PromptCampaign;

  /** Propagates campaign cancellation to the attached task command and retains host evidence. */
  constructor(private readonly signal: AbortSignal) {}

  /** Captures every case before dispatch and requires honest task outcomes and stable supervising code. */
  async run(input: PromptExperimentInput, output: string): Promise<PromptCampaign> {
    this.initialize(input, output);
    try {
      for (const item of input.cases) {
        this.campaign.cases.push(this.prepare(item));
        this.save();
      }
      for (const [index, item] of input.cases.entries()) {
        this.signal.throwIfAborted();
        this.unchanged();
        await this.runCase(item, this.campaign.cases[index]!);
      }
      this.unchanged();
      this.campaign.status = this.signal.aborted
        ? 'cancelled'
        : this.campaign.cases.every((item) => item.status === 'passed')
          ? 'passed'
          : 'failed';
    } catch (error) {
      this.campaign.status = this.signal.aborted ? 'cancelled' : 'failed';
      this.campaign.error = String(error);
    } finally {
      this.campaign.finishedAt = new Date().toISOString();
      this.save();
    }
    return this.campaign;
  }

  /** Rejects changed inputs and unsafe output paths before creating immutable campaign intent. */
  private initialize(input: PromptExperimentInput, output: string): void {
    const { digest: expected, ...captured } = input;
    if (digest(JSON.stringify(captured)) !== expected)
      throw new InputError('Resolved prompt campaign changed');
    if (input.evidenceMode === 'unselected')
      throw new InputError('Select an explicit evidence mode');
    const absolute = resolve(output);
    this.output = join(realpathSync(dirname(absolute)), absolute.split('/').at(-1)!);
    if (existsSync(this.output)) throw new InputError('Campaign output must be new');
    for (const item of input.cases)
      if (this.output === item.project || this.output.startsWith(item.project + '/'))
        throw new InputError('Campaign output must be outside source repositories');
    mkdirSync(this.output, { mode: 0o700 });
    this.campaign = {
      schemaVersion: 3,
      status: 'preparing',
      evidenceMode: input.evidenceMode,
      input,
      runnerHash: runnerHash(input.runner),
      cases: [],
      startedAt: new Date().toISOString(),
    };
    writeFileSync(join(this.output, 'input.json'), JSON.stringify(input, null, 2), { mode: 0o400 });
    this.save();
  }

  /** Materializes an isolated committed source and captured local bindings without modifying the caller. */
  private prepare(item: PromptExperimentCase): PromptCaseReport {
    this.sourceUnchanged(item);
    const directory = join(this.output, item.id);
    mkdirSync(directory, { mode: 0o700 });
    const source = join(directory, 'source');
    git(
      directory,
      'clone',
      '--no-hardlinks',
      '--no-checkout',
      '--no-tags',
      '--single-branch',
      item.project,
      source,
    );
    git(source, 'checkout', '--detach', item.base);
    mkdirSync(join(source, '.git/arcnexus'), { recursive: true, mode: 0o700 });
    writeFileSync(join(source, '.git/arcnexus/bindings.yaml'), JSON.stringify(item.bindings), {
      mode: 0o600,
    });
    return {
      id: item.id,
      status: 'pending',
      source,
      cwd: join(source, item.cwd),
      state: join(directory, 'state'),
      stream: join(directory, 'task.jsonl'),
    };
  }

  /** Rejects source drift between preflight capture and isolated case materialization. */
  private sourceUnchanged(item: PromptExperimentCase): void {
    if (
      git(item.project, 'rev-parse', 'HEAD').trim() !== item.base ||
      git(item.project, 'status', '--porcelain').trim()
    )
      throw new InputError('Captured source changed before campaign preparation');
  }

  /** Executes one prompt and checks its actual terminal task projection rather than worker claims. */
  private async runCase(item: PromptExperimentCase, report: PromptCaseReport): Promise<void> {
    report.status = 'running';
    this.campaign.status = 'running';
    this.save();
    try {
      report.execution = await this.executeTask(item, report);
      this.capture(report);
      if (
        report.task?.run.status !== item.expectedOutcome ||
        report.execution.exitCode !== (item.expectedOutcome === 'completed' ? 0 : 1)
      )
        throw new Error(
          'Unexpected task outcome: ' + JSON.stringify(report.task?.run ?? report.execution),
        );
      report.status = 'passed';
    } catch (error) {
      this.capture(report);
      report.status = this.signal.aborted ? 'cancelled' : 'failed';
      report.error = String(error);
    } finally {
      await this.retire(report);
      this.save();
    }
  }

  /** Launches the option-free task command with case-private state and complete output evidence. */
  private executeTask(
    item: PromptExperimentCase,
    report: PromptCaseReport,
  ): Promise<CommandResult> {
    return execute(
      { command: process.execPath, args: [this.campaign.input.runner, 'task', 'run', item.prompt] },
      report.cwd,
      join(dirname(report.stream), 'execution.log'),
      this.signal,
      {
        env: { ...process.env, ARCNEXUS_STATE_DIR: report.state },
        stdout: report.stream,
        stderr: join(dirname(report.stream), 'stderr.log'),
        killGraceMs: 2000,
      },
    );
  }

  /** Retains the last structured projection while leaving the complete stream available for inspection. */
  private capture(report: PromptCaseReport): void {
    if (!existsSync(report.stream)) return;
    for (const line of readFileSync(report.stream, 'utf8').trim().split('\n')) {
      try {
        const value = JSON.parse(line);
        if (value.run && value.assignments) report.task = value;
      } catch {
        // Partial terminal output stays in the stream; it cannot establish a completed task.
      }
    }
  }

  /** Cancels unfinished case work and retires only its isolated host after managed execution stops. */
  private async retire(report: PromptCaseReport): Promise<void> {
    const client = new HostClient(report.cwd, report.state);
    if (!existsSync(client.socket)) return;
    try {
      let status = await client.request({ action: 'status' });
      for (const task of status.tasks)
        if (['running', 'pausing'].includes(task.status))
          await client.request({ action: 'cancel', id: task.id });
      while (status.active) {
        await delay(50);
        status = await client.request({ action: 'status' });
      }
      const id = report.task?.run.id ?? status.tasks.at(-1)?.id;
      if (id) report.task = await client.request({ action: 'task-status', id });
      await client.request({ action: 'retire' });
    } catch (error) {
      report.error = `${report.error ?? ''}; host cleanup: ${String(error)}`;
      report.status = 'failed';
    }
  }

  /** Rejects supervising-build drift before dispatching another case or claiming qualification. */
  private unchanged(): void {
    if (runnerHash(this.campaign.input.runner) !== this.campaign.runnerHash)
      throw new Error('Supervising build changed during prompt campaign');
  }

  /** Atomically projects campaign evidence while the task store remains authoritative for execution. */
  private save(): void {
    const path = join(this.output, 'campaign.json');
    writeFileSync(path + '.tmp', JSON.stringify(this.campaign, null, 2), { mode: 0o600 });
    renameSync(path + '.tmp', path);
  }
}
