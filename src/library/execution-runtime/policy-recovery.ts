import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ExecutionStore } from '../coordination-store/execution-store.js';
import { save, type RecordData } from '../workspace/state.js';

/** Retains lost read-only activations so lifecycle recovery cannot replay uncertain policy operations. */
export class PolicyRecovery {
  /** Shares the host's evidence directory and transactional run identities. */
  constructor(
    private readonly root: string,
    private readonly store: ExecutionStore,
  ) {}

  /** Reconciles unfinished policy reports before any workday can be resumed. */
  recover(): void {
    const runs = new Map(this.store.runs().map((run) => [run.id, run]));
    for (const entry of readdirSync(join(this.root, 'runs'), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(this.root, 'runs', entry.name, 'report.json');
      if (!existsSync(path)) continue;
      const record = JSON.parse(readFileSync(path, 'utf8')) as RecordData;
      const run = runs.get(String(record.executionRunId));
      if (
        !run ||
        !record.readOnlyTurn ||
        !record.activationRole ||
        !['running', 'interrupted'].includes(record.status)
      )
        continue;
      if (record.id !== entry.name)
        throw new Error('Policy evidence identity differs from its directory');
      record.status = 'interrupted';
      record.error = 'Host exited before a policy checkpoint; operation completion is uncertain';
      save(this.root, record);
      const current = this.store.run(run.id);
      const retained = (current.data.uncertainPolicyRecords ?? []) as string[];
      this.store.updateRun(run.id, current.status, {
        uncertainPolicyRecords: [...new Set([...retained, record.id])],
      });
    }
  }
}
