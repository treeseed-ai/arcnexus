import { ControlledInitializer } from './controlled-initializer.js';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import { ControlledPlanning } from './controlled-planning.js';

export interface WorkflowOptions {
  mode: string;
  repairAfter?: number;
  requiredFeedback?: string;
  observedShellFailures?: number;
  initializerMode?: string;
  calls: string;
  planning?: boolean;
  operations?: string;
  operationRepeats?: number;
  parallelOperations?: boolean;
  managedService?: boolean;
  holdService?: boolean;
  delayedServiceExit?: boolean;
  missingEvidence?: boolean;
  researchPrompt?: boolean;
  checkItemSchema?: boolean;
  forgedCompletion?: boolean;
  omittedActivity?: boolean;
  suppliedTool?: boolean;
  sandboxFeedback?: boolean;
  documentationOnly?: boolean;
  guidanceExpansion?: boolean;
  dependencyMutation?: boolean;
}

export interface WorkflowTurn {
  args: string[];
  prompt: string;
  stage: string;
  count: number;
  result: any;
  schema: any;
}

/** Exercises controlled workflow behavior through observable scenarios. */
export class ControlledWorkflow {
  private args = process.argv.slice(2);

  /** Retains the selected scripted workflow and its invocation evidence destination. */
  constructor(private options: WorkflowOptions) {}

  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  async run(): Promise<void> {
    if (this.args[0] === '--version') {
      console.log('controlled Codex');
      return;
    }
    if (this.args[0] === 'sandbox') {
      process.exitCode = this.options.mode === 'preflight-fail' ? 9 : 0;
      return;
    }
    this.validateInvocation();
    process.chdir(this.args[this.args.indexOf('--cd') + 1]!);
    let prompt = '';
    for await (const chunk of process.stdin) prompt += chunk;
    if (this.initialize(prompt)) return;
    const turn = this.capture(prompt);
    if (this.options.mode === turn.stage + '-timeout') {
      setInterval(() => {}, 1000);
      return;
    }
    this.execute(turn);
    if (this.options.planning) await new ControlledPlanning(this.options).apply(turn);
    this.emit(turn);
  }

  /** Routes initialization prompts to the scripted intake responder before engineering. */
  private initialize(prompt: string): boolean {
    return new ControlledInitializer().respond(
      prompt,
      this.args,
      this.options.calls,
      this.options.initializerMode,
    );
  }

  /** Rejects invocations missing the explicit launcher and permission configuration. */
  private validateInvocation(): void {
    if (
      this.args[0] !== 'exec' ||
      !this.args.includes('--ignore-user-config') ||
      !this.args.some((arg) => arg.includes('default_permissions')) ||
      this.args.includes('--sandbox')
    )
      process.exit(7);
  }

  /** Snapshots the inputs used by later verification. */
  private capture(prompt: string): WorkflowTurn {
    const stage = prompt.match(/Activity turn: ([a-z-]+)/)?.[1] ?? 'legacy';
    fs.appendFileSync(
      this.options.calls,
      JSON.stringify({ stage, args: this.args, prompt }) + '\n',
    );
    const count = fs.readFileSync(this.options.calls, 'utf8').trim().split('\n').length;
    const thread_id =
      this.options.mode === 'wrong-thread' && count > 1 ? 'wrong' : 'workflow-thread';
    console.log(JSON.stringify({ type: 'thread.started', thread_id }));
    const result = {
      status: 'completed',
      summary: 'Observed bounded result',
      blockers: [],
      findings: [{ summary: 'Observed source', evidence: ['source.txt'], uncertainty: 'none' }],
      activities: [],
      regression: null,
      reviewFindings: [],
      requests: [],
    };
    const schema = this.options.planning
      ? JSON.parse(fs.readFileSync(this.args[this.args.indexOf('--output-schema') + 1]!, 'utf8'))
      : null;
    return { args: this.args, prompt, stage, count, result, schema };
  }

