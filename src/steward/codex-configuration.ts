import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ResolvedAssignment } from '../architecture/assignment.js';
import { milliseconds } from '../architecture/config.js';
import { targetEnvironment, toolDirectories } from '../architecture/bindings.js';
import { preparePermissions, type AccessPolicy } from '../architecture/permissions.js';
import type { Plan } from '../assignment/plan.js';
import type { OperationBridge } from '../operations/operations.js';
import { execute } from '../operations/process.js';
import { processStart } from '../operations/service-state.js';
import type { Member } from '../workspace/members.js';
import { save, type RecordData } from '../workspace/state.js';
import { persistExecutionEvidence } from './evidence.js';

export interface CodexInput {
  responseContract?: 'initializer-result';
  root: string;
  record: RecordData;
  prompt: string;
  executable: string;
  model: string;
  signal: AbortSignal;
  resumeId?: string;
  operations?: OperationBridge;
}

export class CodexConfiguration {
  readonly dir: string;
  readonly launcher: string;
  readonly pidFile: string;
  readonly profile;
  readonly schema;
  readonly coordinationActions: string[];
  readonly permissions;
  readonly env: Record<string, string>;
  readonly settings;

  constructor(readonly input: CodexInput) {
    this.dir = join(input.root, 'runs', input.record.id);
    this.launcher = join(this.dir, 'codex-launcher');
    this.pidFile = join(this.dir, 'codex.pid');
    const resolved = input.record.resolvedAssignment as ResolvedAssignment | undefined;
    this.profile = resolved?.executionProfile;
    this.coordinationActions = Array.isArray(input.record.coordinationActions)
      ? (input.record.coordinationActions as string[])
      : [];
    this.schema = this.resultSchema();
    const authority = this.authority(resolved);
    this.permissions = this.permissionPolicy(authority);
    this.env = this.environment();
    this.settings = this.executionSettings(authority);
  }

  private resultSchema() {
    if (this.input.responseContract)
      return JSON.parse(
        readFileSync(new URL('../../schemas/initializer-result.json', import.meta.url), 'utf8'),
      );
    const schema = JSON.parse(
      readFileSync(new URL('../../schemas/agent-result.json', import.meta.url), 'utf8'),
    );
    if ((this.profile?.schemaVersion ?? 1) >= 2) schema.required = Object.keys(schema.properties);
    else {
      delete schema.properties.plan;
      delete schema.properties.planUpdates;
    }
    const plan = this.input.record.plan as Plan | undefined;
    if ((this.profile?.schemaVersion ?? 1) >= 2 && plan)
      schema.properties.planUpdates.items.properties.id.enum = plan.items.map((item) => item.id);
    if (this.input.record.workdayId) {
      schema.properties.coordination = this.coordinationSchema();
      schema.required.push('coordination');
    }
    return schema;
  }

