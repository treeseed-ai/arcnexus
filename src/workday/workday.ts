import { mkdirSync, writeFileSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { workdayMarkdown, workdayMetrics } from "../report/workday-report.js";
import { covered } from "../architecture/components.js";
import { WorkdayStore, type Message } from "../coordination-store/workday-store.js";
import {
  WorktreeParking,
  assertOwner,
  snapshotChanges,
} from "./workday-parking.js";
import { ActiveBudget } from "./workday-budget.js";
import type { WorkdayInput, WorkdayParticipant } from "./workday-config.js";
import { StewardSession, type SessionControl } from "../assignment/steward.js";
import type { AgentResult } from "../steward/codex.js";
import {
  createWorkspace,
  prepareWorkspace,
  assertIdentity,
  assertGeneratedOutputs,
} from "../workspace/workspace.js";
import { captureChanges } from "../change-inspection/changes.js";
import { prepareCapabilities } from "../operations/probes.js";
import { candidateDigest, validateRequests } from "../assignment/checkpoints.js";
import {
  digest,
  materializeChecks,
  type ResolvedAssignment,
} from "../architecture/assignment.js";
import { targetCommand } from "../architecture/bindings.js";
import { operationEnvironment } from "../operations/operations.js";
import { execute } from "../operations/process.js";
import { save, type RecordData } from "../workspace/state.js";
import { saveMarkdown } from "../report/report.js";
import { observeExecution } from "../report/timeline.js";
import { processStart, assertServicesStopped } from "../operations/service-state.js";
import { InputError, type Command } from "../architecture/config.js";
interface Owner {
  participant: WorkdayParticipant;
  record: RecordData;
  budget: ActiveBudget;
  session: StewardSession;
  foreign: ReturnType<typeof snapshotChanges>;
  engineering: number;
  lastCheckpoint?: string;
}
function blocked(message: string): Error {
  const error = new Error(message);
  error.name = "WorkdayBlocked";
  return error;
}
/** Bounded deterministic handoff; model execution remains in StewardSession. */
export class WorkdayRunner {
  private store!: WorkdayStore;
  private workspace!: RecordData;
  private input!: WorkdayInput;
  private owners: Owner[] = [];
  private parking!: WorktreeParking;
  private routingMs = 0;
  private status = "preparing";
  private error: string | undefined;
  private activeOwner: string | null = null;
  private coordinationTurns = 0;
  private clarificationRounds = 0;
  private requestId: string | undefined;
  private accepted = false;
  private started = Date.now();
  private signal!: AbortSignal;
  private directory!: string;
  constructor(
    private root: string,
    private parentSignal: AbortSignal,
    private executable: string,
  ) {}
  private state() {
    return {
      host: { pid: process.pid, start: processStart(process.pid) },
      workspaceId: this.workspace.id,
      workspace: this.workspace.workspace,
      base: this.input.base,
      status: this.status,
      error: this.error,
      activeOwner: this.activeOwner,
      elapsedMs: Date.now() - this.started,
      coordinationTurns: this.coordinationTurns,
      clarificationRounds: this.clarificationRounds,
      routingMs: this.routingMs,
      parking: { status: this.parking.status, path: this.parking.path },
      budgets: { workdaySeconds: 2400, assignmentSeconds: 900 },
      inputHash: this.input.digest,
      evidenceMode: this.workspace.evidenceMode,
    };
  }
  private persist(type: string, payload: unknown, messages: Message[] = []) {
    const start = Date.now();
    this.store.commit(type, payload, {
      workday: {
        id: this.workspace.id,
        status: this.status,
        data: this.state(),
      },
      assignments: this.owners.map((o) => ({
        id: o.participant.resolved.componentId,
        status: o.record.status,
        data: { ...o.record, activeMs: o.budget.elapsedMs },
      })),
      messages,
    });
    if (/^(request|response|candidate|assignment.resumed)/.test(type))
      this.routingMs += Date.now() - start;
  }
  private sync(owner: Owner) {
    const checkpoint = owner.record.checkpoint as
      { path: string; sha256: string } | undefined;
    if (checkpoint) {
      if (digest(readFileSync(checkpoint.path)) !== checkpoint.sha256)
        throw new Error("Checkpoint artifact changed");
      if (owner.lastCheckpoint !== checkpoint.sha256) {
        this.store.commit(
          "checkpoint.captured",
          { owner: owner.participant.resolved.componentId, checkpoint },
          {
            execution: {
              assignment: owner.participant.resolved.componentId,
              data: {
                checkpoint,
                threadId: owner.record.threadId,
                turn: owner.record.turns,
              },
            },
          },
        );
        owner.lastCheckpoint = checkpoint.sha256;
      }
    }
    this.persist("assignment.checkpoint", {
      owner: owner.participant.resolved.componentId,
    });
  }
  private activate(owner: Owner) {
    this.activeOwner = owner.participant.resolved.componentId;
    owner.budget.start();
    this.persist("assignment.activated", { owner: this.activeOwner });
  }
  private async command(owner: Owner, c: Command, stage: string) {
    owner.budget.signal.throwIfAborted();
    const before = candidateDigest(owner.record),
      log = join(
        this.root,
        "runs",
        owner.record.id,
        `command-${owner.record.commands.length}.log`,
      );
    let result;
    try {
      result = await execute(
        targetCommand(owner.record, c),
        owner.record.workspace,
        log,
        owner.budget.signal,
        {
          timeoutMs: Math.min(
            120000,
            owner.participant.resolved.executionProfile.commandTimeoutSeconds *
              1000,
          ),
          env: operationEnvironment(owner.record),
        },
      );
      owner.record.commands.push({ ...result, stage });
    } catch (error) {
      if (error && typeof error === "object" && "commandResult" in error)
        owner.record.commands.push({
          ...(error.commandResult as RecordData["commands"][number]),
          stage,
        });
      throw error;
    } finally {
      save(this.root, owner.record);
      this.persist("host.check", {
        owner: owner.participant.resolved.componentId,
        stage,
        result: owner.record.commands.at(-1),
      });
    }
    if (candidateDigest(owner.record) !== before)
      throw new Error(stage + " changed candidate source/index");
    assertIdentity(owner.record);
    assertGeneratedOutputs(owner.record.workspace, owner.record.environment);
  }
  private async refresh(owner: Owner) {
    for (const c of owner.participant.refresh)
      await this.command(owner, c, "handoff-refresh");
  }
  private message(
    from: Owner,
    to: Owner,
    kind: Message["kind"],
    payload: unknown,
    replyTo?: string,
  ): Message {
    return {
      id: randomUUID(),
      from: from.participant.resolved.componentId,
      to: to.participant.resolved.componentId,
      kind,
      payload,
      replyTo,
    };
  }
  private context(owner: Owner): string {
    return `Workday participant: ${owner.participant.resolved.componentId}. Exactly two captured owners; no delegation. Contract: ${this.input.dependency.contract}. Required delivery: ${this.input.dependency.delivery}. ${owner === this.owners[0] ? "If the captured objective needs the recipient, return status=blocked, one precise requests entry, and coordination action=request, requestId=null." : "During planning decide accept, reject, or one precise clarification. Acceptance must include a valid plan and activityComplete=true; it is not delivery."} Coordination includes action, contract, requestId, text and activityComplete. Set coordination=null on ordinary turns. A partial activity sets activityComplete=false and will continue after verified delivery. Do not invent messages or acceptance checks. No new owner or contract may be selected.`;
  }
  private async onResult(
    owner: Owner,
    session: StewardSession,
    activity: string,
    result: AgentResult,
  ): Promise<{ again: boolean; feedback: string }> {
    const c = result.coordination!;
    if (
      Buffer.byteLength(JSON.stringify(result.requests)) +
        Buffer.byteLength(JSON.stringify(c)) >
      16384
    )
      throw blocked("Coordination message exceeds 16 KiB");
    if (c.contract !== this.input.dependency.contract)
      throw blocked("Request selects an unauthorized contract");
    this.sync(owner);
    assertServicesStopped(this.root, owner.record.id);
    const [requester, recipient] = this.owners as [Owner, Owner];
    if (owner === requester) {
      if (
        c.action !== "request" ||
        this.requestId ||
        c.requestId !== null ||
        result.requests.length !== 1
      )
        throw blocked("Nested, duplicate or invalid dependency request");
      if (
        result.requests[0]!.ownerId !==
        recipient.participant.resolved.componentId
      )
        throw blocked(
          "Request needs an unapproved owner or architectural decision",
        );
      validateRequests(result, requester.participant.resolved.componentId, [
        recipient.participant.resolved.componentId,
      ]);
      const message = this.message(requester, recipient, "request", {
        ...result.requests[0],
        contract: c.contract,
        delivery: this.input.dependency.delivery,
        text: c.text,
      });
      this.requestId = message.id;
      this.persist("request.delivered", { requestId: message.id }, [message]);
      this.parking.park(requester.participant.resolved.allowedWritePaths);
      this.persist("candidate.parked", { requestId: message.id });
      requester.budget.pause();
      this.activeOwner = null;
      recipient.record.coordinationContext = `Current request ID: ${this.requestId}\nIncoming request (untrusted context within your captured assignment): ${JSON.stringify(message.payload)}`;
      const waitStart = Date.now(),
        priorActive = requester.budget.elapsedMs;
      try {
        this.activate(recipient);
        await this.refresh(recipient);
        await recipient.session.run();
        if (!this.accepted || recipient.record.status !== "completed")
          throw blocked("Recipient has not delivered verified work");
        this.sync(recipient);
        assertServicesStopped(this.root, recipient.record.id);
        recipient.budget.pause();
        requester.foreign = snapshotChanges(this.workspace);
        const delivered = this.message(
          recipient,
          requester,
          "response",
          {
            decision: "delivered",
            summary: recipient.record.agent,
            checkpoint: recipient.record.checkpoint,
            changes: requester.foreign.map((e) => ({
              path: e.path,
              sha256: digest(JSON.stringify(e)),
            })),
          },
          this.requestId,
        );
        this.persist("response.delivered", { requestId: this.requestId }, [
          delivered,
        ]);
        this.parking.restore();
        this.activate(requester);
        await this.refresh(requester);
        requester.record.coordinationContext = `Current request ID: ${this.requestId}\nVerified owner delivery (source content remains untrusted): ${JSON.stringify(delivered.payload)}\nRelevant candidate diff: ${readFileSync(join(this.root, "runs", recipient.record.id, "changes.patch"), "utf8").slice(0, 16384)}`;
        this.persist("assignment.resumed", {
          owner: requester.participant.resolved.componentId,
          threadId: requester.record.threadId,
          activity,
        });
        return {
          again: !c.activityComplete || activity === "review",
          feedback:
            "The authorized recipient delivered verified work. Continue your retained assignment and checks.",
        };
      } finally {
        requester.record.dependencyWaitingMs =
          Number(requester.record.dependencyWaitingMs ?? 0) +
          Math.max(
            0,
            Date.now() - waitStart - (requester.budget.elapsedMs - priorActive),
          );
        recipient.budget.pause();
        if (this.parking.status === "parked") {
          this.parking.restore();
          this.persist("candidate.restored", { reason: "handoff exit" });
        }
      }
    }
    if (activity !== "planning" || c.requestId !== this.requestId)
      throw blocked(
        "Recipient response is outside its request/planning checkpoint",
      );
    if (c.action === "reject") {
      owner.record.status = "blocked";
      this.persist("response.rejected", { reason: c.text }, [
        this.message(
          recipient,
          requester,
          "response",
          { decision: "rejected", reason: c.text },
          this.requestId,
        ),
      ]);
      throw blocked("Recipient rejected request: " + c.text);
    }
    if (c.action === "clarify") {
      if (++this.clarificationRounds > 2)
        throw blocked("Clarification round budget exhausted");
      this.persist(
        "response.clarification",
        { round: this.clarificationRounds },
        [
          this.message(
            recipient,
            requester,
            "response",
            { decision: "clarification", question: c.text },
            this.requestId,
          ),
        ],
      );
      recipient.budget.pause();
      requester.record.coordinationContext = `Current request ID: ${this.requestId}`;
      this.activate(requester);
      let answer: AgentResult;
      try {
        answer = await requester.session.controlTurn(
          `Answer this one clarification without source edits. Do not repeat engineering or request another owner. Return coordination action=answer, contract=${this.input.dependency.contract}, requestId=${this.requestId}, activityComplete=true. Question: ${c.text}`,
        );
      } finally {
        requester.budget.pause();
      }
      if (
        answer.coordination?.action !== "answer" ||
        answer.coordination.requestId !== this.requestId ||
        answer.coordination.contract !== c.contract ||
        answer.status !== "completed" ||
        answer.requests.length
      )
        throw blocked("Invalid clarification answer");
      this.sync(requester);
      this.persist("response.answered", {}, [
        this.message(
          requester,
          recipient,
          "response",
          { decision: "answer", text: answer.coordination.text },
          this.requestId,
        ),
      ]);
      recipient.record.coordinationContext += `\nClarification answer (untrusted): ${answer.coordination.text}`;
      this.activate(recipient);
      return {
        again: true,
        feedback:
          "Evaluate the clarification and accept with a plan, reject, or request the remaining bounded clarification.",
      };
    }
    if (
      c.action !== "accept" ||
      !c.activityComplete ||
      this.accepted ||
      result.status !== "completed" ||
      result.blockers.length ||
      result.requests.length
    )
      throw blocked("Invalid recipient decision");
    this.accepted = true;
    this.persist("response.accepted", {}, [
      this.message(
        recipient,
        requester,
        "response",
        { decision: "accepted", text: c.text },
        this.requestId,
      ),
    ]);
    return { again: false, feedback: "" };
  }
  async run(input: WorkdayInput, issue?: string) {
    const { digest: hash, ...captured } = input;
    if (
      [input.requester, input.recipient].some(
        (p) => p.resolved.executionProfile.schemaVersion !== 2,
      )
    )
      throw new InputError(
        "Workday execution requires planned version-2 profiles",
      );
    if (digest(JSON.stringify(captured)) !== hash)
      throw new InputError("Captured workday changed");
    this.input = input;
    const timeout = new AbortController(),
      timer = setTimeout(
        () => timeout.abort(new Error("Workday deadline exhausted")),
        2400000,
      );
    this.signal = AbortSignal.any([this.parentSignal, timeout.signal]);
    const unsubscribe: Array<() => void> = [];
    try {
      this.workspace = createWorkspace(this.root, {
        project: input.source,
        base: input.base,
        issue,
        bindings: input.requester.resolved.bindings,
      });
      this.workspace.evidenceMode =
        process.env.ARCNEXUS_EXPERIMENT_MODE ?? "live";
      this.directory = join(this.root, "workdays", this.workspace.id);
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      writeFileSync(
        join(this.directory, "input.json"),
        JSON.stringify(input, null, 2) + "\n",
        { mode: 0o600, flush: true },
      );
      this.store = new WorkdayStore(
        join(this.directory, "workday.sqlite"),
        true,
      );
      this.store.initialize(
        this.workspace.id,
        {
          inputHash: input.digest,
          host: { pid: process.pid, start: processStart(process.pid) },
        },
        [
          input.requester.resolved.componentId,
          input.recipient.resolved.componentId,
        ],
      );
      this.parking = new WorktreeParking(
        this.workspace,
        join(this.directory, "parking.json"),
      );
      this.workspace.workday = {
        id: this.workspace.id,
        assignments: [],
        parking: this.parking.path,
        active: true,
      };
      save(this.root, this.workspace);
      await prepareWorkspace(this.root, this.workspace, this.signal);
      for (const participant of [input.requester, input.recipient]) {
        const record: RecordData = {
          ...this.workspace,
          id: randomUUID(),
          status: "prepared",
          commands: [],
          startedAt: new Date().toISOString(),
          resolvedAssignment: participant.resolved,
          context: participant.resolved.context,
          objective: participant.resolved.assignment.objective,
          workdayId: this.workspace.id,
        };
        delete record.timelineSequence;
        delete record.workday;
        mkdirSync(join(this.root, "runs", record.id), { mode: 0o700 });
        const budget = new ActiveBudget(
          this.signal,
          Math.min(900, participant.resolved.executionProfile.timeoutSeconds) *
            1000,
        );
        const owner = {} as Owner;
        Object.assign(owner, {
          participant,
          record,
          budget,
          foreign: [],
          engineering: 0,
        });
        const control: SessionControl = {
          prepared: true,
          context: "",
          inspect: () =>
            assertOwner(
              record,
              participant.resolved.allowedWritePaths,
              owner.foreign,
            ),
          elapsedMs: () => budget.elapsedMs,
          actions: (activity) =>
            owner === this.owners[0]
              ? activity === "coordination"
                ? ["answer"]
                : this.requestId
                  ? []
                  : ["request"]
              : activity === "planning" && !this.accepted
                ? ["accept", "reject", "clarify"]
                : [],
          chargeTurn: (kind) => {
            if (kind === "coordination") {
              if (++this.coordinationTurns > 6)
                throw new Error("Coordination turn budget exhausted");
            } else if (
              ++owner.engineering >
              Math.min(
                participant.resolved.executionProfile.maxTurns,
                participant.resolved.assignment.kind === "change" ? 4 : 2,
              ) +
                (participant.maxAttempts === 2 ? 2 : 0)
            )
              throw new Error("Engineering turn budget exhausted");
          },
          onResult: (session, activity, result) =>
            this.onResult(owner, session, activity, result),
        };
        owner.session = new StewardSession(
          this.root,
          record,
          participant.resolved.componentId,
          participant.resolved.assignment.objective,
          participant.resolved.executionProfile.model,
          this.executable,
          budget.signal,
          participant.maxAttempts,
          control,
        );
        this.owners.push(owner);
        control.context = this.context(owner);
        unsubscribe.push(
          observeExecution(this.root, record.id, (event) =>
            this.store.commit("execution." + event.type, {
              owner: participant.resolved.componentId,
              runId: record.id,
              sequence: event.sequence,
              turn: event.turn,
              artifact: join(this.root, "runs", record.id, "timeline.jsonl"),
            }),
          ),
        );
      }
      this.persist(
        "assignments.captured",
        { authority: input.digest },
        this.owners.map((owner) =>
          this.message(owner, owner, "assignment", {
            issuer: "host",
            authorityHash: owner.participant.resolved.digest,
            assignment: owner.participant.resolved.assignment,
          }),
        ),
      );
      this.workspace.workday = {
        id: this.workspace.id,
        assignments: this.owners.map((o) => o.record.id),
        parking: this.parking.path,
        active: true,
      };
      save(this.root, this.workspace);
      for (const owner of this.owners) {
        this.activate(owner);
        await prepareCapabilities(this.root, owner.record, owner.budget.signal);
        for (const c of owner.participant.resolved.verification)
          await this.command(owner, c, "baseline");
        owner.budget.pause();
      }
      this.status = "running";
      const requester = this.owners[0]!;
      this.activate(requester);
      await requester.session.run();
      requester.budget.pause();
      this.sync(requester);
      if (
        !this.requestId ||
        !this.accepted ||
        this.owners.some((o) => o.record.status !== "completed")
      )
        throw blocked("Workday did not complete the authorized dependency");
      for (const owner of this.owners) {
        owner.foreign = snapshotChanges(this.workspace).filter(
          (e) =>
            !owner.participant.resolved.allowedWritePaths.some(
              (p) => p === "." || e.path === p || e.path.startsWith(p + "/"),
            ),
        );
        this.activate(owner);
        await this.refresh(owner);
        await owner.session.verifyFinal();
        owner.session.captureCheckpoint();
        this.sync(owner);
        owner.budget.pause();
      }
      const checks = materializeChecks(
        {
          ...input.requester.resolved,
          artifacts: input.artifacts,
          assignment: {
            ...input.requester.resolved.assignment,
            hostChecks: input.acceptance,
          },
        } as ResolvedAssignment,
        join(this.directory, "acceptance"),
      );
      this.activate(requester);
      for (const c of checks)
        await this.command(requester, c, "combined-acceptance");
      requester.budget.pause();
      this.status = "completed";
    } catch (error) {
      this.error = String(error);
      this.status = this.parentSignal.aborted
        ? "cancelled"
        : (error instanceof Error && error.name === "WorkdayBlocked") ||
            this.owners.some((o) => o.record.status === "blocked")
          ? "blocked"
          : /budget|deadline/i.test(String(error))
            ? "budget_exhausted"
            : "failed";
    } finally {
      clearTimeout(timer);
      for (const owner of this.owners) owner.budget.pause();
      if (this.parking?.status === "parked")
        try {
          this.parking.restore();
        } catch (error) {
          this.error = (this.error ?? "") + "; restoration: " + String(error);
          this.status = "failed";
        }
      for (const owner of this.owners) {
        try {
          assertServicesStopped(this.root, owner.record.id);
          captureChanges(this.root, owner.record);
          owner.record.finishedAt = new Date().toISOString();
          owner.record.activeMs = owner.budget.elapsedMs;
          owner.record.ownedChanges = (
            owner.record.changes as Array<{ path: string; kind: string }>
          ).filter((c) =>
            covered(c.path, owner.participant.resolved.allowedWritePaths),
          );
          save(this.root, owner.record);
          saveMarkdown(this.root, owner.record);
        } catch (error) {
          this.error = (this.error ?? "") + "; evidence: " + String(error);
          this.status = "failed";
        }
      }
      this.activeOwner = null;
      if (this.store && this.parking) {
        this.persist("workday.finished", {
          status: this.status,
          error: this.error,
        });
        for (const stop of unsubscribe) stop();
      }
      if (this.workspace) {
        if (this.workspace.workday)
          (this.workspace.workday as { active: boolean }).active = false;
        this.workspace.status = this.status;
        this.workspace.finishedAt = new Date().toISOString();
        this.workspace.error = this.error;
        captureChanges(this.root, this.workspace);
        save(this.root, this.workspace);
        saveMarkdown(this.root, this.workspace);
      }
    }
    if (!this.store)
      throw new InputError(this.error ?? "Workday preparation failed");
    try {
      const snapshot = this.store.snapshot(),
        report = {
          schemaVersion: 1,
          ...this.state(),
          exitCode:
            this.status === "completed"
              ? 0
              : this.status === "cancelled"
                ? 130
                : this.status === "failed" &&
                    !this.owners.some(
                      (o) =>
                        Array.isArray(o.record.turns) && o.record.turns.length,
                    )
                  ? 2
                  : 1,
          assignments: snapshot.assignments.map((a) => a.data as RecordData),
          messages: snapshot.messages.map((m) => ({
            id: m.id,
            from: m.sender,
            to: m.recipient,
            kind: m.kind,
            replyTo: m.reply_to,
            payload: m.data,
          })),
          events: this.store.events(),
        };
      Object.assign(report, { metrics: workdayMetrics(report) });
      const path = join(this.directory, "report.json");
      writeFileSync(path + ".tmp", JSON.stringify(report, null, 2) + "\n", {
        mode: 0o600,
      });
      renameSync(path + ".tmp", path);
      writeFileSync(
        join(this.directory, "report.md"),
        workdayMarkdown(report),
        { mode: 0o600 },
      );
      return report;
    } finally {
      this.store.close();
    }
  }
}
