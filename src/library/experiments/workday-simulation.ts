import { SimulationInitializer } from './simulation-initializer.js';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { ConfigurationReader } from '../architecture/configuration.js';
import type { AgentResult } from '../steward/codex.js';

/** Scripts two-owner responses through the production SDK protocol for simulation. */
class WorkdaySimulation {
  private readonly args = process.argv.slice(3);

  private owner = 'identity';

  private stage?: string;

  private delivered = false;

  private requestId: string | null = null;

  private readonly result: AgentResult = {
    status: 'completed',
    summary: 'SIMULATED two-owner work',
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

  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  async run(): Promise<void> {
    this.prepare();
    let prompt = '';
    for await (const chunk of process.stdin) prompt += chunk;
    if (new SimulationInitializer().respond(prompt)) return;
    this.owner = prompt.includes('active component identity gateway as') ? 'gateway' : 'identity';
    this.stage = prompt.match(/Activity turn: ([a-z-]+)/)?.[1];
    this.delivered = prompt.includes('Verified owner delivery');
    this.requestId = prompt.match(/Current request ID: ([a-f0-9-]+)/)?.[1] ?? null;
    if (this.stage === 'planning') this.plan();
    if (this.stage === 'specification') this.specification();
    if (this.stage === 'implementation') this.implementation();
    if (this.stage === 'review') this.review();
    this.output();
  }

  /** Establishes the prerequisites required by the subsequent execution. */
  private prepare(): void {
    if (process.argv[2] !== 'handoff') throw new Error('Unsupported workday simulation');
    if (this.args[0] === '--version') {
      console.log('ArcNexus simulated two-owner executable');
      process.exit(0);
    }
    if (this.args[0] === 'sandbox') process.exit(0);
    if (this.args[0] !== 'exec' || !this.args.includes('--ignore-user-config'))
      throw new Error('Expected SDK launcher');
    process.chdir(this.args[this.args.indexOf('--cd') + 1]!);
    if (
      (new ConfigurationReader().file('workday-contract.yaml').value as { id: string }).id !==
      'two-owner-v1'
    )
      throw new Error('Incompatible workday fixture');
  }

  /** Produces a scripted checklist through the real SDK response boundary. */
  private plan(): void {
    this.result.plan = {
      approach: 'SIMULATED bounded contract change',
      assumptions: [],
      activities: [
        {
          activity: 'implementation',
          reason: 'Implement captured owner contract',
        },
      ],
      items: [
        {
          id: 'contract',
          activity: 'implementation',
          result: 'Verified contract',
          criteria: [0],
          expectedEvidence: ['host checks'],
          dependencies: [],
          status: 'pending',
          evidence: [],
          explanation: '',
        },
      ],
      questions: [],
    };

    this.coordinate();
  }

  /** Produces the scripted request or response for the captured handoff stage. */
  private coordinate(): void {
    if (this.owner === 'gateway' && !this.delivered) this.request();
    if (this.owner === 'identity')
      this.result.coordination = {
        action: 'accept',
        contract: 'identity-label',
        requestId: this.requestId,
        text: 'Accept captured identity label envelope',
        activityComplete: true,
      };
  }

  /** Produces the fixture’s authorized dependency request. */
  private request(): void {
    this.result.status = 'blocked';
    this.result.blockers = ['Requires identity owner'];
    this.result.coordination = {
      action: 'request',
      contract: 'identity-label',
      requestId: null,
      text: 'Add label Identity: <id> while preserving id',
      activityComplete: false,
    };
    this.result.requests = [
      {
        fromComponent: 'gateway',
        ownerId: 'identity',
        request: 'Add label Identity: <id> to formatIdentity',
        evidence: ['identity/index.mjs'],
        acceptanceCriteria: ['Preserve id and supply label for all strings'],
        reason: 'Identity implementation belongs to another owner',
      },
    ];
  }

  /** Writes the fixture’s scripted regression evidence before implementation. */
  private specification(): void {
    writeFileSync(
      this.owner + '/README.md',
      '# ' +
        this.owner +
        '\n\nIdentity labels are `Identity: <id>`; identity preserves id, gateway reads label.\n',
    );
    writeFileSync(
      this.owner + '/test.mjs',
      this.owner === 'identity'
        ? "import assert from 'node:assert/strict';import {formatIdentity} from './index.mjs';for(const id of ['Ada','','Renée']){assert.equal(formatIdentity(id).id,id);assert.equal(formatIdentity(id).label,'Identity: '+id,'LABEL_EXPECTED');}\n"
        : "import assert from 'node:assert/strict';import {displayIdentity} from './index.mjs';for(const id of ['Ada','','Renée'])assert.equal(displayIdentity(id),'Identity: '+id,'LABEL_EXPECTED');\n",
    );
    this.result.regression = {
      verificationIndex: 0,
      exitCode: 1,
      outputIncludes: 'LABEL_EXPECTED',
    };
  }

  /** Edits the fixture implementation through the captured owner scope. */
  private implementation(): void {
    writeFileSync(
      this.owner + '/index.mjs',
      this.owner === 'identity'
        ? "export function formatIdentity(id) { return {id, label: 'Identity: '+id}; }\n"
        : "import {formatIdentity} from '../identity/index.mjs';\nexport function displayIdentity(id) { return formatIdentity(id).label; }\n",
    );
  }

  /** Returns the scripted read-only handoff after implementation. */
  private review(): void {
    this.result.planUpdates = [
      {
        id: 'contract',
        status: 'completed',
        explanation: 'SIMULATED change passed host checks',
        evidence: [this.owner + '/index.mjs', this.owner + '/test.mjs'],
      },
    ];
  }

  /** Builds the structured scripted turn result. */
  private output(): void {
    const n =
      ['planning', 'specification', 'implementation', 'review'].indexOf(this.stage ?? '') +
      1 +
      (this.owner === 'gateway' && (this.stage !== 'planning' || this.delivered) ? 1 : 0);
    this.emit({
      type: 'thread.started',
      thread_id:
        'simulation-' +
        createHash('sha256')
          .update(process.cwd() + this.owner)
          .digest('hex')
          .slice(0, 20),
    });
    this.emit({
      type: 'item.completed',
      item: { id: 'result', type: 'agent_message', text: JSON.stringify(this.result) },
    });
    this.emit({
      type: 'turn.completed',
      usage: { input_tokens: n * 10, cached_input_tokens: 0, output_tokens: n * 2 },
    });
  }

  /** Writes one labeled protocol event to stdout. */
  private emit(value: unknown): void {
    console.log(JSON.stringify(value));
  }
}

await new WorkdaySimulation().run();
