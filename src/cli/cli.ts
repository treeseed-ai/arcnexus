#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { resolveAssignment, resolveBase } from '../architecture/assignment.js';
import { loadBindings } from '../architecture/bindings.js';
import { loadCatalog } from '../architecture/components.js';
import { InputError } from '../architecture/config.js';
import { runSteward } from '../assignment/steward.js';
import { captureChanges } from '../change-inspection/changes.js';
import { resolveExperiment } from '../experiments/experiment-config.js';
import { ExperimentRunner } from '../experiments/experiments.js';
import { GuidanceValidator } from '../guidance-validation/guidance.js';
import { saveMarkdown } from '../report/report.js';
import { observe, viewExecution } from '../report/timeline.js';
import { resolveWorkday } from '../workday/workday-config.js';
import { lock, save, stateRoot, type RecordData } from '../workspace/state.js';
import { cleanup, createWorkspace, prepareWorkspace } from '../workspace/workspace.js';

const help = `ArcNexus
  run <component-id> <objective> --project <repository> [--model <model>] [--codex-path <executable>] [--max-attempts <1|2>]
  workday run <manifest> --project <repository> [--base <ref>] [--issue <number>] [--codex-path <executable>]
  workday inspect <manifest> --project <repository> [--base <ref>] [--bindings <file>] [--json]
  workday status <workday-id> [--json]
  workday follow <workday-id> [--json] [--after <sequence>]
  experiment inspect <manifest> --bindings <file> [--json]
  experiment run <manifest> --bindings <file> --mode simulation|live [--output <new-directory>]
  guidance validate --project <repository> [--json]
  validate --project <repository> [--base <ref>]
  inspect <component-id> <objective> --project <repository> [--kind change|research|review] [--json]
  run/inspect: --assignment <file> replaces objective
  prepare --project <repository>
  status <workspace-id> [--json]\n  follow <workspace-id> [--json] [--after <sequence>]\n  cleanup <workspace-id>
Composed workspaces: prepare/run/inspect --bindings <file>
Shared run/prepare options: --base <ref> --issue <number> --timeout-seconds <seconds>
`;
function argumentsForCommand() {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        mode: { type: 'string' },
        output: { type: 'string' },
        bindings: { type: 'string' },
        after: { type: 'string' },
        'composition-profile': { type: 'string' },
        'execution-profile': { type: 'string' },
        assignment: { type: 'string' },
        kind: { type: 'string' },
        json: { type: 'boolean' },
        project: { type: 'string' },
        model: { type: 'string' },
        'codex-path': { type: 'string' },
        'max-attempts': { type: 'string' },
        base: { type: 'string' },
        issue: { type: 'string' },
        'timeout-seconds': { type: 'string' },
        help: { type: 'boolean' },
        version: { type: 'boolean' },
      },
    });
  } catch (error) {
    throw new InputError(String(error));
  }
}
function finalize(root: string, record: RecordData): void {
  record.outcome ??= record.status;
  record.finishedAt = new Date().toISOString();
  record.elapsedMs = Date.now() - Date.parse(record.startedAt);
  try {
    captureChanges(root, record);
  } catch (error) {
    record.evidenceError = String(error);
    if (process.exitCode === undefined) {
      process.exitCode = 1;
      record.status = 'failed';
    }
  }
  observe(root, record, 'run.finalized', { status: record.status, outcome: record.outcome });
  save(root, record);
  saveMarkdown(root, record);
  console.log(JSON.stringify(record));
}
class CliApplication {
  private values: ReturnType<typeof argumentsForCommand>['values'] = {};
  private positionals: string[] = [];
  private command = '';
  private seconds = 900;
  private record?: RecordData;
  private root?: string;
  private unlock?: () => void;
  private timer?: NodeJS.Timeout;
  private readonly controller = new AbortController();
  private cancelled = false;
  private readonly cancel = () => {
    this.cancelled = true;
    this.controller.abort(new Error('Cancelled'));
  };

  async run(): Promise<void> {
    process.on('SIGINT', this.cancel);
    process.on('SIGTERM', this.cancel);
    try {
      const { values, positionals } = argumentsForCommand();
      this.values = values;
      this.positionals = positionals;
      this.command = positionals[0] ?? '';
      if (values.help) {
        console.log(help);
        return;
      }
      if (values.version) {
        console.log('0.1.0');
        return;
      }
      await this.dispatch();
    } catch (error) {
      this.failure(error);
    } finally {
      this.close();
    }
  }

