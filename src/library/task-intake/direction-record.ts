import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ExecutionContext, type ProjectExecution } from '../architecture/execution-context.js';
import { save, type RecordData } from '../workspace/state.js';

/** Creates independent read-only model identities without inheriting worker thread or operation state. */
export class DirectionRecords {
  /** Retains the captured authority used for every independent assessment. */
  constructor(
    private readonly root: string,
    private readonly context: ProjectExecution,
  ) {}

  /** Captures research authority and a fresh evidence directory for direction or review. */
  create(workspace: RecordData, owner: string, objective: string, profile: string): RecordData {
    const resolved = this.authority(owner, objective, profile);
    const record: RecordData = {
      id: randomUUID(),
      source: workspace.source,
      workspace: workspace.workspace,
      branch: workspace.branch,
      base: workspace.base,
      commonDir: workspace.commonDir,
      startedAt: new Date().toISOString(),
      environment: workspace.environment,
      bindings: workspace.bindings,
      members: workspace.members,
      status: 'running',
      commands: [],
      turns: [],
      context: resolved.context,
      resolvedAssignment: resolved,
      readOnlyTurn: true,
      stage: 'research',
    };
    mkdirSync(join(this.root, 'runs', record.id), { recursive: true, mode: 0o700 });
    save(this.root, record);
    return record;
  }

  /** Captures source-read-only research authority under the selected execution profile. */
  private authority(owner: string, objective: string, profile: string) {
    const resolved = new ExecutionContext().assignment(
      this.context,
      owner,
      {
        schemaVersion: 3,
        kind: 'research',
        objective,
        expectedOutcome: objective,
        acceptanceCriteria: [objective],
        hostChecks: [],
      },
      profile,
    );
    return resolved;
  }
}
