import { cleanup, createWorkspace, prepareWorkspace } from '../../library/workspace/workspace.js';
import type { RecordData } from '../../library/workspace/state.js';
import type { AssignmentCommand } from './assignment-command.js';
import type { CliValues } from './arguments.js';

/** Creates or removes owned workspaces through the existing lifecycle service. */
export class WorkspaceCommand {
  constructor(private readonly values: CliValues) {}

  create(root: string, input: ReturnType<AssignmentCommand['resolve']>): RecordData {
    return createWorkspace(root, {
      project: this.values.project!,
      base: input.selection?.base ?? this.values.base,
      issue: this.values.issue,
      bindings: input.bindings,
    });
  }

  async prepare(root: string, record: RecordData, signal: AbortSignal): Promise<void> {
    await prepareWorkspace(root, record, signal);
  }

  cleanup(root: string, id: string): void {
    console.log(JSON.stringify(cleanup(root, id)));
  }
}
