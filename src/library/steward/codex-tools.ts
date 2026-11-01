import { acceptPlan, updatePlan } from '../assignment/plan.js';
import { observe } from '../report/timeline.js';
import { openBridge, type BridgeTool } from './bridge.js';
import type { CodexConfiguration } from './codex-configuration.js';

const planTool: BridgeTool = {
  name: 'plan.update',
  description:
    'Update steward checklist items only, never hostChecks. New items require a reasoned plan revision first. Completion is an agent claim.',
  inputSchema: {
    type: 'object',
    properties: {
      updates: { type: 'array', items: { type: 'object' } },
      revision: { type: 'object' },
      reason: { type: 'string' },
    },
    additionalProperties: false,
  },
};

/** Exposes only declared operation and checklist tools through the MCP adapter. */
export class CodexTools {
  error: unknown;

  readonly controller = new AbortController();

  private bridge: Awaited<ReturnType<typeof openBridge>> | undefined;

  /** Captures the dependencies and state used throughout this instance’s lifecycle. */
  constructor(private readonly configuration: CodexConfiguration) {}

  /** Handles signal within this component’s captured contract. */
  get signal(): AbortSignal {
    return AbortSignal.any([this.configuration.input.signal, this.controller.signal]);
  }

  /** Handles open within this component’s captured contract. */
  async open(): Promise<object> {
    if ((this.configuration.profile?.schemaVersion ?? 1) < 2) return {};
    const { operations, responseContract } = this.configuration.input;
    this.bridge = await openBridge(
      [...(operations?.tools ?? []), ...(responseContract ? [] : [planTool])],
      (name, args) => this.call(name, args),
      () => operations?.disconnect(),
    );
    return this.bridge.config as object;
  }

  /** Handles call within this component’s captured contract. */
  private async call(name: string, args: unknown): Promise<unknown> {
    const { operations, root, record } = this.configuration.input;
    try {
      if (name !== 'plan.update') {
        if (!operations) throw new Error('Operations unavailable');
        return await operations.call(name, args);
      }
      if (this.configuration.input.responseContract)
        throw new Error('Initializer has no checklist authority');
      return this.update(args);
    } catch (error) {
      this.error = error;
      observe(root, record, 'tool.denied', { name, error: String(error) });
      this.controller.abort(error);
      throw error;
    }
  }

  /** Handles update within this component’s captured contract. */
  private update(args: unknown) {
    const { root, record } = this.configuration.input;
    record.planUpdateCalls = Number(record.planUpdateCalls ?? 0) + 1;
    const limit = this.configuration.profile?.maxChecklistCalls;
    if (limit !== undefined && Number(record.planUpdateCalls) > limit)
      throw new Error('Plan update budget exhausted');
    if (record.stage === 'planning') throw new Error('Plan updates require an accepted plan');
    if (
      !args ||
      typeof args !== 'object' ||
      Object.keys(args).some((k) => !['updates', 'revision', 'reason'].includes(k))
    )
      throw new Error('Invalid plan update arguments');
    const input = args as { updates?: unknown; revision?: unknown; reason?: string };
    if (input.revision) {
      if (input.updates || typeof input.reason !== 'string' || !input.reason.trim())
        throw new Error('Plan revision requires reason and excludes progress updates');
      acceptPlan(root, record, input.revision, input.reason);
    } else updatePlan(root, record, input.updates);
    return { status: 'recorded', plan: record.plan };
  }

  /** Releases resources owned by this instance. */
  async close(): Promise<void> {
    const { operations } = this.configuration.input;
    try {
      await operations?.close();
    } finally {
      operations?.disconnect();
      await this.bridge?.close();
    }
  }
}
