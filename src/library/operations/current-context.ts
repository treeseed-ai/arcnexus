import type { ResolvedAssignment } from '../architecture/assignment.js';
import { currentComponentTests } from '../testing/captured-tests.js';
import type { RecordData } from '../workspace/state.js';
import { OperationArguments } from './operation-definition.js';
import type { Operation } from './operations.js';

/** Refreshes derived suite selection without replacing the run's captured owner, profile or definition. */
export function currentOperationContext<T extends Operation>(record: RecordData, operation: T): T {
  const resolved = record.resolvedAssignment as ResolvedAssignment | undefined;
  const tokens = operation.definitionArguments ?? [];
  if (
    !resolved ||
    !tokens.some((token) => typeof token !== 'string' && token.context === 'selectedTestFiles')
  )
    return operation;
  const owner = resolved.context.at(-1)!;
  const context = operation.resolvedContext;
  if (!context || context.ownerId !== owner.id || !context.testOutputRoot || !owner.testProfile)
    throw new Error('Current test selection requires captured owner and profile context');
  const selectedTests = currentComponentTests(owner, record.workspace, context.testOutputRoot);
  return {
    ...new OperationArguments().capture(operation, {
      ...context,
      selectedTestFiles: selectedTests.map((test) => test.compiled),
    }),
    selectedTests,
  } as T;
}
