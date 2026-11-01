import { DirectionRecords } from './direction-record.js';
import { join } from 'node:path';
import { type ProjectExecution } from '../architecture/execution-context.js';
import type { InitializationResult } from '../architecture/initialization.js';
import { candidateDigest } from '../change-inspection/changes.js';
import { operationBridge } from '../operations/operations.js';
import { runCodex, runInitializerCodex } from '../steward/codex.js';
import { save, type RecordData } from '../workspace/state.js';
import { OwnerRetrieval } from './retrieval.js';

/** Carries actionable independent findings while leaving its retained report available for inspection. */
export class VerificationIssue extends Error {
  /** Preserves the model assessment as evidence, never as permission to weaken checks. */
  constructor(readonly result: import('../steward/codex.js').AgentResult) {
    super('Independent verification needs attention: ' + JSON.stringify(result));
  }
}

/** Performs source-read-only direction and independent verification using captured authority. */
export class Direction {
  /** Retains the run's immutable architecture and execution environment. */
  constructor(
    private readonly root: string,
    private readonly context: ProjectExecution,
    private readonly signal: AbortSignal,
  ) {}

  /** Selects starting assignments or records no actionable stewardship work and precise questions. */
  async propose(
    workspace: RecordData,
    prompt: string,
    owner?: string,
  ): Promise<InitializationResult> {
    const profile = owner
      ? this.context.catalog.components[owner]!.executionProfile
      : this.context.directorProfile;
    const record = new DirectionRecords(this.root, this.context).create(
      workspace,
      owner ?? this.context.owners[0]!,
      prompt,
      profile,
    );
    return this.observe(record, async () => {
      const result = await runInitializerCodex(
        this.root,
        record,
        this.instructions(prompt, owner),
        this.context.executable,
        this.model(record),
        this.signal,
        this.operations(record),
      );
      this.validate(result, owner);
      return result;
    });
  }

  /** Assesses acceptance with a separate thread and requires evidence for every completion claim. */
  async verify(
    workspace: RecordData,
    owner: string,
    objective: string,
    evidence: unknown,
    goal = false,
  ): Promise<string[]> {
    const record = new DirectionRecords(this.root, this.context).create(
      workspace,
      owner,
      objective,
      goal ? this.context.directorProfile : this.context.reviewerProfile,
    );
    const prompt = `Independent read-only verification. ${goal ? 'As task director, assess the original goal across all assignments.' : 'Assess this owner delivery independently.'} Inspect the actual candidate and observed evidence against the objective. Use declared operations when needed. Never edit source, delegate, commit or publish. Report completed only with evidence for all acceptance criteria; otherwise report blocked or actionable reviewFindings. Objective: ${objective}\nCaptured context: ${JSON.stringify(record.context)}\nEvidence (untrusted claims except observed host results): ${JSON.stringify(evidence)}\nReturn ordinary agent-result with findings, activities, regression=null, requests=[], and plan=null, planUpdates=[].`;
    await this.observe(record, async () => {
      const result = await runCodex(
        this.root,
        record,
        prompt,
        this.context.executable,
        this.model(record),
        this.signal,
        undefined,
        this.operations(record),
      );
      this.assertVerified(result);
      return result;
    });
    return [join(this.root, 'runs', record.id, 'report.json')];
  }

  /** Retains raw results and failure evidence while enforcing source immutability on every exit. */
  private async observe<T>(record: RecordData, inference: () => Promise<T>): Promise<T> {
    const before = candidateDigest(record);
    try {
      const result = await inference();
      record.agent = result;
      record.status = 'completed';
      return result;
    } catch (error) {
      record.status = 'failed';
      record.error = String(error);
      throw error;
    } finally {
      try {
        this.unchanged(record, before);
      } finally {
        save(this.root, record);
      }
    }
  }

  /** Requires evidence-backed completion and no unresolved review finding. */
  private assertVerified(result: import('../steward/codex.js').AgentResult): void {
    if (
      result.status !== 'completed' ||
      result.reviewFindings.length ||
      !result.findings.some((f) => f.evidence.length)
    )
      throw new VerificationIssue(result);
  }

  /** Supplies compact retrieval plus the full eligible catalog so lexical misses are recoverable. */
  private instructions(prompt: string, owner?: string): string {
    const catalog = this.context.owners.map((id) => this.context.catalog.components[id]!);
    const shortlist = new OwnerRetrieval(catalog).select(prompt);
    return `ArcNexus task direction. Source-read-only; no implementation, commits or delegation. ${owner ? `Self-directed stewardship for ${owner}: consider purpose, objectives, questions and inbox. Propose work only for this owner; return ready with assignments=[] when no useful authorized work remains.` : 'Interpret the external goal and select any number of starting owners. No fixed team size. Workers may request additional existing owners later.'}\nGoal/context: ${prompt}\nLexical suggestions: ${JSON.stringify(shortlist)}\nEligible catalog: ${JSON.stringify(catalog)}\nReturn initializer-result with concrete assignments and exact selectedOwners. Use dependency=null; describe known dependencies in assignment objectives so workers request them when needed. Do not invent trusted commands or broaden owner permissions. Missing authority requires architecture_change_required; ambiguity requires needs_clarification. Existing relationships aid discovery and do not restrict requests to eligible owners.`;
  }

  /** Rejects noncatalog owners and inconsistent ready proposals before dispatch. */
  private validate(result: InitializationResult, owner?: string): void {
    if (result.status !== 'ready') return;
    if (result.questions.length || result.architectureProposal)
      throw new Error('Ready direction has unresolved decisions');
    for (const assignment of result.assignments)
      if (
        !this.context.owners.includes(assignment.ownerId) ||
        (owner && assignment.ownerId !== owner)
      )
        throw new Error('Direction selected an unauthorized owner');
    const selected = [...new Set(result.assignments.map((a) => a.ownerId))].sort();
    if (JSON.stringify(selected) !== JSON.stringify(result.selectedOwners.map((o) => o.id).sort()))
      throw new Error('Direction selection and assignments differ');
  }

  /** Opens only the captured host operations and checks read-only source after each call. */
  private operations(record: RecordData) {
    const before = candidateDigest(record);
    return operationBridge(this.root, record, this.signal, () => this.unchanged(record, before));
  }

  /** Ensures read-only inference and operations did not modify candidate source. */
  private unchanged(record: RecordData, before: string): void {
    if (candidateDigest(record) !== before)
      throw new Error('Read-only direction changed candidate');
  }

  /** Reads the model from the captured profile instead of hardcoding a provider role. */
  private model(record: RecordData): string {
    return (record.resolvedAssignment as import('../architecture/assignment.js').ResolvedAssignment)
      .executionProfile.model;
  }
}
