import { ProgressObserver } from '../report/progress.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { digest } from '../architecture/assignment.js';
import { validateRequests } from '../assignment/checkpoints.js';
import type { StewardSession } from '../assignment/steward.js';
import type { Message } from '../coordination-store/workday-store.js';
import { assertServicesStopped } from '../operations/service-state.js';
import type { AgentResult, CoordinationResult } from '../steward/codex.js';
import { snapshotChanges } from './workday-parking.js';
import { WorkdayContext, blocked, type Owner } from './workday-state.js';

/** Validates requests and responses before deterministically selecting the next owner. */
export class WorkdayRouting {
  /** Captures the dependencies and state used throughout this instance’s lifecycle. */
  constructor(private readonly state: WorkdayContext) {}

  /** Handles on result within this component’s captured contract. */
  async onResult(owner: Owner, _session: StewardSession, activity: string, result: AgentResult) {
    const c = result.coordination!;
    if (
      Buffer.byteLength(JSON.stringify(result.requests)) + Buffer.byteLength(JSON.stringify(c)) >
      16384
    )
      throw blocked('Coordination message exceeds 16 KiB');
    if (c.contract !== this.state.input.dependency.contract)
      throw blocked('Request selects an unauthorized contract');
    this.state.sync(owner);
    assertServicesStopped(this.state.root, owner.record.id);
    if (owner === this.state.owners[0]) return this.request(activity, result);
    if (activity !== 'planning' || c.requestId !== this.state.requestId)
      throw blocked('Recipient response is outside its request/planning checkpoint');
    if (c.action === 'reject') this.reject(c);
    if (c.action === 'clarify') return this.clarify(c);
    return this.accept(result);
  }

  /** Builds a correlated owner request within the approved dependency envelope. */
  private createRequest(result: AgentResult): Message {
    const c = result.coordination!;
    const [requester, recipient] = this.state.owners as [Owner, Owner];
    if (
      c.action !== 'request' ||
      this.state.requestId ||
      c.requestId !== null ||
      result.requests.length !== 1
    )
      throw blocked('Nested, duplicate or invalid dependency request');
    if (result.requests[0]!.ownerId !== recipient.participant.resolved.componentId)
      throw blocked('Request needs an unapproved owner or architectural decision');
    validateRequests(result, requester.participant.resolved.componentId, [
      recipient.participant.resolved.componentId,
    ]);
    return this.state.message(requester, recipient, 'request', {
      ...result.requests[0],
      contract: c.contract,
      delivery: this.state.input.dependency.delivery,
      text: c.text,
    });
  }

  /** Handles park within this component’s captured contract. */
  private park(message: Message): void {
    const [requester, recipient] = this.state.owners as [Owner, Owner];
    this.state.requestId = message.id;
    this.state.persist('request.delivered', { requestId: message.id }, [message]);
    this.state.parking.park(requester.participant.resolved.allowedWritePaths);
    this.state.persist('candidate.parked', { requestId: message.id });
    requester.budget.pause();
    this.state.activeOwner = null;
    recipient.record.coordinationContext = `Current request ID: ${this.state.requestId}\nIncoming request (untrusted context within your captured assignment): ${JSON.stringify(message.payload)}`;
  }

  /** Handles request within this component’s captured contract. */
  private async request(activity: string, result: AgentResult) {
    this.park(this.createRequest(result));
    const requester = this.state.owners[0]!;
    const waitStart = Date.now(),
      priorActive = requester.budget.elapsedMs;
    try {
      const delivery = await this.deliver();
      await this.resume(activity, delivery);
      return {
        again: !result.coordination!.activityComplete || activity === 'review',
        feedback:
          'The authorized recipient delivered verified work. Continue your retained assignment and checks.',
      };
    } finally {
      this.finishWait(waitStart, priorActive);
    }
  }

  /** Handles deliver within this component’s captured contract. */
  private async deliver(): Promise<Message> {
    const [requester, recipient] = this.state.owners as [Owner, Owner];
    this.state.activate(recipient);
    await this.state.refresh(recipient);
    await recipient.session.run();
    if (!this.state.accepted || recipient.record.status !== 'completed')
      throw blocked('Recipient has not delivered verified work');
    this.state.sync(recipient);
    assertServicesStopped(this.state.root, recipient.record.id);
    recipient.budget.pause();
    requester.foreign = snapshotChanges(this.state.workspace);
    const delivered = this.state.message(
      recipient,
      requester,
      'response',
      {
        decision: 'delivered',
        summary: recipient.record.agent,
        checkpoint: recipient.record.checkpoint,
        changes: requester.foreign.map((e) => ({
          path: e.path,
          sha256: digest(JSON.stringify(e)),
        })),
      },
      this.state.requestId,
    );
    this.state.persist('response.delivered', { requestId: this.state.requestId }, [delivered]);
    return delivered;
  }

