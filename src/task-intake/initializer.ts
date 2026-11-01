import { InitializerChecks } from './initializer-checks.js';
import { operationBridge } from '../operations/operations.js';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { digest, type ResolvedAssignment } from '../architecture/assignment.js';
import type {
  InitializationResult,
  InitializationSnapshot,
} from '../architecture/initialization.js';
import { candidateDigest } from '../change-inspection/changes.js';
import { saveMarkdown } from '../report/report.js';
import { observe } from '../report/timeline.js';
import { runInitializerCodex } from '../steward/codex.js';
import { save, type RecordData } from '../workspace/state.js';
export interface InitializationEvidence {
  authorityHash: string;
  provenance: InitializationSnapshot['provenance'];
  runId: string;
  componentId: string;
  model: string;
  reasoning: 'medium';
  turns: number;
  threadId?: unknown;
  usage?: unknown;
  durationMs: number;
  result?: InitializationResult;
}
export interface InitializeInput {
  root: string;
  record: RecordData;
  resolved: ResolvedAssignment;
  owners: string[];
  envelope?: unknown;
  proposal?: { request: string; shortlist: string[] };
  executable: string;
  signal: AbortSignal;
}
export async function initializeExecution(input: InitializeInput): Promise<void> {
  const controller = new AbortController();
  const seconds = input.resolved.initialization.profile.timeoutSeconds;
  const timer =
    seconds === undefined
      ? undefined
      : setTimeout(
          () => controller.abort(new Error('Initializer deadline exhausted')),
          seconds * 1000,
        );
  try {
    await new Initializer({
      ...input,
      signal: AbortSignal.any([input.signal, controller.signal]),
    }).run();
  } finally {
    clearTimeout(timer);
  }
}
class Initializer {
  private readonly snapshot: InitializationSnapshot;
  private readonly child: RecordData;
  private readonly evidence: InitializationEvidence;
  private readonly started = Date.now();
  constructor(private readonly input: InitializeInput) {
    this.snapshot = input.resolved.initialization;
    this.child = this.createRecord();
    this.evidence = {
      authorityHash: input.resolved.digest,
      provenance: this.snapshot.provenance,
      runId: this.child.id,
      componentId: this.snapshot.componentId,
      model: this.snapshot.model,
      reasoning: 'medium',
      turns: 0,
      durationMs: 0,
    };
    input.record.initialization = this.evidence;
  }
  async run(): Promise<void> {
    const before = candidateDigest(this.input.record);
    this.publish('started');
    try {
      this.evidence.turns = 1;
      const checks = new InitializerChecks(this.input.root, this.child, this.snapshot);
      await checks.verify(this.input.signal);
      const result = await this.infer();
      checks.unchanged(before);
      this.evidence.result = result;
      this.validate(result);
      this.child.status = 'completed';
      this.child.outcome = result.status;
      if (result.status !== 'ready' && !this.input.proposal) {
        this.input.record.status = 'blocked';
        this.input.record.outcome = result.status;
        throw new Error('Initialization requires caller input: ' + result.summary);
      }
    } catch (error) {
      this.child.error = String(error);
      if (this.child.status !== 'completed') this.child.status = 'failed';
      throw error;
    } finally {
      this.finish();
    }
  }
  private createRecord(): RecordData {
    const record: RecordData = {
      ...this.input.record,
      id: randomUUID(),
      status: 'initializing',
      startedAt: new Date().toISOString(),
      commands: [],
      turns: [],
      readOnlyTurn: true,
      stage: 'initialization',
      resourceOwnerId: this.input.record.id,
      context: this.snapshot.context,
      resolvedAssignment: this.assignment(),
      objective: this.input.resolved.assignment.objective,
    };
    delete record.workdayId;
    delete record.workday;
    delete record.timelineSequence;
    delete record.initialization;
    mkdirSync(join(this.input.root, 'runs', record.id), { mode: 0o700 });
    save(this.input.root, record);
    return record;
  }
  private assignment(): ResolvedAssignment {
    const { digest: _digest, ...base } = this.input.resolved;
    const data = {
      ...base,
      componentId: this.snapshot.componentId,
      context: this.snapshot.context,
      role: this.snapshot.role,
      executionProfile: this.snapshot.profile,
      allowedWritePaths: [],
      operations: this.snapshot.operations,
      assignment: {
        ...base.assignment,
        kind: 'research' as const,
        allowedWritePaths: [],
        operationIds: this.snapshot.operations.map((op) => op.id),
        hostChecks: [],
      },
    };
    return { ...data, digest: digest(JSON.stringify(data)) };
  }
  private async infer(): Promise<InitializationResult> {
    const prompt = this.prompt();
    this.child.suppliedContext = {
      bytes: Buffer.byteLength(prompt),
      sha256: digest(prompt),
      provenance: this.input.resolved.configurationSources?.map((source) => ({
        path: source.path,
        sha256: source.sourceHash,
      })),
      scope: 'ArcNexus-supplied initialization text, not complete effective Codex context',
    };
    const path = join(this.input.root, 'runs', this.child.id, 'initialization-context.json');
    writeFileSync(path, JSON.stringify(this.snapshot, null, 2), { mode: 0o600 });
    return runInitializerCodex(
      this.input.root,
      this.child,
      prompt,
      this.input.executable,
      this.snapshot.model,
      this.input.signal,
      this.operations(),
    );
  }
  private operations() {
    const before = candidateDigest(this.child);
    const checks = new InitializerChecks(this.input.root, this.child, this.snapshot);
    this.child.stage = 'research';
    return operationBridge(this.input.root, this.child, this.input.signal, () =>
      checks.unchanged(before),
    );
  }
  private prompt(): string {
    return [
      'ArcNexus initialization: source-read-only routing confirmation. Do not implement, edit source, commit, delegate, or initialize recursively.',
      'Confirm the captured explicit assignment and owners, or report a precise architectural question/proposal. You cannot broaden the objective, permissions, acceptance or participants.',
      'For explicit assignments return ready only when captured owners can perform the work, assignments=[] and dependency=null. Task proposal instructions below, if present, instead request proposed routing for caller acceptance.',
      'Captured execution owners: ' + JSON.stringify(this.input.owners),
      'Captured assignment: ' +
        JSON.stringify(this.input.envelope ?? this.input.resolved.assignment),
      'Initializer responsibility: ' +
        JSON.stringify({ context: this.snapshot.context, role: this.snapshot.role }),
      'Captured catalog: ' + JSON.stringify(this.catalog()),
      ...this.proposalInstructions(),
      'Repository revision: ' + this.input.record.base,
      'Workspace: ' + this.input.record.workspace,
    ].join('\n');
  }
  private catalog() {
    return this.input.proposal
      ? this.snapshot.catalog.filter((c) => this.input.proposal!.shortlist.includes(c.id))
      : this.snapshot.catalog;
  }
  private proposalInstructions(): string[] {
    if (!this.input.proposal) return [];
    return [
      'Task proposal request: ' + this.input.proposal.request,
      'This is unstructured task intake, not an explicit execution assignment. Propose assignments for selected existing owners, with concrete objectives, kind, changeType, acceptanceCriteria and narrowed allowedWritePaths. For two owners propose one requester-to-recipient dependency. No commands or new authority. The host captures existing verification.',
      'The captured execution owners above are empty because routing is not yet accepted. Select from the retrieved catalog. Do not force a match: missing responsibility requires architecture_change_required with a precise architectureProposal; ambiguity requires needs_clarification. More than two necessary owners requires architectural decomposition.',
      'For ready proposals provide assignments and, for two owners only, dependency. For non-ready proposals provide questions or an architectureProposal. Do not edit source or apply proposed definitions.',
    ];
  }
  private validate(result: InitializationResult): void {
    if (this.input.proposal || result.status !== 'ready') return;
    const selected = result.selectedOwners.map((owner) => owner.id).sort();
    if (JSON.stringify(selected) !== JSON.stringify([...this.input.owners].sort()))
      throw new Error('Initializer cannot change captured execution owners');
    if (
      result.assignments.length ||
      result.dependency ||
      result.architectureProposal ||
      result.questions.length
    )
      throw new Error(
        'Ready initializer cannot replace the captured envelope or contain unresolved questions',
      );
  }
  private publish(phase: string): void {
    observe(this.input.root, this.input.record, 'initialization.' + phase, this.evidence);
    save(this.input.root, this.input.record);
  }
  private finish(): void {
    this.evidence.durationMs = Date.now() - this.started;
    this.evidence.threadId = this.child.threadId;
    this.evidence.usage = this.child.attemptReportedUsage ?? null;
    this.child.finishedAt = new Date().toISOString();
    this.child.elapsedMs = this.evidence.durationMs;
    save(this.input.root, this.child);
    saveMarkdown(this.input.root, this.child);
    this.publish('finished');
  }
}
