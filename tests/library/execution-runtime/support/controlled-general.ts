import { StructuredOutputCheck } from '../../testing/support/structured-output-check.js';
import { appendFileSync, readFileSync } from 'node:fs';

/** Supplies deterministic SDK events while exercising the production host, permissions and scheduler. */
export class ControlledGeneral {
  /** Retains an external trace that survives candidate workspace switches. */
  constructor(private readonly calls: string) {}

  /** Handles version/preflight or emits one structured inference result. */
  async run(): Promise<void> {
    const args = process.argv.slice(2);
    if (args[0] === '--version') {
      console.log('controlled general execution');
      return;
    }
    if (args[0] === 'sandbox') return;
    new StructuredOutputCheck().inspect(
      JSON.parse(readFileSync(args[args.indexOf('--output-schema') + 1]!, 'utf8')),
    );
    let prompt = '';
    for await (const chunk of process.stdin) prompt += chunk;
    appendFileSync(this.calls, JSON.stringify({ args, prompt }) + '\n');
    const result = prompt.startsWith('ArcNexus task direction.')
      ? this.direction(prompt)
      : this.worker(prompt);
    console.log(JSON.stringify({ type: 'thread.started', thread_id: 'general-thread' }));
    console.log(
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'result', type: 'agent_message', text: JSON.stringify(result) },
      }),
    );
    console.log(
      JSON.stringify({
        type: 'turn.completed',
        usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 },
      }),
    );
  }

  /** Selects only the first owner for tasks and reports no work during unchanged stewardship. */
  private direction(prompt: string) {
    const idle = prompt.includes('Self-directed stewardship for');
    return {
      status: 'ready',
      summary: 'Controlled direction',
      selectedOwners: idle ? [] : [{ id: 'a', reason: 'Starting owner' }],
      rejectedOwners: [],
      questions: [],
      assignments: idle
        ? []
        : [
            {
              ownerId: 'a',
              objective: 'Research the dependency chain',
              kind: 'research',
              changeType: 'behavior',
              acceptanceCriteria: ['Evidence-backed result'],
              allowedWritePaths: [],
            },
          ],
      dependency: null,
      architectureProposal: null,
    };
  }

  /** Requests additional owners during planning and completes resumed research with evidence. */
  private worker(prompt: string): any {
    const result = this.result();
    if (prompt.startsWith('Independent read-only verification.')) return result;
    const owner = prompt.match(/active component identity ([a-z]+) as fromComponent/)?.[1];
    const stage = prompt.match(/Activity turn: ([a-z]+)/)?.[1];
    if (
      stage === 'planning' &&
      owner !== 'c' &&
      !prompt.includes('Verified dependency deliveries:')
    ) {
      result.status = 'blocked';
      result.blockers = ['Needs supplier evidence'];
      result.requests = [this.request(owner!)];
    } else if (stage === 'planning') result.plan = this.plan();
    else
      result.planUpdates = [
        {
          id: 'research',
          status: 'completed',
          evidence: ['source.txt'],
          explanation: 'Source inspected',
        },
      ];
    return result;
  }

  /** Requests the next owner without predeclaring the full chain to task intake. */
  private request(owner: string) {
    return {
      assignmentId: null,
      milestone: 'delivered',
      fromComponent: owner,
      ownerId: owner === 'a' ? 'b' : 'c',
      request: 'Research supplier evidence',
      evidence: ['source.txt'],
      acceptanceCriteria: ['Evidence-backed result'],
      reason: 'Dependency',
    };
  }

  /** Supplies the required evidence fields shared by worker and verifier responses. */
  private result(): any {
    const result: any = {
      status: 'completed',
      summary: 'Observed source',
      blockers: [],
      findings: [
        { summary: 'Read source.txt', evidence: ['source.txt'], uncertainty: 'Controlled fixture' },
      ],
      activities: [],
      regression: null,
      reviewFindings: [],
      requests: [],
      plan: null,
      planUpdates: [],
    };
    return result;
  }

  /** Creates a valid minimal plan covering the captured research acceptance criterion. */
  private plan() {
    return {
      approach: 'Inspect source',
      assumptions: [],
      activities: [{ activity: 'research', reason: 'Establish evidence' }],
      questions: [],
      items: [
        {
          id: 'research',
          activity: 'research',
          result: 'Evidence-backed result',
          criteria: [0],
          expectedEvidence: ['source.txt'],
          dependencies: [],
          status: 'pending',
          evidence: [],
          explanation: '',
        },
      ],
    };
  }
}
