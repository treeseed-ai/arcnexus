import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { digest, type ResolvedAssignment } from '../architecture/assignment.js';
import { InputError } from '../architecture/config.js';
import type { InitializationResult } from '../architecture/initialization.js';
import type { WorkdayInput } from '../workday/workday-config.js';
import type { InitializationEvidence } from './initializer.js';
import type { RetrievedOwner } from './retrieval.js';

export interface TaskProposal {
  schemaVersion: 1;
  id: string;
  source: string;
  base: string;
  sourceHead: string;
  request: { path: string; text: string; hash: string };
  bindingsPath?: string;
  executable: string;
  executableHash?: string;
  supervisingBuild: { path: string; hash: string };
  shortlist: RetrievedOwner[];
  initialization: InitializationEvidence;
  status: InitializationResult['status'];
  routing: InitializationResult;
  execution?:
    { kind: 'run'; resolved: ResolvedAssignment } | { kind: 'workday'; input: WorkdayInput };
  digest: string;
}

/** Persists captured intake proposals outside the candidate for explicit caller acceptance. */
export class ProposalStore {
  /** Selects the private state root used to retain immutable task proposals. */
  constructor(private readonly root: string) {}

  /** Persists the current evidence so later inspection can reconstruct this state. */
  save(value: Omit<TaskProposal, 'digest'>): TaskProposal {
    const proposal = { ...value, digest: digest(JSON.stringify(value)) };
    const directory = join(this.root, 'proposals');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, proposal.id + '.json');
    writeFileSync(path + '.tmp', JSON.stringify(proposal, null, 2) + '\n', {
      mode: 0o600,
      flush: true,
    });
    renameSync(path + '.tmp', path);
    writeFileSync(join(directory, proposal.id + '.md'), this.markdown(proposal), { mode: 0o600 });
    return proposal;
  }

  /** Reads a retained proposal and checks its identity before inspection or execution. */
  load(id: string): TaskProposal {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new InputError('Invalid proposal identity');
    try {
      const value = JSON.parse(
        readFileSync(join(this.root, 'proposals', id + '.json'), 'utf8'),
      ) as TaskProposal;
      const { digest: hash, ...data } = value;
      if (value.schemaVersion !== 1 || value.id !== id || digest(JSON.stringify(data)) !== hash)
        throw new Error('Proposal integrity mismatch');
      return value;
    } catch (error) {
      throw new InputError(String(error));
    }
  }

  /** Renders a caller-reviewable proposal without applying architectural changes. */
  private markdown(value: TaskProposal): string {
    return `# Task proposal ${value.id}\n\nStatus: ${value.status}\n\nRevision: ${value.base}\n\n${value.request.text}\n\n## Captured initialization\n\n\`\`\`json\n${JSON.stringify(value.initialization, null, 2)}\n\`\`\`\n\nExecution requires explicit task run; architectural changes require caller integration and a new plan.\n`;
  }
}