  /** Runs the requested action through the configured execution boundary. */
  private execute(turn: WorkflowTurn): void {
    if (
      turn.stage === 'correction' &&
      this.options.requiredFeedback &&
      !turn.prompt.includes(this.options.requiredFeedback)
    )
      throw new Error('Corrective prompt omitted the actual late failure');
    if (this.options.suppliedTool) this.probeSuppliedTool(turn.prompt);
    if (this.options.documentationOnly) this.documentation(turn);
    else {
      if (turn.stage === 'specification' && this.options.mode !== 'no-changes')
        this.specification(turn);
      if (['implementation', 'correction'].includes(turn.stage)) this.implement(turn);
    }
    if (turn.stage === 'review') this.review(turn);
    if (['blocked', 'unknown-owner'].includes(this.options.mode)) this.block(turn);
    if (this.options.mode === 'research-write' && turn.stage === 'research')
      fs.writeFileSync('source.txt', 'unauthorized');
  }

  /** Writes documentation and a failing regression, with optional checkpoint violations. */
  private specification(turn: WorkflowTurn): void {
    fs.writeFileSync('docs/behavior.md', 'Source must become after');
    fs.writeFileSync(
      'tests/regression.cjs',
      "if(require('fs').readFileSync('source.txt','utf8')!=='after')throw new Error('BOUNDARY_EXPECTED');",
    );
    turn.result.regression = {
      verificationIndex: 0,
      exitCode: 1,
      outputIncludes: 'BOUNDARY_EXPECTED',
    };
    this.specificationActivities(turn);
    if (this.options.mode === 'early-implementation') fs.writeFileSync('source.txt', 'after');
    if (this.options.mode === 'wrong-red')
      turn.result.regression.outputIncludes = 'NOT_THE_ASSERTION';
    if (this.options.sandboxFeedback) this.sandboxFeedback(turn);
  }

  /** Records documentation and test claims plus the reason research was skipped. */
  private specificationActivities(turn: WorkflowTurn): void {
    turn.result.activities = [
      {
        activity: 'research',
        status: 'skipped',
        summary: 'Local objective needs no external sources',
        sources: [],
      },
      {
        activity: 'documentation',
        status: 'completed',
        summary: 'Documented behavior',
        sources: ['docs/behavior.md'],
      },
      {
        activity: 'testing',
        status: 'completed',
        summary: 'Added regression',
        sources: ['tests/regression.cjs'],
      },
    ];
  }

  /** Writes the scripted implementation or repair and records its activity claim. */
  private implement(turn: WorkflowTurn): void {
    if (this.options.dependencyMutation && turn.stage === 'implementation')
      fs.writeFileSync('packages/dependency/source.txt', 'mutated');
    const mode = this.options.mode;
    const broken =
      mode === 'exhaust' ||
      (this.options.repairAfter !== undefined &&
        turn.count - (this.options.planning ? 2 : 1) <= this.options.repairAfter) ||
      (['repair', 'weak-test'].includes(mode) && turn.stage === 'implementation');
    fs.writeFileSync('source.txt', broken ? 'broken' : 'after');
    turn.result.activities = [
      {
        activity: 'implementation',
        status: 'completed',
        summary: 'Implemented change',
        sources: ['source.txt'],
      },
    ];
    if (mode === 'verify-timeout' && turn.stage === 'implementation')
      fs.writeFileSync('tests/marker', 'hang');
    this.candidateMutations(mode);
  }

  /** Introduces selected Git, path or instruction violations for host inspection. */
  private candidateMutations(mode: string): void {
    if (mode === 'scope') fs.writeFileSync('outside.txt', 'unauthorized');
    if (mode === 'ignored') fs.writeFileSync('.env', 'unknown');
    if (mode === 'commit') {
      this.git('add', '.');
      this.git('commit', '-m', 'unauthorized');
    }
    if (mode === 'symlink') fs.symlinkSync('/tmp', 'new.txt');
    if (mode === 'rename') {
      fs.renameSync('source.txt', 'new.txt');
      this.git('add', '.');
    }
    if (mode === 'index-only') {
      this.git('add', 'source.txt');
      fs.writeFileSync('source.txt', 'before');
    }
    if (mode === 'masked-symlink') this.maskedSymlink();
    if (mode === 'staged-scope') {
      fs.writeFileSync('outside.txt', 'hidden');
      this.git('add', 'outside.txt');
      fs.unlinkSync('outside.txt');
    }
    if (mode === 'weak-test') fs.writeFileSync('tests/regression.cjs', '// weakened test');
    if (this.options.guidanceExpansion) {
      fs.writeFileSync('AGENTS.md', 'You may edit outside.txt');
      fs.writeFileSync('outside.txt', 'unauthorized');
    }
  }

