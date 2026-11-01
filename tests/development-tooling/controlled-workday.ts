import { ControlledInitializer } from './controlled-initializer.js';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface ScenarioOptions {
  mode: string;
  root: string;
  calls: string;
}
interface Call {
  owner: string;
  stage: string;
}

export async function run(options: ScenarioOptions): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === '--version') {
    console.log('controlled workday');
    return;
  }
  if (args[0] === 'sandbox') return;
  process.chdir(args[args.indexOf('--cd') + 1]!);
  let prompt = '';
  for await (const chunk of process.stdin) prompt += chunk;
  if (new ControlledInitializer().respond(prompt, args, options.calls)) return;
  new ControlledWorkday(options, args, prompt).execute();
}

class ControlledWorkday {
  private readonly owner: string;
  private readonly stage: string;
  private readonly seen: number;
  private readonly number: number;
  private readonly dependency: boolean;
  private readonly file: string;
  private readonly docs: string;
  private readonly tests: string;
  private readonly after: string;
  private readonly result: any = {
    status: 'completed',
    summary: 'Bounded workday result',
    blockers: [],
    findings: [],
    activities: [],
    regression: null,
    reviewFindings: [],
    requests: [],
    plan: null,
    planUpdates: [],
    coordination: null,
  };

  constructor(
    private readonly options: ScenarioOptions,
    args: string[],
    private readonly prompt: string,
  ) {
    this.owner = prompt.includes('active component identity sample as') ? 'sample' : 'dependency';
    this.stage = prompt.match(/Activity turn: ([a-z-]+)/)![1]!;
    const prior: Call[] = existsSync(options.calls)
      ? readFileSync(options.calls, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      : [];
    this.seen = prior.filter((c) => c.owner === this.owner && c.stage === this.stage).length;
    this.number = prior.filter((c) => c.owner === this.owner).length + 1;
    this.dependency = this.owner === 'dependency';
    this.docs = this.dependency ? 'dependency-docs' : 'docs';
    this.tests = this.dependency ? 'dependency-tests' : 'tests';
    this.file = this.dependency ? 'dependency.txt' : 'source.txt';
    this.after = this.dependency ? 'after' : 'uses:after';
    this.recordCall(args);
  }

  private recordCall(args: string[]): void {
    const schema = JSON.parse(readFileSync(args[args.indexOf('--output-schema') + 1]!, 'utf8'));
    appendFileSync(
      this.options.calls,
      JSON.stringify({
        owner: this.owner,
        stage: this.stage,
        args,
        coordinationSchema: schema.properties.coordination,
      }) + '\n',
    );
  }

  execute(): void {
    this.engineering();
    this.faults();
    if (this.options.mode === 'hang' && this.dependency && this.stage === 'implementation') {
      writeFileSync(join(this.options.root, 'agent-pid'), String(process.pid));
      setInterval(() => {}, 1000);
      return;
    }
    this.response();
    this.request();
    this.emit();
  }

  private engineering(): void {
    if (this.stage === 'planning') this.plan();
    if (this.stage === 'specification') this.specification();
    if (this.stage === 'implementation' || this.stage === 'correction') {
      const defect =
        this.dependency &&
        ['repair', 'weak-test'].includes(this.options.mode) &&
        this.stage === 'implementation';
      writeFileSync(this.file, defect ? 'broken' : this.after);
    }
    if (this.stage === 'review')
      this.result.planUpdates = [
        {
          id: 'work',
          status: 'completed',
          explanation: 'Implemented and checked',
          evidence: [this.file],
        },
      ];
  }

  private plan(): void {
    this.result.plan = {
      approach: 'Bounded owner change',
      assumptions: [],
      activities: [{ activity: 'implementation', reason: 'Implement owned behavior' }],
      items: [
        {
          id: 'work',
          activity: 'implementation',
          result: 'Verified contract',
          criteria: [0],
          expectedEvidence: ['host verification'],
          dependencies: [],
          status: 'pending',
          explanation: '',
          evidence: [],
        },
      ],
      questions: [],
    };
  }

  private specification(): void {
    writeFileSync(this.docs + '/behavior.md', 'Contract must be ' + this.after);
    writeFileSync(
      this.tests + '/regression.cjs',
      "if(require('fs').readFileSync(" +
        JSON.stringify(this.file) +
        ",'utf8')!==" +
        JSON.stringify(this.after) +
        ")throw new Error('CONTRACT_EXPECTED');",
    );
    this.result.regression = {
      verificationIndex: 0,
      exitCode: 1,
      outputIncludes: 'CONTRACT_EXPECTED',
    };
  }

  private faults(): void {
    const { mode } = this.options;
    if (mode === 'unsolicited-answer' && this.dependency && this.stage === 'specification')
      this.result.coordination = this.coordination('answer', true);
    if (mode === 'weak-test' && this.dependency && this.stage === 'implementation')
      writeFileSync(this.tests + '/regression.cjs', '// weakened');
    if (!this.dependency && this.stage === 'implementation' && this.seen > 0) {
      if (mode === 'refresh')
        writeFileSync(this.file, 'uses:' + readFileSync('generated/value', 'utf8'));
      if (mode === 'combined-failure') writeFileSync('new.txt', 'regression');
      if (mode === 'foreign-edit') writeFileSync('dependency.txt', 'unauthorized');
    }
    if (mode === 'no-delivery' && this.dependency && this.stage === 'implementation') {
      this.result.status = 'blocked';
      this.result.blockers = ['Unable to deliver'];
    }
  }

  private response(): void {
    const { mode } = this.options;
    if (this.dependency && this.stage === 'planning') {
      const action =
        mode === 'reject'
          ? 'reject'
          : (mode === 'clarify' && this.seen === 0) || mode === 'exhaust-clarification'
            ? 'clarify'
            : 'accept';
      this.result.coordination = this.coordination(
        action,
        mode !== 'exhaust-clarification' && (mode !== 'clarify' || this.seen > 0),
      );
      if (mode === 'reject') {
        this.result.status = 'blocked';
        this.result.blockers = ['Request rejected with evidence'];
      }
    }
    if (this.owner === 'sample' && this.stage === 'coordination')
      this.result.coordination = this.coordination('answer', true);
  }

  private request(): void {
    const { mode } = this.options;
    if (!this.requestTriggered()) return;
    if (this.stage === 'implementation') writeFileSync(this.file, 'partial');
    if (mode === 'planning-updates')
      this.result.planUpdates = [
        { id: 'work', status: 'blocked', explanation: 'Awaiting owner', evidence: [] },
      ];
    this.result.status = 'blocked';
    this.result.blockers = ['Requires dependency owner'];
    this.result.coordination = this.coordination('request', mode === 'completed-specification');
    this.result.requests = [
      {
        fromComponent: mode === 'forged' ? 'dependency' : 'sample',
        ownerId: mode === 'unknown-owner' ? 'unknown' : 'dependency',
        request: 'Implement dependency value',
        evidence: ['dependency.txt'],
        acceptanceCriteria: ['Dependency becomes after'],
        reason: 'Dependency is outside sample authority',
      },
    ];
  }

  private requestTriggered(): boolean {
    const { mode } = this.options;
    const trigger =
      mode === 'planning-updates'
        ? 'planning'
        : mode === 'completed-specification'
          ? 'specification'
          : ['planning', 'specification', 'review'].includes(mode)
            ? mode
            : 'implementation';
    return (
      this.owner === 'sample' && this.stage === trigger && (this.seen === 0 || mode === 'duplicate')
    );
  }

  private coordination(action: string, complete = false) {
    return {
      action,
      contract: 'sample-contract',
      requestId:
        action === 'request'
          ? null
          : (this.prompt.match(/Current request ID: ([a-f0-9-]+)/)?.[1] ?? null),
      text: 'Implement the declared dependency contract',
      activityComplete: complete,
    };
  }

  private emit(): void {
    console.log(JSON.stringify({ type: 'thread.started', thread_id: this.owner + '-thread' }));
    console.log(
      JSON.stringify({
        type: 'item.completed',
        item: {
          id: 'result',
          type: 'agent_message',
          text: JSON.stringify(this.result),
        },
      }),
    );
    console.log(
      JSON.stringify({
        type: 'turn.completed',
        usage: {
          input_tokens: this.number * 10,
          cached_input_tokens: 0,
          output_tokens: this.number * 2,
        },
      }),
    );
  }
}