  private async dispatch(): Promise<void> {
    switch (this.command) {
      case 'workday':
        return this.workday();
      case 'experiment':
        return this.experiment();
      case 'guidance':
        return this.guidance();
    }
    this.validateCommand();
    if (this.command === 'validate') return this.catalog();
    if (this.command === 'status' || this.command === 'follow') return this.viewer();
    const input = this.assignment();
    if (this.command === 'inspect') {
      console.log(
        this.values.json
          ? JSON.stringify(input.resolved)
          : `Assignment ${input.resolved!.digest}\n${JSON.stringify(input.resolved, null, 2)}`,
      );
      return;
    }
    const root = this.acquire();
    this.timer = setTimeout(
      () => this.controller.abort(new Error('Operation timed out')),
      (input.resolved?.executionProfile.timeoutSeconds ?? this.seconds) * 1000,
    );
    if (this.command === 'cleanup')
      console.log(JSON.stringify(cleanup(root, this.positionals[1]!)));
    else await this.execute(input, root);
  }

  private acquire(): string {
    this.root = stateRoot();
    this.unlock = lock(this.root);
    return this.root;
  }

  private async workday(): Promise<void> {
    const action = this.positionals[1];
    if (this.positionals.length !== 3)
      throw new InputError('workday requires action and manifest/identity');
    if (action === 'inspect') return this.inspectWorkday();
    if (action === 'run') return this.runWorkday();
    if (action === 'status' || action === 'follow') return this.viewWorkday();
    throw new InputError('Unknown workday action');
  }

  private inspectWorkday(): void {
    const { values, positionals } = this;
    if (
      !values.project ||
      Object.keys(values).some((k) => !['project', 'base', 'bindings', 'json'].includes(k))
    )
      throw new InputError('workday inspect requires --project');
    console.log(
      JSON.stringify(
        resolveWorkday(positionals[2]!, values.project, values.base, values.bindings),
        null,
        values.json ? undefined : 2,
      ),
    );
    return;
  }

  private async runWorkday(): Promise<void> {
    const { values, positionals } = this;
    if (
      !values.project ||
      Object.keys(values).some(
        (k) => !['project', 'base', 'bindings', 'issue', 'codex-path'].includes(k),
      ) ||
      (values.issue !== undefined && !/^[1-9]\d*$/.test(values.issue))
    )
      throw new InputError('Invalid workday run arguments');
    const input = resolveWorkday(positionals[2]!, values.project, values.base, values.bindings);
    const root = this.acquire();
    const { WorkdayRunner } = await import('../workday/workday.js');
    const result = await new WorkdayRunner(
      root,
      this.controller.signal,
      values['codex-path'] ?? 'codex',
    ).run(input, values.issue);
    console.log(JSON.stringify(result));
    process.exitCode = result.exitCode;
    return;
  }

  private async viewWorkday(): Promise<void> {
    const { values, positionals } = this;
    const action = positionals[1];
    if (
      Object.keys(values).some((k) => !['json', 'after'].includes(k)) ||
      (values.after !== undefined &&
        (action !== 'follow' ||
          !/^\d+$/.test(values.after) ||
          !Number.isSafeInteger(Number(values.after))))
    )
      throw new InputError('Invalid workday viewer arguments');
    const { viewWorkday } = await import('../workday/workday-view.js');
    await viewWorkday(
      stateRoot(),
      positionals[2]!,
      action === 'follow',
      !!values.json,
      Number(values.after ?? 0),
      this.controller.signal,
    );
    return;
  }

  private async experiment(): Promise<void> {
    const { values, positionals } = this;
    const action = positionals[1];
    if (
      positionals.length !== 3 ||
      !['inspect', 'run'].includes(action ?? '') ||
      !values.bindings ||
      Object.keys(values).some((key) => !['bindings', 'mode', 'output', 'json'].includes(key))
    )
      throw new InputError('experiment inspect/run requires manifest and --bindings');
    if (action === 'run' && !['simulation', 'live'].includes(values.mode ?? ''))
      throw new InputError('Experiment requires explicit --mode simulation|live');
    if (action === 'inspect' && (values.mode || values.output))
      throw new InputError('inspect accepts only --bindings and --json');
    const input = resolveExperiment(
      positionals[2]!,
      values.bindings,
      values.mode as 'simulation' | 'live' | undefined,
    );
    if (action === 'inspect') {
      console.log(JSON.stringify(input, null, values.json ? undefined : 2));
      return;
    }
    const output = values.output ?? join(stateRoot(), 'experiment-' + randomUUID());
    const campaign = await new ExperimentRunner(this.controller.signal).run(input, output);
    process.exitCode = campaign.status === 'passed' ? 0 : campaign.status === 'cancelled' ? 130 : 1;
    console.log(
      JSON.stringify({ status: campaign.status, evidenceMode: campaign.evidenceMode, output }),
    );
  }

  private guidance(): void {
    const { values, positionals } = this;
    if (
      positionals.length !== 2 ||
      positionals[1] !== 'validate' ||
      !values.project ||
      Object.keys(values).some((key) => !['project', 'json'].includes(key))
    )
      throw new InputError('guidance validate requires --project and optional --json');
    const report = new GuidanceValidator().validate(values.project);
    if (values.json) console.log(JSON.stringify(report));
    else {
      console.log(
        `Validated ${report.skills.filter((skill) => skill.valid).length} skills; inventoried ${report.agents.length} AGENTS.md files (readability only)`,
      );
      for (const diagnostic of report.diagnostics)
        console.error(`${diagnostic.path}: ${diagnostic.message}`);
    }
    process.exitCode = report.status === 'valid' ? 0 : 1;
    return;
  }

