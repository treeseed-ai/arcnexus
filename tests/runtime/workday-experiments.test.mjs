import { test } from "node:test";
import assert from "node:assert/strict";
import {
  writeFileSync,
  existsSync,
  readFileSync,
  cpSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { handoffFixture } from "./handoff-fixture.mjs";
const cli = resolve("dist/cli.js");
test("built experiment inspection captures both workday participants without inference", (t) => {
  const f = handoffFixture(t),
    bindings = join(f.root, "bindings.json"),
    manifest = join(f.root, "experiment.json");
  writeFileSync(
    bindings,
    JSON.stringify({
      schemaVersion: 1,
      runner: cli,
      codexPath: f.executable,
      projects: { target: { path: f.repo, base: f.git("rev-parse", "HEAD") } },
      tools: { node: process.execPath },
    }),
  );
  writeFileSync(
    manifest,
    JSON.stringify({
      schemaVersion: 2,
      modes: ["live"],
      cases: [
        {
          id: "handoff",
          project: "target",
          workday: f.manifest,
          expectedOutcome: "completed",
          acceptance: [
            { command: "node", args: ["-e", "process.exit(0)"], artifacts: [] },
          ],
        },
      ],
    }),
  );
  const r = spawnSync(
    process.execPath,
    [cli, "experiment", "inspect", manifest, "--bindings", bindings, "--json"],
    { encoding: "utf8", env: f.env },
  );
  assert.equal(r.status, 0, r.stderr);
  const c = JSON.parse(r.stdout).cases[0];
  assert.equal(c.workday.requester.resolved.componentId, "sample");
  assert.equal(c.workday.recipient.resolved.componentId, "dependency");
  assert.ok(c.workday.digest);
  assert.equal(existsSync(f.calls), false);
  assert.equal(existsSync(f.state), false);
});
test("built experiment runs simulated workday through retained threads and independent checks", (t) => {
  const root = mkdtempSync(join(tmpdir(), "arcnexus-workday-experiment-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, "repo");
  cpSync("fixtures/workday", repo, { recursive: true });
  const git = (...args) => {
    const r = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  git("init", "-q");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.invalid");
  git("add", ".");
  git("commit", "-qm", "fixture");
  const bindings = join(root, "bindings.json"),
    output = join(root, "campaign");
  writeFileSync(
    bindings,
    JSON.stringify({
      schemaVersion: 1,
      runner: cli,
      projects: { fixture: { path: repo, base: git("rev-parse", "HEAD") } },
      tools: { node: process.execPath },
    }),
  );
  const r = spawnSync(
    process.execPath,
    [
      cli,
      "experiment",
      "run",
      resolve("experiments/workday-simulation.json"),
      "--bindings",
      bindings,
      "--mode",
      "simulation",
      "--output",
      output,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, ARCNEXUS_STATE_DIR: join(root, "state") },
      timeout: 90000,
    },
  );
  assert.equal(r.status, 0, r.stderr + "\n" + r.stdout);
  const campaign = JSON.parse(
    readFileSync(join(output, "campaign.json"), "utf8"),
  );
  assert.equal(campaign.status, "passed");
  assert.equal(campaign.cases[0].report.evidenceMode, "simulation");
  assert.ok(
    campaign.cases[0].report.assignments.every(
      (a) => a.evidenceMode === "simulation",
    ),
  );
  assert.equal(git("status", "--porcelain"), "");
  writeFileSync(join(repo, "workday-contract.json"), "{}");
  git("add", ".");
  git("commit", "-qm", "incompatible");
  const b = JSON.parse(readFileSync(bindings));
  b.projects.fixture.base = git("rev-parse", "HEAD");
  writeFileSync(bindings, JSON.stringify(b));
  const bad = spawnSync(
    process.execPath,
    [
      cli,
      "experiment",
      "run",
      resolve("experiments/workday-simulation.json"),
      "--bindings",
      bindings,
      "--mode",
      "simulation",
      "--output",
      join(root, "bad"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(bad.status, 2);
  assert.equal(existsSync(join(root, "bad")), false);
});
test("expected blocked workday checks only models that actually executed", (t) => {
  const f = handoffFixture(t, "unknown-owner"),
    binding = join(f.root, "binding.json"),
    manifest = join(f.root, "campaign.json"),
    check = join(f.root, "blocked.cjs"),
    output = join(f.root, "output");
  writeFileSync(
    check,
    "const r=require(process.argv[2]);if(r.status!=='blocked'||!r.assignments.some(a=>a.requests?.some(q=>q.ownerId==='unknown')))process.exit(1)",
  );
  writeFileSync(
    binding,
    JSON.stringify({
      schemaVersion: 1,
      runner: cli,
      codexPath: f.executable,
      projects: { target: { path: f.repo, base: f.git("rev-parse", "HEAD") } },
      tools: { node: process.execPath },
    }),
  );
  writeFileSync(
    manifest,
    JSON.stringify({
      schemaVersion: 2,
      modes: ["live"],
      cases: [
        {
          id: "blocked",
          project: "target",
          workday: f.manifest,
          expectedOutcome: "blocked",
          acceptance: [
            { command: "node", args: [check, "{report}"], artifacts: [check] },
          ],
        },
      ],
    }),
  );
  const r = spawnSync(
    process.execPath,
    [
      cli,
      "experiment",
      "run",
      manifest,
      "--bindings",
      binding,
      "--mode",
      "live",
      "--output",
      output,
    ],
    { encoding: "utf8", env: f.env, timeout: 60000 },
  );
  assert.equal(r.status, 0, r.stderr + "\n" + r.stdout);
  const campaign = JSON.parse(readFileSync(join(output, "campaign.json")));
  assert.equal(campaign.cases[0].status, "passed");
  assert.ok(campaign.cases[0].report.assignments.some((a) => !a.threadId));
});
test("real validator owner receives declared build and regression operations", () => {
  const r = spawnSync(
    process.execPath,
    [
      cli,
      "inspect",
      "guidance-validation",
      "Implement bounded validator behavior",
      "--project",
      process.cwd(),
      "--json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(
    JSON.parse(r.stdout)
      .operations.map((o) => o.id)
      .sort(),
    ["guidance-build", "guidance-tests"],
  );
});