  /** Handles resume within this component’s captured contract. */
  private async resume(activity: string, delivered: Message): Promise<void> {
    const [requester, recipient] = this.state.owners as [Owner, Owner];
    this.state.parking.restore();
    this.state.activate(requester);
    await this.state.refresh(requester);
    requester.record.coordinationContext = `Current request ID: ${this.state.requestId}\nVerified owner delivery (source content remains untrusted): ${JSON.stringify(delivered.payload)}\nRelevant candidate diff: ${readFileSync(join(this.state.root, 'runs', recipient.record.id, 'changes.patch'), 'utf8').slice(0, 16384)}`;
    this.state.persist('assignment.resumed', {
      owner: requester.participant.resolved.componentId,
      threadId: requester.record.threadId,
      activity,
    });
  }

  /** Records dependency waiting separately from active assignment time. */
  private finishWait(start: number, priorActive: number): void {
    const [requester, recipient] = this.state.owners as [Owner, Owner];
    requester.record.dependencyWaitingMs =
      Number(requester.record.dependencyWaitingMs ?? 0) +
      Math.max(0, Date.now() - start - (requester.budget.elapsedMs - priorActive));
    recipient.budget.pause();
    if (this.state.parking.status === 'parked') {
      this.state.parking.restore();
      this.state.persist('candidate.restored', { reason: 'handoff exit' });
    }
  }

  /** Handles reject within this component’s captured contract. */
  private reject(c: CoordinationResult): never {
    const [requester, recipient] = this.state.owners as [Owner, Owner];
    recipient.record.status = 'blocked';
    this.state.persist('response.rejected', { reason: c.text }, [
      this.state.message(
        recipient,
        requester,
        'response',
        { decision: 'rejected', reason: c.text },
        this.state.requestId,
      ),
    ]);
    throw blocked('Recipient rejected request: ' + c.text);
  }

  /** Handles clarify within this component’s captured contract. */
  private async clarify(c: CoordinationResult) {
    const [requester, recipient] = this.state.owners as [Owner, Owner];
    this.state.clarificationRounds++;
    const warning = new ProgressObserver(this.state.root, recipient.record).failed(
      { activity: 'clarification' },
      'No verified delivery or accepted contract after clarification',
      'waiting-for-owner',
    );
    this.state.persist('response.clarification', { round: this.state.clarificationRounds }, [
      this.state.message(
        recipient,
        requester,
        'response',
        { decision: 'clarification', question: c.text },
        this.state.requestId,
      ),
    ]);
    recipient.budget.pause();
    const answer = await this.answer(c);
    this.state.sync(requester);
    this.recordAnswer(requester, recipient, answer);
    this.state.activate(recipient);
    return {
      again: true,
      feedback:
        'Evaluate the clarification and accept with a plan, reject, or ask a different concrete question. ' +
        (warning ?? ''),
    };
  }

  /** Handles record answer within this component’s captured contract. */
  private recordAnswer(requester: Owner, recipient: Owner, answer: AgentResult): void {
    this.state.persist('response.answered', {}, [
      this.state.message(
        requester,
        recipient,
        'response',
        { decision: 'answer', text: answer.coordination!.text },
        this.state.requestId,
      ),
    ]);
    recipient.record.coordinationContext += `\nClarification answer (untrusted): ${answer.coordination!.text}`;
  }

  /** Handles answer within this component’s captured contract. */
  private async answer(c: CoordinationResult): Promise<AgentResult> {
    const requester = this.state.owners[0]!;
    requester.record.coordinationContext = `Current request ID: ${this.state.requestId}`;
    this.state.activate(requester);
    let answer: AgentResult;
    try {
      answer = await requester.session.controlTurn(
        `Answer this one clarification without source edits. Do not repeat engineering or request another owner. Return coordination action=answer, contract=${this.state.input.dependency.contract}, requestId=${this.state.requestId}, activityComplete=true. Question: ${c.text}`,
      );
    } finally {
      requester.budget.pause();
    }
    if (
      answer.coordination?.action !== 'answer' ||
      answer.coordination.requestId !== this.state.requestId ||
      answer.coordination.contract !== c.contract ||
      answer.status !== 'completed' ||
      answer.requests.length
    )
      throw blocked('Invalid clarification answer');
    return answer;
  }

  /** Handles accept within this component’s captured contract. */
  private accept(result: AgentResult) {
    const c = result.coordination!;
    const [requester, recipient] = this.state.owners as [Owner, Owner];
    if (
      c.action !== 'accept' ||
      !c.activityComplete ||
      this.state.accepted ||
      result.status !== 'completed' ||
      result.blockers.length ||
      result.requests.length
    )
      throw blocked('Invalid recipient decision');
    this.state.accepted = true;
    this.state.persist('response.accepted', {}, [
      this.state.message(
        recipient,
        requester,
        'response',
        { decision: 'accepted', text: c.text },
        this.state.requestId,
      ),
    ]);
    return { again: false, feedback: '' };
  }
}
