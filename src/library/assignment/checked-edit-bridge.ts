import { readSchema } from '../architecture/schema.js';
import { join } from 'node:path';
import { digest } from '../architecture/assignment.js';
import { covered, classifyComponentPath } from '../architecture/components.js';
import type { BridgeTool } from '../steward/bridge.js';
import { CheckedEdits } from '../workspace/checked-edits.js';
import type { SessionState } from './session-state.js';

/** Exposes checked source mutation only through the active assignment's host-bound connection. */
export class CheckedEditBridge {
  readonly tools: BridgeTool[];

  private readonly edits: CheckedEdits;

  /** Captures authority independently of arguments supplied by an agent or its subprocesses. */
  constructor(private readonly state: SessionState) {
    const { record } = state.options;
    this.edits = new CheckedEdits(
      record.workspace,
      join(state.dir, 'checked-edits'),
      digest(JSON.stringify([state.resolved.digest, record.assignmentId ?? record.id])),
      (path) => this.authorize(path),
    );
    this.tools = [
      {
        name: 'source.edit',
        description:
          'Apply an idempotent batch of owned source edits. Read bytes first and supply current SHA-256 hashes. This is the only source write route.',
        inputSchema: readSchema('checked-edits'),
      },
    ];
  }

  /** Resolves validated interrupted transactions before another activation may write source. */
  recover(): void {
    this.edits.recover();
  }

  /** Applies only this bridge's tool, retaining a host journal and exact content receipts. */
  call(name: string, args: unknown): unknown {
    if (name !== 'source.edit') throw new Error('Unknown edit tool');
    const receipt = this.edits.apply(args);
    this.state.journal(String(this.state.options.record.stage), 'source.edited', receipt);
    this.state.safe();
    return receipt;
  }

  /** Enforces narrowing, workflow stage and frozen regression authority before any file is modified. */
  private authorize(path: string): void {
    const { record } = this.state.options;
    if (
      record.readOnlyTurn ||
      this.state.assignment.kind !== 'change' ||
      !['specification', 'implementation', 'correction'].includes(String(record.stage))
    )
      throw new Error('Source edits are forbidden in the current workflow stage');
    if (!covered(path, this.state.scope))
      throw new Error(`Edit outside active assignment: ${path}`);
    const kind = classifyComponentPath(this.state.component, path);
    if (this.state.documentationOnly && kind !== 'documentation')
      throw new Error(`Documentation assignment cannot edit ${kind}: ${path}`);
    if (record.stage === 'specification' && !['documentation', 'tests'].includes(kind))
      throw new Error(`Specification cannot edit ${kind}: ${path}`);
    if (record.stage !== 'specification' && this.state.frozen.some((test) => test.path === path))
      throw new Error(`Implementation cannot change frozen regression: ${path}`);
  }
}
