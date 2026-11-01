import { digest } from '../architecture/assignment.js';
import { covered } from '../architecture/components.js';
import type { ProjectExecution } from '../architecture/execution-context.js';
import type { ExecutionAssignment, ExecutionRun } from '../coordination-store/execution-types.js';
import { git } from '../operations/process.js';

/** Selects fair self-directed stewardship using persisted relevant-input fingerprints. */
export class StewardshipPolicy {
  /** Uses captured package membership rather than a fixed participant list or model name. */
  constructor(private readonly context: ProjectExecution) {}

  /** Selects the oldest unconsidered eligible owner while preserving ready-assignment isolation. */
  next(
    run: ExecutionRun,
    assignments: ExecutionAssignment[],
  ): { owner: string; fingerprint: string } | undefined {
    const seen = (run.data.seen ?? {}) as Record<string, string>;
    for (const owner of run.owners) {
      if (
        assignments.some(
          (a) => a.owner === owner && ['ready', 'running', 'waiting'].includes(a.status),
        )
      )
        continue;
      const fingerprint = this.fingerprint(run, owner, assignments);
      if (seen[owner] !== fingerprint) return { owner, fingerprint };
    }
    return undefined;
  }

  /** Includes owned files, declared related interfaces and dependency delivery evidence, never elapsed time. */
  private fingerprint(
    run: ExecutionRun,
    owner: string,
    assignments: ExecutionAssignment[],
  ): string {
    const component = this.context.catalog.components[owner]!;
    const scope = [
      component.path,
      ...component.documentation,
      ...component.tests,
      ...component.relatedIds.flatMap((id) => {
        const related = this.context.catalog.components[id];
        return related ? [related.path, ...related.documentation] : [];
      }),
    ];
    const tree = git(this.context.source, 'ls-tree', '-r', String(run.data.candidateRevision))
      .split('\n')
      .filter((line) => covered(line.split('\t')[1] ?? '', scope));
    const history = assignments
      .filter((a) => a.owner === owner)
      .map((a) => ({
        id: a.id,
        status: a.status,
        evidence: a.evidence,
        dependencies: a.dependencies,
      }));
    return digest(JSON.stringify({ tree, history }));
  }
}
