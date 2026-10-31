import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { AgentResult } from "../steward/codex.js";
import type { Scenario } from "./experiment-config.js";
const scenario = process.argv[2] as Scenario,
  args = process.argv.slice(3);
if (!["success", "repair", "boundary", "failure"].includes(scenario))
  throw new Error("Unknown fixed simulation scenario");
if (args[0] === "--version") {
  console.log("ArcNexus controlled simulation (no model)");
  process.exit(0);
}
if (args[0] === "sandbox") {
  process.exit(0);
} // Scripted startup; not installed-Codex sandbox qualification.
if (args[0] !== "exec" || !args.includes("--ignore-user-config"))
  throw new Error("Expected production launcher contract");
const cwd = args[args.indexOf("--cd") + 1];
if (!cwd) throw new Error("Missing workspace");
process.chdir(cwd);
if (
  JSON.parse(readFileSync("simulation-contract.json", "utf8")).id !==
  "single-steward-v1"
)
  throw new Error("Incompatible simulation fixture");
let prompt = "";
for await (const chunk of process.stdin) prompt += chunk;
const stage = prompt.match(/Activity turn: ([a-z-]+)/)?.[1];
const emit = (value: unknown) => console.log(JSON.stringify(value));
emit({
  type: "thread.started",
  thread_id:
    "simulation-" + createHash("sha256").update(cwd).digest("hex").slice(0, 16),
});
const result: AgentResult = {
  status: "completed",
  summary: "SIMULATED fixed scenario " + scenario,
  blockers: [],
  findings: [
    {
      summary: "SIMULATED fixture observation",
      evidence: ["source.txt"],
      uncertainty: "Scripted behavior does not establish model capability",
    },
  ],
  activities: [],
  regression: null,
  reviewFindings: [],
  requests: [],
  plan: null,
  planUpdates: [],
};
if (stage === "planning")
  result.plan = {
    approach: "SIMULATED bounded fixture change",
    assumptions: ["Controlled fixture"],
    activities: [{ activity: "implementation", reason: "Scripted assignment" }],
    items: [
      {
        id: "work",
        activity: "implementation",
        result: "Verified fixture change",
        criteria: [0],
        expectedEvidence: ["verify"],
        dependencies: [],
        status: "pending",
        evidence: [],
        explanation: "",
      },
    ],
    questions: [],
  };
else if (scenario === "boundary") {
  result.status = "blocked";
  result.blockers = ["SIMULATED dependency contract boundary"];
  result.requests = [
    {
      fromComponent: "sample",
      ownerId: "dependency",
      request: "Provide the required contract before implementation",
      evidence: ["contract.txt"],
      acceptanceCriteria: ["Owner supplies the requested contract"],
      reason:
        "Contract belongs to dependency; current scope excludes contract.txt",
    },
  ];
} else if (scenario === "failure" && stage === "implementation") {
  emit({
    type: "turn.failed",
    error: { message: "SIMULATED execution failure" },
  });
  process.exit(0);
} else {
  if (stage === "specification") {
    writeFileSync("docs/behavior.md", "SIMULATED: source must become after.\n");
    writeFileSync(
      "tests/regression.mjs",
      "import assert from 'node:assert/strict';import{readFileSync}from'node:fs';assert.equal(readFileSync('source.txt','utf8'),'after','SIMULATION_EXPECTED_AFTER');\n",
    );
    result.regression = {
      verificationIndex: 0,
      exitCode: 1,
      outputIncludes: "SIMULATION_EXPECTED_AFTER",
    };
  }
  if (stage === "implementation" || stage === "correction")
    writeFileSync(
      "source.txt",
      scenario === "repair" && stage === "implementation" ? "broken" : "after",
    );
  function option(name: "command"): string;
  function option(name: "args"): string[];
  function option(name: "command" | "args"): string | string[] {
    const prefix = "mcp_servers.arcnexus." + name + "=",
      value = args.find((arg) => arg.startsWith(prefix));
    if (!value) throw new Error("Missing production bridge configuration");
    const parsed: unknown = JSON.parse(value.slice(prefix.length));
    if (name === "command" && typeof parsed === "string") return parsed;
    if (
      name === "args" &&
      Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string")
    )
      return parsed as string[];
    throw new Error("Invalid bridge configuration");
  }
  const client = new Client(
    { name: "arcnexus-simulation", version: "1" },
    { capabilities: {} },
  );
  await client.connect(
    new StdioClientTransport({
      command: option("command"),
      args: option("args"),
    }),
  );
  try {
    await client.listTools();
    const operation = await client.callTool({
      name: "operations.run",
      arguments: { id: "verify" },
    });
    if (operation.isError) throw new Error("Simulation operation denied");
    if (
      stage === "correction" ||
      stage === "review" ||
      (stage === "implementation" && scenario !== "repair")
    ) {
      const update = await client.callTool({
        name: "plan.update",
        arguments: {
          updates: [
            {
              id: "work",
              status: "completed",
              explanation: "SIMULATED source and real verification observed",
              evidence: ["source.txt", "operation:verify"],
            },
          ],
        },
      });
      if (update.isError) throw new Error("Simulation checklist update denied");
    }
  } finally {
    await client.close();
  }
}
emit({
  type: "item.completed",
  item: {
    id: "simulation-result",
    type: "agent_message",
    text: JSON.stringify(result),
  },
});
emit({
  type: "turn.completed",
  usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 },
});
