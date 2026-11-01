import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { InputError } from '../architecture/config.js';
import { execute, type CommandResult } from '../operations/process.js';
import type { RecordData } from '../workspace/state.js';
import { ExperimentCapture, type PreparedCase } from './experiment-capture.js';
import { resolveLegacy, type ExperimentInput } from './experiment-config.js';
import { hash } from './experiment-hash.js';
export function runnerHash(runner: string): string {
  const entries: Array<[string, string]> = [];
  const visit = (path: string) => {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) entries.push([file, hash(readFileSync(file))]);
      else throw new InputError('Runner files must not be symlinks');
    }
  };
  visit(dirname(runner));
  const legacySchemas = join(dirname(runner), '../schemas');
  if (existsSync(legacySchemas)) visit(legacySchemas);
  const compiledFixtures = join(dirname(runner), '../.fixture-build');
  if (existsSync(compiledFixtures)) visit(compiledFixtures);
  const fixtures = join(dirname(runner), '../fixtures/simulation');
  if (existsSync(fixtures)) visit(fixtures);
  const workdayFixture = join(dirname(runner), '../fixtures/workday');
  if (existsSync(workdayFixture)) visit(workdayFixture);
  entries.push(['lock', hash(readFileSync(join(dirname(runner), '../package-lock.json')))]);
  return hash(JSON.stringify(entries));
}
interface Execution extends CommandResult {
  stdout: string;
  stderr: string;
  error?: string;
}
interface CaseRecord {
  id: string;
  status: string;
  base: string;
  faultInjection?: string;
  execution?: Execution;
  report?: RecordData;
  reportPath?: string;
  acceptance: Execution[];
  usage?: unknown;
  interventionCount?: number;
  error?: string;
}
export interface Campaign {
  schemaVersion: 1;
  status: string;
  evidenceMode: string;
  startedAt: string;
  finishedAt?: string;
  manifest: ExperimentInput;
  manifestHash: string;
  runnerHash: string;
  finalRunnerHash?: string;
  node: string;
  cases: CaseRecord[];
  snapshots: Array<{ path: string; snapshot: string; sha256: string }>;
  error?: string;
}
/** Executes captured experiments through the ordinary supervised CLI boundary. */
export class ExperimentRunner {
  private campaign!: Campaign;
  private output!: string;
  constructor(private signal: AbortSignal) {}
  private save(): void {
    const path = join(this.output, 'campaign.json');
    writeFileSync(path + '.tmp', JSON.stringify(this.campaign, null, 2) + '\n', { mode: 0o600 });
    renameSync(path + '.tmp', path);
    const text =
      `# Experiment — ${this.campaign.status}\n\nEvidence mode: ${this.campaign.evidenceMode}\n\n${this.campaign.evidenceMode === 'simulation' ? 'Responses and usage are scripted; this is not live-model qualification.' : 'Live qualification requires independently checked real work; legacy evidence keeps its original interpretation.'}\n\n` +
      this.campaign.cases
        .map(
          (c) =>
            `## ${c.id}: ${c.status}\n\nBase: ${c.base}\nOutcome: ${c.report?.outcome ?? 'unavailable'}\nUsage completeness: ${c.report?.usageComplete ?? 'unavailable'}\nUsage: ${JSON.stringify(c.usage ?? 'unavailable')}\nInterventions: ${c.interventionCount ?? 'unavailable'}\nResources: ${JSON.stringify(c.report?.services ?? 'unavailable')}\nReport: ${c.reportPath ?? 'unavailable'}\nFailure: ${c.error ?? 'none recorded'}\n`,
        )
        .join('\n');
    writeFileSync(join(this.output, 'campaign.md'), text, { mode: 0o600 });
  }
  private async command(
    command: string,
    args: string[],
    prefix: string,
    cwd: string,
    timeoutMs: number | undefined,
    mode: string,
  ): Promise<Execution> {
    const stdout = prefix + '.stdout',
      stderr = prefix + '.stderr',
      env = { ...process.env, ARCNEXUS_EXPERIMENT_MODE: mode };
    try {
      return {
        ...(await execute({ command, args }, cwd, prefix + '.log', this.signal, {
          timeoutMs,
          env,
          stdout,
          stderr,
          killGraceMs: 2000,
        })),
        stdout,
        stderr,
      };
    } catch (error) {
      return this.commandFailure(error, stdout, stderr);
    }
  }
  private commandFailure(error: unknown, stdout: string, stderr: string): Execution {
    if (error && typeof error === 'object' && 'commandResult' in error)
      return {
        ...(error.commandResult as CommandResult),
        stdout,
        stderr,
        error: String(error),
      };
    throw error;
  }
  async run(input: ExperimentInput, output: string): Promise<Campaign> {
    const initialHash = this.initialize(input, output);
    try {
      const prepared = new ExperimentCapture(this.campaign, this.output).prepare(input);
      this.campaign.status = 'running';
      this.save();
      for (const c of prepared) {
        if (this.signal.aborted) break;
        if (runnerHash(input.runner) !== initialHash)
          throw new Error('Supervising build changed; remaining cases not executed');
        await this.runCase(c, input);
      }
      this.campaign.finalRunnerHash = runnerHash(input.runner);
      this.campaign.status = this.signal.aborted
        ? 'cancelled'
        : this.campaign.cases.length === prepared.length &&
            this.campaign.cases.every((c) => c.status === 'passed') &&
            this.campaign.finalRunnerHash === initialHash
          ? 'passed'
          : 'failed';
    } catch (error) {
      this.campaign.status = this.signal.aborted ? 'cancelled' : 'failed';
      this.campaign.error = String(error);
    }
    return this.finalize(input);
  }
  private initialize(input: ExperimentInput, output: string): string {
    this.validateOutput(input, output);
    const initialHash = runnerHash(input.runner);
    mkdirSync(this.output, { mode: 0o700 });
    this.campaign = {
      schemaVersion: 1,
      status: 'preparing',
      evidenceMode: input.evidenceMode,
      startedAt: new Date().toISOString(),
      manifest: input,
      manifestHash: input.digest,
      runnerHash: initialHash,
      node: process.version,
      cases: [],
      snapshots: [],
    };
    this.save();
    return initialHash;
  }
  private validateOutput(input: ExperimentInput, output: string): void {
    const { digest: capturedDigest, ...captured } = input;
    if (hash(JSON.stringify(captured)) !== capturedDigest)
      throw new InputError('Resolved experiment input changed');
    if (input.evidenceMode === 'unselected')
      throw new InputError('Experiment execution requires an explicit evidence mode');
    this.output = resolve(output);
    // Canonicalize the parent so a symlink cannot disguise output inside a target.
    try {
      this.output = join(realpathSync(dirname(this.output)), this.output.split('/').at(-1)!);
    } catch (error) {
      throw new InputError('Experiment output parent unavailable: ' + String(error));
    }
    for (const c of input.cases) {
      if (this.output === c.project || this.output.startsWith(c.project + '/'))
        throw new InputError('Campaign evidence must be outside target repositories');
      if (input.runner === c.project || input.runner.startsWith(c.project + '/'))
        throw new InputError('Supervising build must be outside target repositories');
    }
    if (lstatSync(this.output, { throwIfNoEntry: false }))
      throw new InputError('Experiment output already exists');
  }
  private async runCase(c: PreparedCase, input: ExperimentInput): Promise<void> {
    const entry = this.startCase(c);
    try {
      const args = this.arguments(c, input);
      entry.execution = await this.command(
        process.execPath,
        args,
        join(c.directory, 'execution'),
        c.directory,
        undefined,
        input.evidenceMode,
      );
      const report = this.captureReport(c, entry);
      this.verifyOutcome(c, entry, report);
      await this.acceptance(c, entry, input);
      entry.status = 'passed';
    } catch (error) {
      entry.status = this.signal.aborted ? 'cancelled' : 'failed';
      entry.error = String(error);
    }
    this.save();
    console.error(`${c.id}: ${entry.status}`);
  }
  private startCase(c: PreparedCase): CaseRecord {
    const entry: CaseRecord = {
      id: c.id,
      status: 'running',
      base: c.base,
      faultInjection: c.faultInjection,
      acceptance: [],
    };
    this.campaign.cases.push(entry);
    this.save();
    return entry;
  }
  private arguments(c: PreparedCase, input: ExperimentInput): string[] {
    const args = c.workdayPath
      ? [input.runner, 'workday', 'run', c.workdayPath, '--project', c.project, '--base', c.base]
      : [
          input.runner,
          'run',
          c.component,
          '--project',
          c.project,
          '--base',
          c.base,
          '--assignment',
          c.assignmentPath,
          '--model',
          'gpt-6-luna',
        ];
    if (!c.workdayPath && c.maxAttempts !== undefined)
      args.push('--max-attempts', String(c.maxAttempts));
    for (const [name, value] of [
      ['bindings', c.bindings],
      ['issue', c.issue],
      ['codex-path', c.codexPath],
    ])
      if (value) args.push('--' + name, value);
    return args;
  }
  private captureReport(c: PreparedCase, entry: CaseRecord): RecordData {
    const report = JSON.parse(readFileSync(entry.execution!.stdout, 'utf8')) as RecordData;
    entry.report = report;
    entry.reportPath = join(c.directory, 'report.json');
    writeFileSync(entry.reportPath, JSON.stringify(report, null, 2), {
      mode: 0o600,
    });
    if (c.workdayPath) this.normalizeWorkday(report);
    entry.usage = report.usage;
    entry.interventionCount = Array.isArray(report.callerInterventions)
      ? report.callerInterventions.length
      : undefined;
    return report;
  }
  private normalizeWorkday(report: RecordData): void {
    report.outcome = report.status;
    const owners = report.assignments as RecordData[];
    report.usage = (report.metrics as { usage: unknown })?.usage;
    report.usageComplete = owners.every((o) => o.usageComplete === true);
    report.callerInterventions = owners.flatMap((o) =>
      Array.isArray(o.callerInterventions) ? o.callerInterventions : [],
    );
    report.services = owners.flatMap((o) => (Array.isArray(o.services) ? o.services : []));
  }
  private verifyOutcome(c: PreparedCase, entry: CaseRecord, report: RecordData): void {
    if (
      entry.execution!.exitCode !== (c.expectedOutcome === 'blocked' ? 1 : 0) ||
      report.outcome !== c.expectedOutcome
    )
      throw new Error(`Unexpected execution outcome: ${report.error ?? report.outcome}`);
    const settings = report.settings as { model?: string; reasoning?: string } | undefined;
    if (
      c.workdayPath
        ? (report.assignments as RecordData[])
            .filter((o) => Array.isArray(o.turns) && o.turns.length > 0)
            .some(
              (o) =>
                (o.settings as { model?: string })?.model !== 'gpt-6-luna' ||
                (o.settings as { reasoning?: string })?.reasoning !== 'medium',
            )
        : settings?.model !== 'gpt-6-luna' || settings.reasoning !== 'medium'
    )
      throw new Error('Qualification requires Luna at medium reasoning');
  }
  private async acceptance(
    c: PreparedCase,
    entry: CaseRecord,
    input: ExperimentInput,
  ): Promise<void> {
    for (const [index, check] of c.acceptance.entries()) {
      const result = await this.command(
        check.command,
        check.args.map((arg) => arg.replaceAll('{report}', entry.reportPath!)),
        join(c.directory, `acceptance-${index}`),
        c.directory,
        undefined,
        input.evidenceMode,
      );
      entry.acceptance.push(result);
      if (result.exitCode !== 0 || result.error)
        throw new Error('Independent campaign acceptance failed');
    }
  }
  private finalize(input: ExperimentInput): Campaign {
    if (!this.campaign.finalRunnerHash)
      try {
        this.campaign.finalRunnerHash = runnerHash(input.runner);
      } catch (error) {
        this.campaign.error =
          (this.campaign.error ?? '') + '; final supervisor hash unavailable: ' + String(error);
        this.campaign.status = this.signal.aborted ? 'cancelled' : 'failed';
      }
    this.campaign.finishedAt = new Date().toISOString();
    this.save();
    return this.campaign;
  }
}
export async function legacyMain(args: string[]): Promise<void> {
  const controller = new AbortController(),
    cancel = () => controller.abort(new Error('Campaign cancelled'));
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  try {
    if (args.length !== 2)
      throw new InputError(
        'Usage: node scripts/qualify.mjs <manifest.json> <new-output-directory>',
      );
    const result = await new ExperimentRunner(controller.signal).run(
      resolveLegacy(args[0]!),
      args[1]!,
    );
    process.exitCode = result.status === 'passed' ? 0 : result.status === 'cancelled' ? 130 : 1;
    console.log(
      JSON.stringify({
        status: result.status,
        report: join(resolve(args[1]!), 'campaign.json'),
      }),
    );
  } catch (error) {
    console.error(String(error));
    process.exitCode = controller.signal.aborted ? 130 : 2;
  } finally {
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
  }
}
