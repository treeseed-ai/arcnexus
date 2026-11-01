import { accessSync, constants, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { digest } from '../architecture/assignment.js';
import { ExecutionContext } from '../architecture/execution-context.js';
import type { Bindings } from '../architecture/bindings.js';
import { ConfigurationReader } from '../architecture/configuration.js';
import { InputError } from '../architecture/config.js';
import { validateSchema } from '../architecture/schema.js';
import { git } from '../operations/process.js';

interface PromptCase {
  id: string;
  project: string;
  prompt: string;
  expectedOutcome: string;
}

interface PromptDefinition {
  schemaVersion: 3;
  modes: Array<'simulation' | 'live'>;
  cases: PromptCase[];
}

interface CampaignBindings {
  runner: string;
  codexPath?: string;
  projects: Record<string, { path: string; base?: string }>;
  tools: Record<string, string>;
}

export interface PromptExperimentCase extends PromptCase {
  base: string;
  cwd: string;
  bindings: Bindings;
}

export interface PromptExperimentInput {
  schemaVersion: 3;
  evidenceMode: 'simulation' | 'live' | 'unselected';
  runner: string;
  cases: PromptExperimentCase[];
  digest: string;
}

/** Captures prompt-only cases against clean committed package authority before execution. */
export class PromptExperimentResolver {
  /** Resolves all cases and local bindings without creating candidates or launching inference. */
  resolve(
    manifest: string,
    bindingPath: string,
    mode?: 'simulation' | 'live',
  ): PromptExperimentInput {
    const reader = new ConfigurationReader();
    const definition = validateSchema<PromptDefinition>(
      'experiment-v3',
      reader.file(manifest).value,
    );
    const bindings = validateSchema<CampaignBindings>(
      'experiment-bindings',
      reader.file(bindingPath).value,
    );
    if (mode && !definition.modes.includes(mode))
      throw new InputError('Unsupported campaign evidence mode');
    this.executable(bindings.runner);
    const cases = this.cases(definition, bindings);
    const input: Omit<PromptExperimentInput, 'digest'> = {
      schemaVersion: 3 as const,
      evidenceMode: mode ?? 'unselected',
      runner: bindings.runner,
      cases,
    };
    return { ...input, digest: digest(JSON.stringify(input)) };
  }

  /** Validates unique case identities while capturing every project before execution. */
  private cases(definition: PromptDefinition, bindings: CampaignBindings): PromptExperimentCase[] {
    const ids = new Set<string>();
    return definition.cases.map((item) => {
      if (ids.has(item.id)) throw new InputError('Duplicate case identity');
      ids.add(item.id);
      return this.capture(item, bindings);
    });
  }

  /** Pins the selected package and merges only validated machine executable bindings. */
  private capture(item: PromptCase, bindings: CampaignBindings): PromptExperimentCase {
    const project = Object.hasOwn(bindings.projects, item.project)
      ? bindings.projects[item.project]
      : undefined;
    if (!project) throw new InputError('Missing project binding: ' + item.project);
    const context = new ExecutionContext().resolve(project.path);
    if (!project.base || project.base !== context.base)
      throw new InputError('Prompt campaign requires the pinned current source commit');
    if (git(context.source, 'status', '--porcelain').trim())
      throw new InputError('Prompt campaign requires a clean source checkout');
    const { configurationSource: _source, ...captured } = context.bindings;
    const tools = { ...captured.tools, ...bindings.tools };
    if (bindings.codexPath) tools.codex = bindings.codexPath;
    for (const path of Object.values(tools)) this.executable(path);
    if (!tools.codex)
      throw new InputError('Prompt campaign requires an explicit executable binding');
    return {
      ...item,
      project: context.source,
      base: context.base,
      cwd: relative(context.source, resolve(project.path)),
      bindings: { ...captured, tools },
    };
  }

  /** Rejects ambiguous or nonexecutable local runner/tool paths before creating campaign state. */
  private executable(path: string): void {
    if (!isAbsolute(path) || !statSync(path).isFile())
      throw new InputError('Expected absolute executable');
    accessSync(path, constants.X_OK);
  }
}
