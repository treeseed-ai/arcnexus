import { cleanup, createWorkspace, prepareWorkspace } from '../../library/workspace/workspace.js';
import type { RecordData } from '../../library/workspace/state.js';
import type { AssignmentCommand } from './assignment-command.js';
import type { CliValues } from './arguments.js';

/** Creates or removes owned workspaces through the existing lifecycle service. */
export class WorkspaceCommand {
  /** Retains workspace options without performing preparation or cleanup. */
  constructor(private readonly values: CliValues) {}

  /** Prepares a fresh application-owned worktree and its declared environment. */
  create(root: string, input: ReturnType<AssignmentCommand['resolve']>): RecordData {
    return createWorkspace(root, {
      project: this.values.project!,
      base: input.selection?.base ?? this.values.base,
      issue: this.values.issue,
      bindings: input.bindings,
    });
  }

  /** Establishes the prerequisites required by the subsequent execution. */
  async prepare(root: string, record: RecordData, signal: AbortSignal): Promise<void> {
    await prepareWorkspace(root, record, signal);
  }

  /** Removes owned resources only after their lifecycle checks succeed. */
  cleanup(root: string, id: string): void {
    console.log(JSON.stringify(cleanup(root, id)));
  }
}