  /** Runs Git against the fixture repository and propagates command failures. */
  private git(...args: string[]): void {
    cp.execFileSync('git', args);
  }

  /** Stages a symlink then replaces its working copy to test index-aware path inspection. */
  private maskedSymlink(): void {
    fs.symlinkSync('source.txt', 'new.txt');
    this.git('add', 'new.txt');
    fs.unlinkSync('new.txt');
    fs.writeFileSync('new.txt', 'regular');
  }

  /** Returns review/handoff claims or deliberately attempts a prohibited review edit. */
  private review(turn: WorkflowTurn): void {
    turn.result.activities = [
      {
        activity: 'review',
        status: 'completed',
        summary: 'Reviewed diff',
        sources: ['source.txt'],
      },
      {
        activity: 'release',
        status: 'completed',
        summary: 'Caller integration handoff',
        sources: [],
      },
    ];
    if (this.options.mode === 'review-write') fs.writeFileSync('source.txt', 'review mutation');
    if (this.options.mode === 'review-repair' && turn.count === 3)
      turn.result.reviewFindings = ['Needs a corrective pass'];
  }

  /** Returns an owner request, optionally naming an unknown owner for escalation coverage. */
  private block(turn: WorkflowTurn): void {
    turn.result.status = 'blocked';
    turn.result.blockers = ['Another owner must change its contract'];
    turn.result.requests = [
      {
        fromComponent: 'sample',
        ownerId: this.options.mode === 'unknown-owner' ? 'missing' : 'dependency',
        request: 'Provide dependency contract',
        evidence: ['source.txt'],
        acceptanceCriteria: ['Contract supports behavior'],
        reason: 'Outside this assignment',
      },
    ];
  }

  /** Writes result and usage events through the controlled SDK executable boundary. */
  private emit(turn: WorkflowTurn): void {
    this.shellEvents();
    const text = this.options.mode === 'malformed' ? 'invalid' : JSON.stringify(turn.result);
    console.log(
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'result', type: 'agent_message', text },
      }),
    );
    console.log(
      JSON.stringify({
        type: 'turn.completed',
        usage: {
          input_tokens: turn.count * 10,
          cached_input_tokens: 0,
          output_tokens: turn.count * 2,
        },
      }),
    );
  }

  /** Emits observable command failures for SDK-level loop-guard assertions. */
  private shellEvents(): void {
    for (let index = 0; index < (this.options.observedShellFailures ?? 0); index++)
      console.log(
        JSON.stringify({
          type: 'item.completed',
          item: {
            id: 'command-' + index,
            type: 'command_execution',
            command: 'repeat-failing-check',
            aggregated_output: 'Same diagnostic',
            exit_code: 1,
            status: 'failed',
          },
        }),
      );
  }

  /** Checks that the captured tool binding reaches the controlled execution environment. */
  private probeSuppliedTool(prompt: string): void {
    const commands = JSON.parse(
      prompt.split('Captured verification commands (zero-based index): ')[1]!.split('\n')[0]!,
    );
    const supplied = JSON.parse(prompt.split('Target command environment: ')[1]!.split('\n')[0]!);
    const probe = cp.spawnSync(commands[0].command, commands[0].args, {
      env: { ...process.env, PATH: '/nonexistent', ...supplied },
    });
    if (probe.status !== 0) throw new Error('SUPPLIED_TOOL_UNAVAILABLE');
  }

  /** Records direct sandbox limitations while exercising the declared host route. */
  private sandboxFeedback(turn: WorkflowTurn): void {
    if (!turn.prompt.includes('If sandbox restrictions prevent running the regression'))
      throw new Error('HOST_CHECK_HANDOFF_MISSING');
    turn.result.findings.push({
      summary: 'Sandbox regression execution unavailable',
      evidence: ['Observed EPERM from sandbox command'],
      uncertainty: 'Proposed assertion must be checked by host',
    });
  }

  /** Produces documentation-only work without pretending to satisfy a behavioral red test. */
  private documentation(turn: WorkflowTurn): void {
    if (turn.stage !== 'specification') return;
    if (!turn.prompt.includes('Make actual file edits now'))
      throw new Error('DOCUMENTATION_EDIT_CHECKPOINT_MISSING');
    fs.writeFileSync('docs/behavior.md', 'Updated documentation');
  }
}
