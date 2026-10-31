import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handoffFixture } from "./handoff-fixture.mjs";
for (const stage of [
  "planning",
  "planning-updates",
  "specification",
  "implementation",
  "review",
  "clarify",
  "completed-specification",
  "refresh",
])
  test("built workday delivers and resumes " + stage, (t) => {
    const f = handoffFixture(t, stage),
      r = f.workday();
    assert.equal(r.status, 0, r.stderr + "\n" + r.stdout);
    const w = JSON.parse(r.stdout);
    assert.equal(w.status, "completed");
    assert.equal(w.assignments.length, 2);
    assert.ok(w.messages.some((m) => m.payload.decision === "delivered"));
    const calls = readFileSync(f.calls, "utf8")
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.ok(calls.some((c) => c.owner === "dependency"));
    assert.ok(
      calls
        .filter((c) => c.owner === "sample")
        .some((c) => c.args.includes("resume")),
    );
    assert.equal(f.git("status", "--porcelain"), "");
    assert.equal(w.parking.status, "restored");
    assert.ok(w.metrics.usageComplete);
    const markdown = readFileSync(
      join(f.state, "workdays", w.workspaceId, "report.md"),
      "utf8",
    );
    assert.match(markdown, /## Host checks/);
    assert.match(markdown, /## Outstanding needs/);
  });
test("rejected owner request ends workday with retained requester changes", (t) => {
  const f = handoffFixture(t, "reject"),
    r = f.workday();
  assert.equal(r.status, 1, r.stderr);
  const w = JSON.parse(r.stdout);
  assert.equal(w.status, "blocked");
  assert.equal(w.parking.status, "restored");
});
for (const mode of [
  "unknown-owner",
  "unsolicited-answer",
  "duplicate",
  "exhaust-clarification",
  "forged",
  "foreign-edit",
  "weak-test",
  "no-delivery",
])
  test(
    "workday retains failure without unauthorized delivery: " + mode,
    (t) => {
      const f = handoffFixture(t, mode),
        r = f.workday();
      assert.equal(r.status, 1, r.stderr);
      const w = JSON.parse(r.stdout);
      assert.notEqual(w.status, "completed");
      assert.match(
        w.error,
        /owner|Nested|budget|requesting|Other-owner|Command failed|blocked|Coordination/i,
      );
      if (mode === "unknown-owner")
        assert.match(
          readFileSync(
            join(f.state, "workdays", w.workspaceId, "report.md"),
            "utf8",
          ),
          /ownerId.*unknown/,
        );
      if (mode === "no-delivery")
        assert.equal(
          w.messages.some((m) => m.payload.decision === "delivered"),
          false,
        );
    },
  );
test("recipient corrective attempt is real and does not reset requester counters", (t) => {
  const f = handoffFixture(t, "repair"),
    r = f.workday();
  assert.equal(r.status, 0, r.stderr);
  const w = JSON.parse(r.stdout),
    a = w.assignments.find(
      (a) => a.resolvedAssignment.componentId === "dependency",
    );
  assert.equal(a.implementationAttempts, 2);
  assert.ok(a.turns.some((t) => t.activity === "correction"));
  assert.equal(
    w.assignments.find((a) => a.resolvedAssignment.componentId === "sample")
      .implementationAttempts,
    1,
  );
});

test("combined acceptance rejects a regression after verified delivery", (t) => {
  const f = handoffFixture(t, "combined-failure"),
    r = f.workday();
  assert.equal(r.status, 1, r.stderr);
  const w = JSON.parse(r.stdout);
  assert.equal(w.status, "failed");
  assert.ok(w.messages.some((m) => m.payload.decision === "delivered"));
  assert.match(w.error, /acceptance|Command failed/i);
});

test("SDK output schema exposes only currently eligible coordination actions", (t) => {
  const f = handoffFixture(t),
    r = f.workday();
  assert.equal(r.status, 0, r.stderr);
  const calls = readFileSync(f.calls, "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.deepEqual(
    calls.find((c) => c.owner === "sample" && c.stage === "planning")
      .coordinationSchema.anyOf[1].properties.action.enum,
    ["request"],
  );
  assert.deepEqual(
    calls.find((c) => c.owner === "dependency" && c.stage === "planning")
      .coordinationSchema.anyOf[1].properties.action.enum,
    ["accept", "reject", "clarify"],
  );
  assert.deepEqual(
    calls.find((c) => c.owner === "dependency" && c.stage === "specification")
      .coordinationSchema,
    { type: "null" },
  );
  assert.deepEqual(
    calls
      .filter((c) => c.owner === "sample" && c.stage === "implementation")
      .at(-1).coordinationSchema,
    { type: "null" },
  );
});
