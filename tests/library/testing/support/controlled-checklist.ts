import type { WorkflowTurn } from './controlled-workflow.js';

/** Reproduces a completed specification turn with checklist claims ahead of its prerequisites. */
export class ControlledChecklist {
  /** Chooses one correctable response or a persistent equivalent validation failure. */
  constructor(private readonly mode: string) {}

  /** Adds a dependency-bearing documentation item and returns stage-appropriate progress claims. */
  apply(turn: WorkflowTurn): void {
    if (this.intercept(turn)) return;
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

  /** Selects completed blocking or transport faults before generating checklist correction claims. */
  private intercept(turn: WorkflowTurn): boolean {
    if (this.mode === 'restricted-role') {
      this.restrictedRole(turn);
      return true;
    }
    if (this.mode === 'safe-blocked' && turn.stage === 'specification') {
      turn.result.status = 'blocked';
      turn.result.blockers = ['Required contract decision'];
      return true;
    }
    if (this.mode === 'checklist-transport' && turn.stage === 'specification')
      throw new Error('Disconnected before final checklist response');
    return false;
  }

  /** Inspects the actual SDK schema and review prompt instead of granting extra fixture authority. */
  private restrictedRole(turn: WorkflowTurn): void {
    const properties = turn.schema.properties;
    const plan = properties.plan.anyOf.find((entry: any) => entry.properties).properties;
    const declarations = [properties.activities, plan.activities, plan.items];
    for (const declaration of declarations) {
      const activities = declaration.items.properties.activity.enum;
      if (!activities || activities.includes('release') || !activities.includes('review'))
        throw new Error('CAPTURED_ROLE_SCHEMA_REQUIRED');
    }
    if (turn.stage !== 'review') return;
    if (turn.prompt.includes('Release means handoff'))
      throw new Error('REVIEW_MUST_NOT_GRANT_RELEASE');
    turn.result.activities = turn.result.activities.filter(
      (item: any) => item.activity !== 'release',
    );
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
