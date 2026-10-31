import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  cpSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const cli = resolve("dist/cli.js");
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "arcnexus-experiment-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, "repo"),
    state = join(root, "state"),
    output = join(root, "campaign"),
    bindings = join(root, "bindings.json"),
    manifest = resolve("experiments/simulation.json");
  cpSync("fixtures/simulation", repo, { recursive: true });
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
  const base = git("rev-parse", "HEAD");
  const value = {
    schemaVersion: 1,
    runner: cli,
    projects: { fixture: { path: repo, base } },
    tools: { node: process.execPath },
    priorEvidence: {},
    issues: {},
  };
  writeFileSync(bindings, JSON.stringify(value));
  const run = (...args) =>
    spawnSync(process.execPath, [cli, "experiment", ...args], {
      env: { ...process.env, ARCNEXUS_STATE_DIR: state },
      encoding: "utf8",
      timeout: 60000,
    });
  return {
    root,
    repo,
    state,
    output,
    bindings,
    manifest,
    value,
    base,
    git,
    run,
  };
}
test("built experiment inspect resolves pinned cases without workspaces or inference", (t) => {
  const f = fixture(t),
    r = f.run("inspect", f.manifest, "--bindings", f.bindings, "--json");
  assert.equal(r.status, 0, r.stderr);
  const d = JSON.parse(r.stdout);
  assert.equal(d.cases.length, 4);
  assert.equal(d.cases[0].base, f.base);
  assert.ok(d.digest);
  assert.equal(existsSync(f.state), false);
});
test("experiment run requires explicit mode and rejects incompatible fixture", (t) => {
  const f = fixture(t);
  assert.equal(f.run("run", f.manifest, "--bindings", f.bindings).status, 2);
  writeFileSync(join(f.repo, "source.txt"), "different");
  f.git("add", ".");
  f.git("commit", "-qm", "changed");
  f.value.projects.fixture.base = f.git("rev-parse", "HEAD");
  writeFileSync(f.bindings, JSON.stringify(f.value));
  const r = f.run(
    "run",
    f.manifest,
    "--bindings",
    f.bindings,
    "--mode",
    "simulation",
    "--output",
    f.output,
  );
  assert.equal(r.status, 2);
  assert.match(r.stderr, /fixture contract/i);
  assert.equal(existsSync(f.output), false);
});
test("simulation uses production SDK workflow and labels success repair boundary and failure", (t) => {
  const f = fixture(t),
    r = f.run(
      "run",
      f.manifest,
      "--bindings",
      f.bindings,
      "--mode",
      "simulation",
      "--output",
      f.output,
    );
  assert.equal(r.status, 1, r.stderr);
  const c = JSON.parse(readFileSync(join(f.output, "campaign.json")));
  assert.equal(c.evidenceMode, "simulation");
  assert.deepEqual(
    c.cases.map((c) => c.status),
    ["passed", "passed", "passed", "failed"],
  );
  assert.equal(c.cases[1].report.implementationAttempts, 2);
  assert.ok(c.cases[0].report.plan);
  assert.ok(
    readFileSync(join(f.output, "campaign.md"), "utf8").includes("simulation"),
  );
  assert.equal(c.runnerHash, c.finalRunnerHash);
  assert.equal(f.git("status", "--porcelain"), "");
  assert.equal(f.git("rev-parse", "HEAD"), f.base);
  assert.equal(
    f.run(
      "run",
      f.manifest,
      "--bindings",
      f.bindings,
      "--mode",
      "simulation",
      "--output",
      f.output,
    ).status,
    2,
  );
});
test("experiment rejects missing bindings and unpinned revisions before creating output", (t) => {
  const f = fixture(t);
  for (const projects of [{}, { fixture: { path: f.repo, base: "HEAD" } }]) {
    f.value.projects = projects;
    writeFileSync(f.bindings, JSON.stringify(f.value));
    assert.equal(
      f.run(
        "run",
        f.manifest,
        "--bindings",
        f.bindings,
        "--mode",
        "simulation",
        "--output",
        f.output,
      ).status,
      2,
    );
    assert.equal(existsSync(f.output), false);
  }
});
test("all acceptance inputs are captured before the first case executes", (t) => {
  const f = fixture(t),
    path = join(f.root, "check.mjs");
  writeFileSync(
    path,
    "import{writeFileSync}from'node:fs';import{join}from'node:path';writeFileSync(join(process.argv[2],'check.mjs'),'process.exit(19)');",
  );
  const data = JSON.parse(readFileSync(f.manifest));
  const c = {
    ...data.cases[0],
    assignment: resolve("experiments/assignments/simulation.json"),
    acceptance: [{ command: "node", args: [path, f.root], artifacts: [path] }],
  };
  data.cases = [c, { ...c, id: "second" }];
  const manifest = join(f.root, "manifest.json");
  writeFileSync(manifest, JSON.stringify(data));
  const r = f.run(
    "run",
    manifest,
    "--bindings",
    f.bindings,
    "--mode",
    "simulation",
    "--output",
    f.output,
  );
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(path, "utf8"), "process.exit(19)");
  assert.ok(
    JSON.parse(readFileSync(join(f.output, "campaign.json"))).cases.every(
      (c) => c.status === "passed",
    ),
  );
});
test("changed supervisor invalidates campaign before another case", async (t) => {
  const { symlinkSync } = await import("node:fs"),
    f = fixture(t),
    runner = join(f.root, "supervisor");
  for (const name of ["dist", "schemas", "fixtures/simulation"])
    cpSync(name, join(runner, name), { recursive: true });
  for (const name of ["package.json", "package-lock.json"])
    cpSync(name, join(runner, name));
  symlinkSync(resolve("node_modules"), join(runner, "node_modules"), "dir");
  f.value.runner = join(runner, "dist/cli.js");
  writeFileSync(f.bindings, JSON.stringify(f.value));
  const check = join(f.root, "mutate.mjs");
  writeFileSync(
    check,
    "import{appendFileSync}from'node:fs';appendFileSync(process.argv[2]+'/report.js','\\n// changed supervisor\\n');",
  );
  const data = JSON.parse(readFileSync(f.manifest)),
    c = {
      ...data.cases[0],
      assignment: resolve("experiments/assignments/simulation.json"),
      acceptance: [
        {
          command: "node",
          args: [check, join(runner, "dist")],
          artifacts: [check],
        },
      ],
    };
  data.cases = [c, { ...c, id: "second" }];
  const manifest = join(f.root, "manifest.json");
  writeFileSync(manifest, JSON.stringify(data));
  const r = f.run(
    "run",
    manifest,
    "--bindings",
    f.bindings,
    "--mode",
    "simulation",
    "--output",
    f.output,
  );
  assert.equal(r.status, 1, r.stderr);
  const report = JSON.parse(readFileSync(join(f.output, "campaign.json")));
  assert.equal(report.cases.length, 1);
  assert.match(report.error, /Supervising build changed/);
  assert.notEqual(report.runnerHash, report.finalRunnerHash);
});
for (const signal of ["SIGINT", "SIGKILL"])
  test(`experiment ${signal} stops managed acceptance and preserves evidence`, async (t) => {
    const { spawn } = await import("node:child_process"),
      { setTimeout: delay } = await import("node:timers/promises"),
      f = fixture(t),
      marker = join(f.root, "pid"),
      check = join(f.root, "wait.mjs");
    writeFileSync(
      check,
      "import{writeFileSync}from'node:fs';writeFileSync(process.argv[2],String(process.pid));setInterval(()=>{},1000);",
    );
    const data = JSON.parse(readFileSync(f.manifest));
    data.cases = [
      {
        ...data.cases[0],
        assignment: resolve("experiments/assignments/simulation.json"),
        acceptance: [
          { command: "node", args: [check, marker], artifacts: [check] },
        ],
      },
    ];
    const manifest = join(f.root, "manifest.json");
    writeFileSync(manifest, JSON.stringify(data));
    const child = spawn(
      process.execPath,
      [
        cli,
        "experiment",
        "run",
        manifest,
        "--bindings",
        f.bindings,
        "--mode",
        "simulation",
        "--output",
        f.output,
      ],
      { env: { ...process.env, ARCNEXUS_STATE_DIR: f.state }, stdio: "ignore" },
    );
    const exited = new Promise((resolve) => child.on("exit", resolve));
    t.after(() => child.kill("SIGKILL"));
    const deadline = Date.now() + 30000;
    while (!existsSync(marker)) {
      assert.ok(Date.now() < deadline, "acceptance must start");
      await delay(50);
    }
    const pid = Number(readFileSync(marker));
    child.kill(signal);
    const code = await exited;
    if (signal === "SIGINT") assert.equal(code, 130);
    const stopped = Date.now() + 5000;
    while (existsSync("/proc/" + pid)) {
      assert.ok(Date.now() < stopped, "acceptance must stop after parent loss");
      await delay(50);
    }
    const report = JSON.parse(readFileSync(join(f.output, "campaign.json")));
    assert.equal(report.status, signal === "SIGINT" ? "cancelled" : "running");
    assert.ok(existsSync(join(f.output, "success/report.json")));
  });
