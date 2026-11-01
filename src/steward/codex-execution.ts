import { ObservedProgress } from './observed-progress.js';
import { Codex, type ThreadEvent } from '@openai/codex-sdk';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { validateSchema } from '../architecture/schema.js';
import { observe } from '../report/timeline.js';
import { save } from '../workspace/state.js';
import { CodexConfiguration, type CodexInput } from './codex-configuration.js';
import { CodexTools } from './codex-tools.js';
import type { AgentResult } from './codex.js';

export class CodexExecution<T extends object = AgentResult> {
  private readonly configuration: CodexConfiguration;
  private readonly tools: CodexTools;
  private final = '';
  private completed = false;
  private termination: Promise<void> | undefined;
  private readonly abort = () => {
    this.termination = delay(300).then(() => this.killGroup());
  };

  constructor(private readonly input: CodexInput) {
    this.configuration = new CodexConfiguration(input);
    this.tools = new CodexTools(this.configuration);
  }

  async run(): Promise<T> {
    await this.configuration.capture();
    await this.configuration.preflight();
    const thread = this.thread(await this.tools.open());
    this.input.signal.addEventListener('abort', this.abort, { once: true });
    try {
      this.input.signal.throwIfAborted();
      const { events } = await thread.runStreamed(this.input.prompt, {
        outputSchema: this.configuration.schema,
        signal: this.tools.signal,
      });
      for await (const event of events) this.event(event);
      if (this.tools.error) throw this.tools.error;
      this.input.signal.throwIfAborted();
      if (!this.completed) throw new Error('Codex stream ended without completed turn');
      return this.result();
    } catch (error) {
      throw this.tools.error ?? error;
    } finally {
      await this.close();
    }
  }

  private thread(bridge: object) {
    const { launcher, env, permissions, profile } = this.configuration;
    const codex = new Codex({
      codexPathOverride: launcher,
      env,
      config: { ...bridge, features: { multi_agent: false, multi_agent_v2: false } },
      configOverrides: permissions.configOverrides,
    });
    const options = {
      model: this.input.model,
      modelReasoningEffort: profile?.reasoning ?? ('medium' as const),
      workingDirectory: this.input.record.workspace,
      approvalPolicy: 'never' as const,
      webSearchMode: profile?.webSearch ?? ('live' as const),
    };
    return this.input.resumeId
      ? codex.resumeThread(this.input.resumeId, options)
      : codex.startThread(options);
  }

  private event(event: ThreadEvent): void {
    const { root, record, resumeId } = this.input;
    observe(root, record, 'codex.event', event);
    appendFileSync(join(this.configuration.dir, 'events.jsonl'), JSON.stringify(event) + '\n', {
      mode: 0o600,
    });
    this.progress(event);
    if (event.type === 'thread.started') {
      if (resumeId && event.thread_id !== resumeId)
        throw new Error('Codex resumed an unexpected thread ID');
      record.threadId = event.thread_id;
      save(root, record);
    }
    if (event.type === 'item.completed' && event.item.type === 'agent_message')
      this.final = event.item.text;
    if (event.type === 'turn.completed') {
      record.attemptReportedUsage = event.usage;
      this.completed = true;
    }
    if (event.type === 'turn.failed') throw new Error(event.error.message);
    if (event.type === 'error') throw new Error(event.message);
  }

  private progress(event: ThreadEvent): void {
    try {
      new ObservedProgress(this.input.root, this.input.record).accept(event);
    } catch (error) {
      this.tools.error = error;
      this.tools.controller.abort(error);
      throw error;
    }
  }
  private result(): T {
    const { record } = this.input;
    const { dir, profile } = this.configuration;
    writeFileSync(join(dir, 'agent-result.raw.txt'), this.final, { mode: 0o600 });
    const result = validateSchema<T>(
      this.input.responseContract ?? (record.workdayId ? 'workday-agent-result' : 'agent-result'),
      JSON.parse(this.final),
    );
    if (!this.input.responseContract) this.checkCoordination(result as AgentResult);
    if (
      !this.input.responseContract &&
      (profile?.schemaVersion ?? 1) >= 2 &&
      (!Object.hasOwn(result, 'plan') || !Array.isArray((result as AgentResult).planUpdates))
    )
      throw new Error('Planned response requires plan and planUpdates');
    writeFileSync(join(dir, 'agent-result.json'), JSON.stringify(result, null, 2) + '\n', {
      mode: 0o600,
    });
    return result;
  }

  private checkCoordination(result: AgentResult): void {
    if (
      !this.input.record.workdayId ||
      !result.coordination ||
      this.configuration.coordinationActions.includes(result.coordination.action)
    )
      return;
    const error = new Error(
      'Coordination action unavailable at this checkpoint' +
        (result.coordination.action === 'request'
          ? '; nested/reverse dependency needs architectural escalation'
          : ''),
    );
    if (result.coordination.action === 'request') error.name = 'WorkdayBlocked';
    throw error;
  }

  private killGroup(): void {
    if (!existsSync(this.configuration.pidFile)) return;
    const pid = Number(readFileSync(this.configuration.pidFile, 'utf8').trim());
    if (!Number.isSafeInteger(pid) || pid <= 1) return;
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      /* Process may already have exited. */
    }
  }

  private async close(): Promise<void> {
    try {
      await this.tools.close();
    } finally {
      this.input.signal.removeEventListener('abort', this.abort);
      await this.termination;
      this.killGroup();
      save(this.input.root, this.input.record);
    }
  }
}
