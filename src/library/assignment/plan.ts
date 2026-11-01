import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ResolvedAssignment } from '../architecture/assignment.js';
import { validateSchema } from '../architecture/schema.js';
import { observe } from '../report/timeline.js';
import { save, type RecordData } from '../workspace/state.js';
export type ChecklistStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'blocked';
export interface PlanItem {
  id: string;
  activity: string;
  result: string;
  criteria: number[];
  expectedEvidence: string[];
  dependencies: string[];
  status: ChecklistStatus;
  evidence: string[];
  explanation: string;
  basis?: string;
}
export interface Plan {
  approach: string;
  assumptions: string[];
  activities: Array<{ activity: string; reason: string }>;
  items: PlanItem[];
  questions: string[];
  version?: number;
  hostChecks?: Array<{ id: string; status: string; evidence: string[] }>;
}
export interface PlanUpdate {
  id: string;
  status: ChecklistStatus;
  explanation: string;
  evidence: string[];
}
const escape = (s: string) =>
  s.replace(/[\r\n]/g, ' ').replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'));
export function planMarkdown(plan: Plan): string {
  return (
    `# Assignment plan — version ${plan.version}\n\n${escape(plan.approach)}\n\n` +
    plan.items
      .map(
        (i) =>
          `- [${i.status === 'completed' ? 'x' : ' '}] ${escape(i.id)}: ${escape(i.result)} — ${i.status} (${i.basis ?? 'agent plan'})\n  Evidence: ${i.evidence.map(escape).join(', ') || 'none'}; ${escape(i.explanation)}`,
      )
      .join('\n') +
    '\n\n## Host acceptance\n\n' +
    (plan.hostChecks ?? [])
      .map(
        (i) =>
          `- [${i.status === 'completed' ? 'x' : ' '}] ${escape(i.id)} — host ${i.status}; ${i.evidence.map(escape).join(', ')}`,
      )
      .join('\n') +
    '\n'
  );
}
function persist(root: string, record: RecordData, plan: Plan, reason: string): void {
  plan.version = Number((record.plan as Plan | undefined)?.version ?? 0) + 1;
  record.plan = plan;
  const dir = join(root, 'runs', record.id);
  mkdirSync(join(dir, 'plans'), { recursive: true, mode: 0o700 });
  const json = JSON.stringify(plan, null, 2) + '\n',
    md = planMarkdown(plan);
  for (const name of ['plan', `plans/${plan.version}`]) {
    writeFileSync(join(dir, name + '.json'), json, { mode: 0o600 });
    writeFileSync(join(dir, name + '.md'), md, { mode: 0o600 });
  }
  observe(root, record, 'plan.updated', {
    version: plan.version,
    reason,
    artifact: `plans/${plan.version}.json`,
  });
  save(root, record);
}
export function acceptPlan(
  root: string,
  record: RecordData,
  value: unknown,
  reason = 'Initial plan validated; host workflow remains mandatory',
): void {
  const plan = validateSchema<Plan>('plan', value),
    resolved = record.resolvedAssignment as ResolvedAssignment;
  const ids = new Set(plan.items.map((i) => i.id));
  if (ids.size !== plan.items.length) throw new Error('Duplicate checklist identity');
  const allowed = resolved.role.activities;
  for (const a of plan.activities)
    if (!allowed.includes(a.activity)) throw new Error('Plan activity outside role');
  validatePlanItems(plan, resolved, ids);
  validatePlanDependencies(plan, ids);
  for (let n = 0; n < resolved.assignment.acceptanceCriteria.length; n++)
    if (!plan.items.some((i) => i.criteria.includes(n)))
      throw new Error('Plan omits acceptance criterion');
  plan.hostChecks = [{ id: 'final-verification', status: 'pending', evidence: [] }];
  persist(root, record, plan, reason);
}
export function updatePlan(root: string, record: RecordData, updates: unknown): void {
  const values = validateSchema<PlanUpdate[]>('plan-updates', updates),
    plan = structuredClone(record.plan) as Plan | undefined;
  if (!plan) throw new Error('No accepted plan');
  for (const update of values) {
    const item = plan.items.find((i) => i.id === update.id);
    if (!item) throw new Error('Unknown checklist item');
    if (
      update.status === 'completed' &&
      (!update.evidence.length ||
        item.dependencies.some(
          (d) => !['completed', 'skipped'].includes(plan.items.find((i) => i.id === d)!.status),
        ))
    )
      throw new Error('Checklist completion requires evidence and satisfied dependencies');
    Object.assign(item, update, { basis: 'agent claim' });
  }
  persist(root, record, plan, 'Steward progress update');
}
export function completePlan(root: string, record: RecordData): void {
  const plan = structuredClone(record.plan) as Plan | undefined;
  if (!plan) return;
  if (plan.items.some((i) => !['completed', 'skipped'].includes(i.status)))
    throw new Error('Assignment checklist remains incomplete or blocked');
  plan.hostChecks = [
    {
      id: 'final-verification',
      status: 'completed',
      evidence: record.commands.filter((c) => c.exitCode === 0).map((c) => c.log),
    },
  ];
  persist(root, record, plan, 'Required host checks passed');
}

function validatePlanDependencies(plan: Plan, ids: Set<string>): void {
  const visit = (id: string, path = new Set<string>()): void => {
    if (path.has(id)) throw new Error('Cyclic checklist dependencies');
    const next = new Set(path).add(id);
    for (const d of plan.items.find((i) => i.id === id)!.dependencies) visit(d, next);
  };
  for (const id of ids) visit(id);
}

function validatePlanItems(plan: Plan, resolved: ResolvedAssignment, ids: Set<string>): void {
  const allowed = resolved.role.activities;
  for (const i of plan.items) {
    if (!plan.activities.some((a) => a.activity === i.activity))
      throw new Error(
        `Checklist item ${i.id} activity ${i.activity} is absent from plan.activities`,
      );
    if (
      !allowed.includes(i.activity) ||
      i.criteria.some((n) => n >= resolved.assignment.acceptanceCriteria.length) ||
      i.dependencies.some((d) => !ids.has(d) || d === i.id) ||
      i.status !== 'pending'
    )
      throw new Error('Invalid plan checklist authority/criteria/dependencies');
  }
}
