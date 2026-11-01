import type { ExecutionDatabase } from './execution-database.js';
import type { ExecutionAssignment, InboxRequest } from './execution-types.js';

export interface InboxDecision {
  requestId: string;
  action: 'accept' | 'reject' | 'clarify' | 'answer';
  text: string;
}

/** Validates correlated inbox replies and updates readiness inside the store's transaction. */
export class InboxDecisions {
  /** Shares the single transactional writer; it never opens a second connection. */
  constructor(private readonly db: ExecutionDatabase) {}

  /** Applies a recipient decision or an originating assignment's read-only answer. */
  apply(actor: string, decision: InboxDecision): void {
    if (!decision.text.trim()) throw new Error('Inbox decision requires an explanation');
    const id = JSON.stringify([decision.requestId, actor, decision.action, decision.text]);
    if (this.db.all<{ id: string }>('reply').some((r) => r.id === id)) return;
    const request = this.db.get<InboxRequest>('request', decision.requestId);
    const answer = decision.action === 'answer';
    if (actor !== (answer ? request.from : request.assignmentId))
      throw new Error('Inbox reply has unauthorized sender');
    const recipient = this.db.get<ExecutionAssignment>('assignment', request.assignmentId);
    const requester = this.db.get<ExecutionAssignment>('assignment', request.from);
    this.validate(recipient, requester, decision);
    if (answer) this.answer(requester, recipient, decision);
    else if (decision.action === 'clarify') this.clarify(requester, recipient, decision);
    else if (decision.action === 'accept') recipient.data.accepted = true;
    else {
      recipient.status = 'rejected';
      recipient.data.reason = decision.text;
    }
    this.db.put('assignment', recipient);
    this.db.put('assignment', requester);
    this.db.put('reply', {
      id,
      actor,
      ...decision,
    });
  }

  /** Preserves terminal delivery and prevents a new question from overwriting an unanswered one. */
  private validate(
    recipient: ExecutionAssignment,
    requester: ExecutionAssignment,
    decision: InboxDecision,
  ): void {
    const terminal = (item: ExecutionAssignment) =>
      ['completed', 'rejected', 'failed', 'interrupted'].includes(item.status);
    if (terminal(recipient) || (decision.action === 'answer' && terminal(requester)))
      throw new Error('New inbox decisions cannot change terminal assignments');
    if (decision.action !== 'clarify') return;
    if (terminal(requester)) throw new Error('Cannot ask a terminal requester for clarification');
    if (recipient.data.clarification) throw new Error('A clarification is already pending');
  }

  /** Suspends recipient planning and schedules a read-only requester control turn. */
  private clarify(
    requester: ExecutionAssignment,
    recipient: ExecutionAssignment,
    decision: InboxDecision,
  ): void {
    recipient.status = 'waiting';
    recipient.data.clarification = decision;
    requester.data.questions = [...((requester.data.questions ?? []) as InboxDecision[]), decision];
    requester.status = 'ready';
  }

  /** Correlates an answer without pretending the requester has finished its engineering assignment. */
  private answer(
    requester: ExecutionAssignment,
    recipient: ExecutionAssignment,
    decision: InboxDecision,
  ): void {
    const question = recipient.data.clarification as InboxDecision | undefined;
    if (question?.requestId !== decision.requestId)
      throw new Error('No matching clarification is pending');
    requester.data.questions = ((requester.data.questions ?? []) as InboxDecision[]).filter(
      (q) => q.requestId !== decision.requestId,
    );
    requester.status = (requester.data.questions as InboxDecision[]).length ? 'ready' : 'waiting';
    recipient.data.answer = decision.text;
    delete recipient.data.clarification;
    recipient.status = 'ready';
  }
}
