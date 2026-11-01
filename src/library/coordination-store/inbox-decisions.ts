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

  /** Suspends recipient planning and schedules a read-only requester control turn. */
  private clarify(
    requester: ExecutionAssignment,
    recipient: ExecutionAssignment,
    decision: InboxDecision,
  ): void {
    if (recipient.data.accepted) throw new Error('Accepted request cannot return to clarification');
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
    requester.status = 'waiting';
    recipient.data.answer = decision.text;
    delete recipient.data.clarification;
    recipient.status = 'ready';
  }
}
