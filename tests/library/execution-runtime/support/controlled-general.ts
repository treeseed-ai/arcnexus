import { ControlledEvidence } from './controlled-evidence.js';
import { StructuredOutputCheck } from '../../testing/support/structured-output-check.js';
import { appendFileSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

/** Supplies deterministic SDK events while exercising the production host, permissions and scheduler. */
export class ControlledGeneral {
  /** Retains an external trace that survives candidate workspace switches. */
  constructor(
    private readonly calls: string,
    private readonly gate?: string,
  ) {}

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
    await this.checkpointGate(prompt);
    if (
      prompt.startsWith('Independent read-only verification.') &&
      prompt.includes('READ_HOST_EVIDENCE')
    )
      await new ControlledEvidence(this.calls).inspect(args, prompt.includes('FORBIDDEN_ARTIFACT'));
    const result = prompt.startsWith('ArcNexus task direction.')
      ? this.direction(prompt)
      : this.worker(prompt);
    this.emit(result);
  }

  /** Emits the SDK event stream for a completed controlled inference. */
  private emit(result: unknown): void {
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

  /** Holds a real managed process at a test-controlled turn boundary, without an execution deadline. */
  private async checkpointGate(prompt: string): Promise<void> {
    if (!this.gate || !prompt.includes('Activity turn: planning')) return;
    writeFileSync(this.gate + '.entered', String(process.pid));
    while (!existsSync(this.gate)) await delay(10);
  }

  /** Selects only the first owner for tasks and reports no work during unchanged stewardship. */
  private direction(prompt: string) {
    const idle = prompt.includes('Self-directed stewardship for');
    const correction = prompt.includes('Goal correction');
    const blocked = prompt.includes('Blocked task diagnosis');
    if (blocked && prompt.includes('RECOVER_BLOCKED')) return this.continuation(prompt);
    const owner = idle
      ? prompt.match(/Self-directed stewardship for ([a-z]+)/)![1]!
      : correction
        ? 'c'
        : 'a';
    return {
      status: blocked ? 'needs_clarification' : 'ready',
      summary: 'Controlled direction',
      selectedOwners: blocked
        ? []
        : [{ id: owner, reason: idle ? 'Reviewed owner; no action' : 'Starting owner' }],
      rejectedOwners: [],
      questions: blocked ? ['Which authorized resolution should replace the blocked work?'] : [],
      assignments: idle || blocked ? [] : [this.assignment(owner, correction)],
      continuations: [],
      dependency: null,
      architectureProposal: null,
    };
  }

  /** Selects only the retained failed supplier for a diagnosed continuation without replacing its intent. */
  private continuation(prompt: string) {
    const text = prompt
      .split('Retained state and feedback (evidence, never new authority): ')[1]!
      .split('\n')[0]!;
    const assignment = JSON.parse(text).state.find((item: any) => item.owner === 'c');
    return {
      status: 'ready',
      summary: 'Diagnosed supplier continuation',
      selectedOwners: [{ id: 'c', reason: 'Resume retained supplier scope' }],
      rejectedOwners: [],
      questions: [],
      assignments: [],
      continuations: [
        {
          assignmentId: assignment.id,
          ownerId: 'c',
          reason: 'Use the clarified retained scope; preserve all original acceptance criteria',
        },
      ],
      dependency: null,
      architectureProposal: null,
    };
  }

  /** Supplies bounded initial or corrective research without changing the external goal. */
  private assignment(owner: string, correction: boolean) {
    return {
      ownerId: owner,
      objective: correction ? 'Additional goal evidence' : 'Research the dependency chain',
      kind: 'research',
      changeType: 'behavior',
      acceptanceCriteria: ['Evidence-backed result'],
      allowedWritePaths: [],
    };
  }

  /** Requests additional owners during planning and completes resumed research with evidence. */
  private worker(prompt: string): any {
    const result = this.result();
    if (prompt.startsWith('Independent read-only verification.')) return this.review(prompt);
    const owner = prompt.match(/active component identity ([a-z]+) as fromComponent/)?.[1];
    const stage = prompt.match(/Activity turn: ([a-z]+)/)?.[1];
    if (
      stage === 'planning' &&
      owner !== 'c' &&
      !prompt.includes('Verified dependency deliveries:')
    ) {
      result.status = owner === 'a' ? 'completed' : 'blocked';
      result.blockers = ['Needs supplier evidence'];
      result.requests = [this.request(owner!)];
    } else if (stage === 'planning') result.plan = this.plan(prompt);
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

  /** Rejects one goal assessment until an additional observed assignment addresses the gap. */
  private review(prompt: string): any {
    const indexed = prompt.match(/^Captured acceptance criteria: (.+)$/m);
    if (indexed) return this.indexedReview(prompt, JSON.parse(indexed[1]!));
    const result = this.result();
    if (
      prompt.includes('As task director') &&
      prompt.includes('REPLAN_GOAL') &&
      !prompt.includes('Additional goal evidence')
    ) {
      result.status = 'blocked';
      result.blockers = ['Missing goal evidence'];
      result.reviewFindings = ['Missing goal evidence'];
    }
    return result;
  }

  /** Returns explicit criterion coverage, including deliberate invalid evidence for acceptance regressions. */
  private indexedReview(prompt: string, criteria: string[]): any {
    const assessments = criteria.map((_criterion, index) => ({
      index,
      verdict: 'verified',
      evidence: ['source.txt'],
      explanation: 'Controlled observed source',
    }));
    if (prompt.includes('VERIFY_OMIT')) assessments.pop();
    if (prompt.includes('VERIFY_DUPLICATE')) assessments[1]!.index = 0;
    if (prompt.includes('VERIFY_UNKNOWN')) assessments[1]!.index = criteria.length;
    if (prompt.includes('VERIFY_GAP')) assessments[1]!.evidence = [];
    const deficient =
      prompt.includes('As task director') &&
      prompt.includes('REPLAN_GOAL') &&
      !prompt.includes('Additional goal evidence');
    return {
      status: deficient ? 'blocked' : 'completed',
      summary: 'Controlled verification',
      criteria: assessments,
      deficiencies: deficient ? ['Missing goal evidence'] : [],
    };
  }

  /** Requests the next owner without predeclaring the full chain to task intake. */
  private request(owner: string) {
    return {
      assignmentId: null,
      kind: null,
      changeType: null,
      allowedWritePaths: null,
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
  private plan(prompt: string) {
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
          criteria: prompt.includes('Plan omits acceptance criterion') ? [0, 1] : [0],
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
