import { TaskAuthority, type TaskAuthoritySnapshot } from './task-authority.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  digest,
  resolveAssignment,
  resolveBase,
  type ResolvedAssignment,
} from '../architecture/assignment.js';
import { loadBindings, type Bindings } from '../architecture/bindings.js';
import { loadCatalog } from '../architecture/components.js';
import { InputError } from '../architecture/config.js';
import { git } from '../operations/process.js';
import { saveMarkdown } from '../report/report.js';
import { save, type RecordData } from '../workspace/state.js';
import { createWorkspace, prepareWorkspace } from '../workspace/workspace.js';
import { initializeExecution, type InitializationEvidence } from './initializer.js';
import { ProposalResolution } from './proposal-resolution.js';
import { ProposalStore, type TaskProposal } from './proposal-store.js';
import { OwnerRetrieval } from './retrieval.js';
export interface TaskPlanInput {
  input: string;
  project: string;
  base?: string;
  bindings?: string;
  initializerModel?: string;
  executable: string;
}
export class TaskPlanner {
  private sourceHead = '';
  private authority!: TaskAuthoritySnapshot;
  constructor(
    private root: string,
    private signal: AbortSignal,
  ) {}
  async plan(input: TaskPlanInput): Promise<TaskProposal> {
    const { text, bindings, shortlist, owner, captured, record } = this.prepare(input);
    try {
      await prepareWorkspace(this.root, record, this.signal);
      await initializeExecution({
        root: this.root,
        record,
        resolved: captured,
        owners: [],
        executable: this.authority.executable,
        signal: this.signal,
        proposal: { request: text, shortlist: shortlist.map((c) => c.id) },
      });
      this.unchanged(captured, input, owner.id, text);
      return this.proposal(record, input, text, shortlist, bindings);
    } catch (error) {
      record.status = this.signal.aborted ? 'cancelled' : 'failed';
      record.error = String(error);
      throw error;
    } finally {
      this.finish(record);
    }
  }
  private prepare(input: TaskPlanInput) {
    const selection = resolveBase(input.project, input.base);
    this.authority = new TaskAuthority().capture(input.executable);
    this.sourceHead = git(selection.source, 'rev-parse', 'HEAD').trim();
    const text = readFileSync(input.input, 'utf8');
    if (!text.trim()) throw new InputError('Task request is empty');
    const bindings = loadBindings(input.bindings);
    const catalog = loadCatalog(selection.source, selection.base);
    const shortlist = new OwnerRetrieval(Object.values(catalog.components)).select(text);
    const owner = Object.values(catalog.components).find(
      (c) => c.verification.length && ['library', 'gateway', 'foundation'].includes(c.type),
    );
    if (!owner) throw new InputError('Task planning requires an executable catalog owner');
    const captured = this.capture(selection, owner.id, text, bindings, input.initializerModel);
    const record = createWorkspace(this.root, {
      project: selection.source,
      base: selection.base,
      bindings,
    });
    record.resolvedAssignment = captured;
    record.objective = text;
    this.captureInput(record, input, text, shortlist);
    return { text, bindings, shortlist, owner, captured, record };
  }
  private captureInput(
    record: RecordData,
    input: TaskPlanInput,
    text: string,
    shortlist: TaskProposal['shortlist'],
  ): void {
    record.taskInput = {
      request: { path: resolve(input.input), text, sha256: digest(text) },
      authority: this.authority,
      sourceHead: this.sourceHead,
      shortlist,
    };
    save(this.root, record);
  }
  private capture(
    selection: { source: string; base: string },
    owner: string,
    text: string,
    bindings: Bindings,
    initializerModel?: string,
  ) {
    const hostChecks = Object.entries(bindings.taskAcceptance ?? {}).flatMap(([id, checks]) =>
      checks.map((check) => ({ ...check, id: id + '-' + check.id })),
    );
    return resolveAssignment(selection.source, selection.base, owner, {
      bindings,
      initializerModel,
      value: {
        schemaVersion: 3,
        kind: 'research',
        objective: text,
        expectedOutcome: 'Read-only task proposal',
        acceptanceCriteria: ['Select existing owners or report a precise architectural need'],
        hostChecks,
      },
    });
  }
  private unchanged(
    captured: ResolvedAssignment,
    input: TaskPlanInput,
    owner: string,
    text: string,
  ): void {
    new TaskAuthority().verify(this.authority);
    const current = this.capture(
      resolveBase(input.project, captured.base),
      owner,
      text,
      loadBindings(input.bindings),
      input.initializerModel,
    );
    if (
      current.digest !== captured.digest ||
      git(input.project, 'rev-parse', 'HEAD').trim() !== this.sourceHead
    )
      throw new InputError('Task inputs changed during initialization; create a new plan');
  }
  private proposal(
    record: RecordData,
    input: TaskPlanInput,
    text: string,
    shortlist: TaskProposal['shortlist'],
    bindings: Bindings,
  ): TaskProposal {
    const initialization = record.initialization as InitializationEvidence;
    const result = structuredClone(initialization.result!);
    const execution = new ProposalResolution(
      record.source,
      record.base,
      bindings,
      input.initializerModel,
    ).resolve(result);
    record.status = result.status;
    record.stage = 'proposal';
    return new ProposalStore(this.root).save({
      ...this.identity(record, input, text),
      shortlist,
      initialization,
      status: result.status,
      routing: result,
      execution,
    });
  }
  private identity(record: RecordData, input: TaskPlanInput, text: string) {
    return {
      schemaVersion: 1 as const,
      id: record.id,
      source: record.source,
      base: record.base,
      sourceHead: this.sourceHead,
      request: { path: resolve(input.input), text, hash: digest(text) },
      bindingsPath: input.bindings ? resolve(input.bindings) : undefined,
      ...this.authority,
    };
  }
  private finish(record: RecordData): void {
    record.finishedAt = new Date().toISOString();
    record.elapsedMs = Date.now() - Date.parse(record.startedAt);
    save(this.root, record);
    saveMarkdown(this.root, record);
  }
}