  private validateCommand(): void {
    const { values, positionals, command } = this;
    if (
      !['prepare', 'cleanup', 'run', 'validate', 'inspect', 'status', 'follow'].includes(
        command ?? '',
      )
    )
      throw new InputError(help);
    if (
      values['max-attempts'] !== undefined &&
      (command !== 'run' || !/^[12]$/.test(values['max-attempts']))
    )
      throw new InputError('--max-attempts is run-only and accepts 1 or 2');
    if (command === 'prepare' && (!values.project || positionals.length !== 1))
      throw new InputError('prepare requires --project');
    if (
      ['run', 'inspect'].includes(command!) &&
      (!values.project ||
        positionals.length !== (values.assignment ? 2 : 3) ||
        (!values.assignment && !positionals[2]?.trim()))
    )
      throw new InputError('run requires component, objective and --project');
    if (command === 'cleanup' && positionals.length !== 2)
      throw new InputError('cleanup requires workspace ID');
    this.validateExecution();
  }

  private validateExecution(): void {
    const { values } = this;
    if (values.issue && !/^[1-9]\d*$/.test(values.issue))
      throw new InputError('Invalid issue number');
    const seconds = (this.seconds = Number(values['timeout-seconds'] ?? 900));
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 2_147_483)
      throw new InputError('Invalid timeout');
  }

  private catalog(): void {
    const { values, positionals } = this;
    if (!values.project || positionals.length !== 1)
      throw new InputError('validate requires --project');
    const { source, base } = resolveBase(values.project, values.base);
    const catalog = loadCatalog(source, base);
    console.log(
      JSON.stringify({ base, components: Object.keys(catalog.components), status: 'valid' }),
    );
    return;
  }

  private async viewer(): Promise<void> {
    const { values, positionals, command } = this;
    if (positionals.length !== 2 || (values.after !== undefined && !/^[0-9]+$/.test(values.after)))
      throw new InputError('Invalid viewer arguments');
    const after = Number(values.after ?? 0);
    if (!Number.isSafeInteger(after)) throw new InputError('Invalid sequence');
    await viewExecution(
      stateRoot(),
      positionals[1]!,
      command === 'follow',
      !!values.json,
      after,
      this.controller.signal,
    );
    return;
  }

  private assignment() {
    const { values, positionals, command } = this;
    const bindings = loadBindings(values.bindings);
    const selection = ['run', 'inspect'].includes(command!)
      ? resolveBase(values.project!, values.base)
      : undefined;
    const resolved = selection
      ? resolveAssignment(selection.source, selection.base, positionals[1]!, {
          objective: positionals[2],
          bindings,
          file: values.assignment,
          kind: values.kind,
          compositionProfile: values['composition-profile'],
          executionProfile: values['execution-profile'],
          model: values.model,
          timeoutSeconds: values['timeout-seconds'] === undefined ? undefined : this.seconds,
        })
      : undefined;
    return { bindings, selection, resolved };
  }

  private async execute(
    input: ReturnType<CliApplication['assignment']>,
    root: string,
  ): Promise<void> {
    const { values, positionals, command } = this;
    const { bindings, selection, resolved } = input;
    const record = (this.record = createWorkspace(root, {
      project: values.project!,
      base: selection?.base ?? values.base,
      issue: values.issue,
      bindings,
    }));
    if (resolved) record.resolvedAssignment = resolved;
    if (['simulation', 'live'].includes(process.env.ARCNEXUS_EXPERIMENT_MODE ?? ''))
      record.evidenceMode = process.env.ARCNEXUS_EXPERIMENT_MODE;
    if (command === 'run')
      await runSteward(
        root,
        record,
        positionals[1]!,
        resolved!.assignment.objective,
        resolved!.executionProfile.model,
        values['codex-path'] ?? 'codex',
        this.controller.signal,
        Number(values['max-attempts'] ?? 1),
      );
    else await prepareWorkspace(root, record, this.controller.signal);
  }

  private failure(error: unknown): void {
    if (this.record) {
      this.record.status = this.cancelled
        ? 'cancelled'
        : ['blocked', 'no_changes'].includes(this.record.status)
          ? this.record.status
          : 'failed';
      this.record.error = String(error);
    }
    process.exitCode = this.cancelled ? 130 : error instanceof InputError ? 2 : 1;
    console.error(String(error));
  }

  private close(): void {
    if (this.timer) clearTimeout(this.timer);
    try {
      if (this.record && this.root) finalize(this.root, this.record);
    } finally {
      this.unlock?.();
      process.off('SIGINT', this.cancel);
      process.off('SIGTERM', this.cancel);
    }
  }
}
await new CliApplication().run();