  private coordinationSchema() {
    if (!this.coordinationActions.length) return { type: 'null' };
    return {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          properties: {
            action: { enum: this.coordinationActions },
            contract: { type: 'string' },
            requestId: { type: ['string', 'null'] },
            text: { type: 'string' },
            activityComplete: { type: 'boolean' },
          },
          required: ['action', 'contract', 'requestId', 'text', 'activityComplete'],
          additionalProperties: false,
        },
      ],
    };
  }

  private authority(resolved: ResolvedAssignment | undefined) {
    const { record } = this.input;
    const context = record.context as
      Array<{ access?: unknown; allowedWritePaths?: unknown }> | undefined;
    const component = context?.at(-1);
    const declared = component?.access as AccessPolicy;
    const readOnly = record.readOnlyTurn === true;
    return {
      allowedWritePaths: readOnly
        ? []
        : (resolved?.allowedWritePaths ?? component?.allowedWritePaths),
      access: readOnly
        ? {
            readPaths: [...new Set([...declared.readPaths, ...declared.writeDirectories])],
            writeDirectories: [],
          }
        : declared,
      inherited:
        context?.slice(0, -1).map((item) => ({
          access: item.access,
          allowedWritePaths: item.allowedWritePaths,
        })) ?? [],
    };
  }

  private permissionPolicy(authority: ReturnType<CodexConfiguration['authority']>) {
    const { record } = this.input;
    return preparePermissions(
      record.workspace,
      authority.access,
      authority.allowedWritePaths,
      join(this.dir, 'tmp'),
      authority.inherited,
      ((record.members ?? []) as Member[]).map((m) => m.workspace),
      toolDirectories(record),
    );
  }

  private environment(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const name of [
      'HOME',
      'PATH',
      'CODEX_HOME',
      'TMPDIR',
      'LANG',
      'SSL_CERT_FILE',
      'SSL_CERT_DIR',
      'HTTPS_PROXY',
      'HTTP_PROXY',
      'NO_PROXY',
      'XDG_CONFIG_HOME',
      'XDG_DATA_HOME',
    ])
      if (process.env[name]) env[name] = process.env[name]!;
    const { executable, record } = this.input;
    env.ARCNEXUS_CODEX_EXECUTABLE = executable.includes('/') ? resolve(executable) : executable;
    env.ARCNEXUS_CODEX_PID = this.pidFile;
    env.ARCNEXUS_NODE = process.execPath;
    env.ARCNEXUS_CODEX_SUPERVISOR = fileURLToPath(
      new URL('./codex-supervisor.js', import.meta.url),
    );
    env.ARCNEXUS_HOST_PID = String(process.pid);
    env.ARCNEXUS_HOST_START = processStart(process.pid)!;
    env.TMPDIR = this.permissions.tmpDirectory;
    env.PATH = targetEnvironment(record).PATH!;
    return env;
  }

  private executionSettings(authority: ReturnType<CodexConfiguration['authority']>) {
    return {
      coordinationActions: this.input.record.workdayId ? this.coordinationActions : undefined,
      evidenceMode: this.input.record.evidenceMode ?? 'unspecified',
      model: this.input.model,
      reasoning: this.profile?.reasoning ?? 'medium',
      permissionProfile: 'arcnexus',
      access: authority.access,
      allowedWritePaths: authority.allowedWritePaths,
      filesystem: this.permissions.filesystem,
      approval: 'never',
      network: false,
      webSearch: this.profile?.webSearch ?? 'live',
      nestedDelegation: false,
      managedTools:
        (this.profile?.schemaVersion ?? 1) >= 2
          ? ['plan.update', ...(this.input.operations?.tools.map((t) => t.name) ?? [])]
          : [],
      executable: this.env.ARCNEXUS_CODEX_EXECUTABLE!,
    };
  }

  async capture(): Promise<void> {
    appendFileSync(join(this.dir, 'events.jsonl'), '', { mode: 0o600 });
    writeFileSync(
      this.launcher,
      '#!/bin/sh\nexec "$ARCNEXUS_NODE" "$ARCNEXUS_CODEX_SUPERVISOR" "$@"\n',
      { mode: 0o700 },
    );
    const { root, record, prompt } = this.input;
    await persistExecutionEvidence(
      root,
      record,
      prompt,
      this.settings.executable,
      this.settings,
      this.schema,
      this.env,
      this.input.signal,
    );
    record.settings = this.settings;
    record.attemptReportedUsage = undefined;
    save(root, record);
  }

  async preflight(): Promise<void> {
    const { root, record } = this.input;
    try {
      record.sandboxPreflight = { ...(await this.probe()), status: 'passed' };
    } catch (error) {
      record.sandboxPreflight = {
        status: 'failed',
        error: String(error),
        ...(error && typeof error === 'object' && 'commandResult' in error
          ? (error.commandResult as object)
          : {}),
      };
      throw new Error(`Codex permission sandbox preflight failed: ${String(error)}`, {
        cause: error,
      });
    } finally {
      writeFileSync(
        join(this.dir, 'sandbox-preflight.json'),
        JSON.stringify(record.sandboxPreflight, null, 2) + '\n',
        { mode: 0o600 },
      );
      save(root, record);
    }
  }

  private async probe() {
    const { record, signal } = this.input;
    const turn = (record.turns as unknown[]).length;
    const home = join(this.dir, `sandbox-preflight-home-${turn}`);
    mkdirSync(home, { recursive: true, mode: 0o700 });
    const args = ['sandbox', '--permission-profile', 'arcnexus', '--cd', record.workspace];
    for (const override of this.permissions.configOverrides) args.push('--config', override);
    args.push('--', 'true');
    return execute(
      { command: this.settings.executable, args },
      record.workspace,
      join(this.dir, `sandbox-preflight-${turn}.log`),
      signal,
      {
        env: { ...this.env, CODEX_HOME: home },
        timeoutMs: milliseconds(this.profile?.commandTimeoutSeconds),
      },
    );
  }
}
