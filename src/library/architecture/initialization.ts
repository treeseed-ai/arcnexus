import type { Operation } from '../operations/operations.js';
import type { Catalog, Component, ExecutionProfile, Role } from './components.js';
import { InputError } from './config.js';

export interface InitializationSnapshot {
  operations: Operation[];
  provenance: 'declared-component' | 'runtime-fallback';
  componentId: string;
  context: Component[];
  role: Role;
  profile: ExecutionProfile;
  catalog: Component[];
  model: string;
  reasoning: 'medium';
}

export interface OwnerSelection {
  id: string;
  reason: string;
}

export interface ProposedAssignment {
  ownerId: string;
  objective: string;
  kind: 'change' | 'research' | 'review';
  changeType: 'behavior' | 'documentation';
  acceptanceCriteria: string[];
  allowedWritePaths: string[];
}

export interface ArchitectureProposal {
  responsibility: string;
  definitionsYaml: string;
  directories: Array<{ owner: string; path: string }>;
  relationships: string[];
  roles: string[];
  operations: string[];
  verification: string[];
  affectedOwners: string[];
  migration: string[];
  acceptanceCriteria: string[];
  questions: string[];
}

export interface InitializationResult {
  status: 'ready' | 'needs_clarification' | 'architecture_change_required';
  summary: string;
  selectedOwners: OwnerSelection[];
  rejectedOwners: OwnerSelection[];
  questions: string[];
  assignments: ProposedAssignment[];
  dependency: { from: string; to: string; contract: string; delivery: string } | null;
  architectureProposal: ArchitectureProposal | null;
}

function lineage(catalog: Catalog, component: Component): Component[] {
  const result = [component];
  while (component.parentId) {
    component = catalog.components[component.parentId]!;
    if (!component || result.includes(component))
      throw new InputError('Invalid initializer ancestry');
    result.unshift(component);
  }
  return result;
}

export function validateInitialization(catalog: Catalog): void {
  for (const component of Object.values(catalog.components)) {
    if (component.schemaVersion >= 3 && component.type === 'platform' && !component.initialization)
      throw new InputError('Version-three platform requires an initializer: ' + component.id);
    if (!component.initialization) continue;
    if (component.schemaVersion < 3 || component.type !== 'platform')
      throw new InputError('Only version-three platforms declare initialization');
    const initializer = catalog.components[component.initialization.componentId];
    if (!initializer || !lineage(catalog, initializer).some((owner) => owner.id === component.id))
      throw new InputError('Initializer must belong to the declaring platform');
    if (!catalog.roles[initializer.role]?.activities.includes('research'))
      throw new InputError('Initializer role must permit research');
  }
}

export function captureInitialization(
  catalog: Catalog,
  owner: Component,
  model = 'gpt-6-luna',
): InitializationSnapshot {
  const platform = lineage(catalog, owner).find((component) => component.type === 'platform');
  const identity = platform?.initialization?.componentId;
  const component = identity ? catalog.components[identity]! : fallback(owner.repository);
  return {
    provenance: identity ? 'declared-component' : 'runtime-fallback',
    operations: (component.operationIds ?? []).map((id) => catalog.operations[id]!),
    componentId: component.id,
    context: identity ? lineage(catalog, component) : [component],
    role: identity ? catalog.roles[component.role]! : fallbackRole(),
    profile: { ...initializerProfile(catalog, component, !!identity), model, reasoning: 'medium' },
    catalog: Object.values(catalog.components),
    model,
    reasoning: 'medium',
  };
}

function fallback(repository: string): Component {
  return {
    schemaVersion: 3,
    id: 'runtime-intake',
    type: 'library',
    repository,
    path: '.',
    purpose: 'Confirm existing architectural responsibility without changing authority',
    objectives: ['Identify routing mismatches and missing responsibilities'],
    constraints: ['Source-read-only; no catalog-write authority; no recursion'],
    access: { readPaths: ['.'], writeDirectories: [] },
    allowedWritePaths: [],
    verification: [],
    questions: [],
    patterns: [],
    interfaces: [],
    documentation: [],
    tests: [],
    relatedIds: [],
    role: 'runtime-intake',
    executionProfile: 'runtime-intake',
    operationIds: [],
  };
}

function fallbackRole(): Role {
  return {
    schemaVersion: 3,
    id: 'runtime-intake',
    purpose: 'Read-only routing confirmation',
    responsibilities: ['Preserve captured authority'],
    activities: ['research'],
  };
}

function initializerProfile(
  catalog: Catalog,
  component: Component,
  declared: boolean,
): ExecutionProfile {
  return declared
    ? catalog.profiles[component.executionProfile]!
    : {
        schemaVersion: 3,
        id: 'runtime-intake',
        model: 'gpt-6-luna',
        reasoning: 'medium',
        webSearch: 'live',
        operationCategories: [],
      };
}
