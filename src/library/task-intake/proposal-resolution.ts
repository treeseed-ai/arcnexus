import { digest, resolveAssignment, type ResolvedAssignment } from '../architecture/assignment.js';
import type { Bindings } from '../architecture/bindings.js';
import { covered } from '../architecture/components.js';
import { InputError } from '../architecture/config.js';
import type { InitializationResult, ProposedAssignment } from '../architecture/initialization.js';
import type { WorkdayInput, WorkdayParticipant } from '../workday/workday-config.js';
import type { TaskProposal } from './proposal-store.js';

/** Validates model-selected owners against captured catalog authority and supported team shapes. */
export class ProposalResolution {
  /** Pins proposal resolution to the source revision, caller bindings and explicit model override. */
  constructor(
    private source: string,
    private base: string,
    private bindings: Bindings,
    private model?: string,
  ) {}

  /** Resolves captured inputs and rejects unsupported or inconsistent configuration. */
  resolve(result: InitializationResult): TaskProposal['execution'] {
    if (result.status !== 'ready') return this.nonReady(result);
    if (!this.validSelection(result)) return undefined;
    const assignments = result.assignments.map((a) => this.assignment(a));
    if (assignments.some((a) => a.assignment.kind === 'change' && !a.assignment.hostChecks.length))
      return this.clarify(
        result,
        'Caller must supply independent taskAcceptance for each change owner',
      );
    if (assignments.length === 1) {
      if (result.dependency)
        throw new InputError('Single-owner task cannot introduce a dependency');
      return { kind: 'run', resolved: assignments[0]! };
    }
    if (!this.bindings.taskAcceptance?.combined?.length)
      return this.clarify(
        result,
        'Caller must supply combined independent taskAcceptance for two-owner work',
      );
    return { kind: 'workday', input: this.workday(result, assignments) };
  }

  /** Rejects a selection that cannot be executed by the supported test profile. */
  private validSelection(result: InitializationResult): boolean {
    const ids = result.selectedOwners.map((owner) => owner.id);
    if (!ids.length || new Set(ids).size !== ids.length)
      throw new InputError('Invalid selected owners');
    if (ids.length > 2) {
      this.clarify(result, 'More than two owners requires architectural decomposition');
      return false;
    }
    if (result.questions.length || result.architectureProposal)
      throw new InputError('Ready proposal has unresolved needs');
    if (
      JSON.stringify([...ids].sort()) !==
      JSON.stringify(result.assignments.map((a) => a.ownerId).sort())
    )
      throw new InputError('Proposed assignments must match selected owners exactly');
    return true;
  }

  /** Retains clarification or architectural gaps instead of inventing executable authority. */
  private nonReady(result: InitializationResult): undefined {
    if (result.status === 'architecture_change_required' && !result.architectureProposal)
      throw new InputError('Architecture change requires a concrete proposal');
    if (result.status === 'needs_clarification' && !result.questions.length)
      throw new InputError('Clarification requires a concrete question');
    return undefined;
  }

  /** Builds the precise unresolved questions that prevent safe routing. */
  private clarify(result: InitializationResult, question: string): undefined {
    result.status = 'needs_clarification';
    result.questions.push(question);
    return undefined;
  }

  /** Constructs a supported single-owner execution proposal. */
  private assignment(value: ProposedAssignment): ResolvedAssignment {
    if (!value.objective.trim() || !value.acceptanceCriteria.length)
      throw new InputError('Proposed assignment requires objective and acceptance');
    return resolveAssignment(this.source, this.base, value.ownerId, {
      bindings: this.bindings,
      initializerModel: this.model,
      value: {
        schemaVersion: 3,
        objective: value.objective,
        kind: value.kind,
        changeType: value.changeType,
        expectedOutcome: value.objective,
        acceptanceCriteria: value.acceptanceCriteria,
        allowedWritePaths: value.allowedWritePaths,
        hostChecks: this.bindings.taskAcceptance?.[value.ownerId] ?? [],
      },
    });
  }

  /** Constructs the supported two-owner handoff proposal. */
  private workday(result: InitializationResult, assignments: ResolvedAssignment[]): WorkdayInput {
    const edge = result.dependency;
    const requester = assignments.find((a) => a.componentId === edge?.from);
    const recipient = assignments.find((a) => a.componentId === edge?.to);
    if (!edge || !requester || !recipient || requester === recipient)
      throw new InputError('Invalid proposed dependency edge');
    this.compatibility(requester, recipient);
    const combined = resolveAssignment(this.source, this.base, requester.componentId, {
      bindings: this.bindings,
      value: { ...requester.assignment, hostChecks: this.bindings.taskAcceptance!.combined },
    });
    const data = {
      schemaVersion: 3 as const,
      source: this.source,
      base: this.base,
      requester: this.participant(requester),
      recipient: this.participant(recipient),
      dependency: edge,
      acceptance: combined.assignment.hostChecks,
      artifacts: combined.artifacts,
    };
    return { ...data, digest: digest(JSON.stringify(data)) };
  }

  /** Validates a selected component against the captured catalog. */
  private participant(resolved: ResolvedAssignment): WorkdayParticipant {
    return {
      resolved,
      maxAttempts: resolved.executionProfile.maxAttempts,
      refresh: this.bindings.taskRefresh?.[resolved.componentId] ?? [],
    };
  }

  /** Checks proposed routing against the caller’s original envelope. */
  private compatibility(a: ResolvedAssignment, b: ResolvedAssignment): void {
    const first = a.context.at(-1)!,
      second = b.context.at(-1)!;
    if (!first.relatedIds.includes(second.id))
      throw new InputError('Dependency edge is not declared by requester');
    if (
      first.repository !== second.repository ||
      a.assignment.kind !== 'change' ||
      b.assignment.kind !== 'change'
    )
      throw new InputError('Workday requires two change owners in one writable repository');
    if ([a, b].some((owner) => owner.executionProfile.schemaVersion < 2))
      throw new InputError('Workday requires planned workflow profiles');
    if (
      a.allowedWritePaths.some(
        (p) => covered(p, b.allowedWritePaths) || b.allowedWritePaths.some((q) => covered(q, [p])),
      )
    )
      throw new InputError('Proposed ownership overlaps');
  }
}
