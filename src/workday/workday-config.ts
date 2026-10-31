import { ConfigurationReader } from "../architecture/configuration.js";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve, isAbsolute } from "node:path";
import { validateSchema } from "../architecture/schema.js";
import {
  resolveAssignment,
  resolveBase,
  digest,
  type Assignment,
  type ResolvedAssignment,
  type HostCheck,
} from "../architecture/assignment.js";
import { loadBindings } from "../architecture/bindings.js";
import { commands, InputError, type Command } from "../architecture/config.js";
import { covered } from "../architecture/components.js";
interface Participant {
  component: string;
  assignment: string;
  maxAttempts?: 1 | 2;
  refresh: Command[];
}
interface Definition {
  schemaVersion: 1;
  requester: Participant;
  recipient: Participant;
  dependency: { from: string; to: string; contract: string; delivery: string };
  acceptance: HostCheck[];
}
export interface WorkdayParticipant {
  resolved: ResolvedAssignment;
  maxAttempts: 1 | 2;
  refresh: Command[];
}
export interface WorkdayInput {
  configurationSources?: import('../architecture/configuration.js').ConfigurationSource[];
  schemaVersion: 1;
  source: string;
  base: string;
  requester: WorkdayParticipant;
  recipient: WorkdayParticipant;
  dependency: Definition["dependency"];
  acceptance: HostCheck[];
  artifacts: ResolvedAssignment["artifacts"];
  digest: string;
}
export function resolveWorkday(
  path: string,
  project: string,
  base?: string,
  bindingsPath?: string,
  tools: Record<string, string> = {},
): WorkdayInput {
  try {
    const configurationSources = [new ConfigurationReader().file(path)];
    const definition = validateSchema<Definition>(
        "workday",
        configurationSources[0]!.value,
      ),
      selection = resolveBase(project, base),
      bindings = loadBindings(bindingsPath);
    if (bindings.configurationSource) configurationSources.push(bindings.configurationSource);
    const checks = (checks: HostCheck[], directory: string) =>
      checks.map((c) => ({
        ...c,
        command: tools[c.command] ?? bindings?.tools[c.command] ?? c.command,
        artifacts: c.artifacts.map((p) => resolve(directory, p)),
        args: c.args.map((a) =>
          c.artifacts.includes(a) ? resolve(directory, a) : a,
        ),
      }));
    const participant = (p: Participant): WorkdayParticipant => {
      const file = resolve(dirname(path), p.assignment);
      const source = new ConfigurationReader().file(file);
      configurationSources.push(source);
      const value = validateSchema<Assignment>(
          "assignment",
          structuredClone(source.value),
        );
      value.hostChecks = checks(value.hostChecks, dirname(file));
      value.priorEvidence = value.priorEvidence?.map((ref) => ({
        ...ref,
        path: resolve(dirname(file), ref.path),
      }));
      const resolved = resolveAssignment(
        selection.source,
        selection.base,
        p.component,
        { value, bindings },
      );
      commands(p.refresh);
      if (
        resolved.executionProfile.model !== "gpt-6-luna" ||
        resolved.executionProfile.reasoning !== "medium"
      )
        throw new InputError("Workdays require Luna/medium profiles");
      return { resolved, maxAttempts: p.maxAttempts ?? 1, refresh: p.refresh };
    };
    const requester = participant(definition.requester),
      recipient = participant(definition.recipient);
    if (
      requester.resolved.componentId === recipient.resolved.componentId ||
      definition.dependency.from !== requester.resolved.componentId ||
      definition.dependency.to !== recipient.resolved.componentId
    )
      throw new InputError("Invalid two-owner dependency edge");
    const a = requester.resolved.context.at(-1)!,
      b = recipient.resolved.context.at(-1)!;
    if (
      a.repository !== b.repository ||
      (requester.resolved.environment.workspace &&
        a.repository !== requester.resolved.environment.workspace.primary.id)
    )
      throw new InputError(
        "Both owners must belong to the same primary repository",
      );
    if (
      requester.resolved.allowedWritePaths.some(
        (p) =>
          covered(p, recipient.resolved.allowedWritePaths) ||
          recipient.resolved.allowedWritePaths.some((q) => covered(q, [p])),
      )
    )
      throw new InputError("Workday owner writable scopes overlap");
    const acceptance = checks(definition.acceptance, dirname(path)),
      artifacts: ResolvedAssignment["artifacts"] = [],
      ids = new Set<string>();
    for (const c of acceptance) {
      commands([c]);
      if (!isAbsolute(c.command) || ids.has(c.id))
        throw new InputError(
          "Independent checks require absolute executable and unique identity",
        );
      ids.add(c.id);
      for (const p of c.artifacts) {
        if (!statSync(p).isFile())
          throw new InputError("Expected acceptance artifact");
        const bytes = readFileSync(p);
        if (!artifacts.some((a) => a.path === p))
          artifacts.push({
            path: p,
            content: bytes.toString("base64"),
            sha256: digest(bytes),
          });
      }
    }
    const data = {
      configurationSources,
      schemaVersion: 1 as const,
      ...selection,
      requester,
      recipient,
      dependency: definition.dependency,
      acceptance,
      artifacts,
    };
    return { ...data, digest: digest(JSON.stringify(data)) };
  } catch (error) {
    throw new InputError(String(error));
  }
}
