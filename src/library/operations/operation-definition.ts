import { createHash } from 'node:crypto';
import type { Operation } from './operations.js';

export type ContextInput =
  'ownerId' | 'ownedPaths' | 'packageRoot' | 'selectedTestFiles' | 'testOutputRoot';

export type ArgumentToken = string | { context: ContextInput };

export interface OperationContext {
  ownerId: string;
  ownedPaths: string[];
  packageRoot: string;
  selectedTestFiles?: string[];
  testOutputRoot?: string;
}

/** Resolves fixed host inputs without evaluating shell syntax or accepting caller substitutions. */
export class OperationArguments {
  /** Expands list inputs into distinct argv entries and rejects unavailable execution context. */
  resolve(tokens: ArgumentToken[], context: OperationContext): string[] {
    return tokens.flatMap((token) => {
      if (typeof token === 'string') return [token];
      const value = context[token.context];
      if (value === undefined) throw new Error(`Missing operation context: ${token.context}`);
      const entries = Array.isArray(value) ? value : [value];
      if (!entries.length || entries.some((entry) => !entry || entry.includes('\0')))
        throw new Error(`Empty or unsafe operation context: ${token.context}`);
      return entries;
    });
  }

  /** Captures resolved arguments and the exact definition identity independently of invocation purpose. */
  capture(operation: Operation, context: OperationContext): Operation {
    if (operation.schemaVersion !== 4) return operation;
    const definitionDigest = operation.definitionDigest!;
    const args = this.resolve(operation.argumentTokens ?? [], context);
    return {
      ...operation,
      args,
      argumentTokens: undefined,
      definitionDigest,
      resolvedContext: context,
    } as Operation;
  }
}

/** Orders explicit prerequisites once per checkpoint and rejects cycles before dispatch. */
export class OperationOrder {
  private readonly active = new Set<string>();

  private readonly completed = new Set<string>();

  private readonly ordered: Operation[] = [];

  /** Captures the operation definitions available to the current host authority. */
  constructor(private readonly operations: Record<string, Operation>) {}

  /** Computes a fresh deterministic dependency order without carrying completion across checkpoints. */
  resolve(ids: string[]): Operation[] {
    this.active.clear();
    this.completed.clear();
    this.ordered.length = 0;
    ids.forEach((id) => this.visit(id));
    return [...this.ordered];
  }

  /** Reports missing references and the blocking cycle instead of starting partial lifecycle work. */
  private visit(id: string): void {
    if (this.completed.has(id)) return;
    if (this.active.has(id))
      throw new Error(`Operation prerequisite cycle: ${[...this.active, id].join(' -> ')}`);
    const operation = Object.hasOwn(this.operations, id) ? this.operations[id] : undefined;
    if (!operation) throw new Error(`Unknown prerequisite operation: ${id}`);
    this.active.add(id);
    (operation.prerequisites ?? []).forEach((dependency) => this.visit(dependency));
    this.active.delete(id);
    this.completed.add(id);
    this.ordered.push(operation);
  }
}

/** Keeps authored argv tokens separate from executable arguments until the host supplies context. */
export function normalizeOperation(operation: Operation): Operation {
  if (operation.schemaVersion !== 4) return operation;
  const definitionDigest = createHash('sha256').update(JSON.stringify(operation)).digest('hex');
  return {
    ...operation,
    definitionDigest,
    probes: [],
    ...(operation.kind !== 'http'
      ? { argumentTokens: operation.args as ArgumentToken[], args: [] }
      : {}),
  };
}
