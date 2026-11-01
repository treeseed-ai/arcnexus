import type { WorkflowTurn } from './controlled-workflow.js';

/** Reproduces a completed specification turn with checklist claims ahead of its prerequisites. */
export class ControlledChecklist {
  /** Chooses one correctable response or a persistent equivalent validation failure. */
  constructor(private readonly mode: string) {}

  /** Adds a dependency-bearing documentation item and returns stage-appropriate progress claims. */
  apply(turn: WorkflowTurn): void {
    if (this.mode === 'checklist-transport' && turn.stage === 'specification')
      throw new Error('Disconnected before final checklist response');
    if (!['checklist-recovery', 'checklist-loop'].includes(this.mode)) return;
    if (turn.stage === 'planning') return this.plan(turn);
    const specification = turn.stage === 'specification';
    const invalid =
      specification &&
      (this.mode === 'checklist-loop' ||
        !turn.prompt.includes('Checklist completion requires evidence and satisfied dependencies'));
    turn.result.planUpdates = [
      {
        id: 'work',
        status: specification ? 'in_progress' : 'completed',
        evidence: ['source.txt'],
        explanation: 'Observed bounded work',
      },
      {
        id: 'docs',
        status: invalid || !specification ? 'completed' : 'in_progress',
        evidence: ['docs/behavior.md'],
        explanation: 'Observed specification changes',
      },
    ];
  }

  /** Defines the accepted dependency that a premature completion claim must not bypass. */
  private plan(turn: WorkflowTurn): void {
    const plan = turn.result.plan;
    plan.activities.push({ activity: 'documentation', reason: 'Specify the requested behavior' });
    plan.items.push({
      ...plan.items[0],
      id: 'docs',
      activity: 'documentation',
      dependencies: ['work'],
    });
  }
}
