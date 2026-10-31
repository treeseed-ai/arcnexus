import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { AgentResult } from "../steward/codex.js";
const scenario = process.argv[2],
  args = process.argv.slice(3);
if (scenario !== "handoff") throw new Error("Unsupported workday simulation");
if (args[0] === "--version") {
  console.log("ArcNexus simulated two-owner executable");
  process.exit(0);
}
if (args[0] === "sandbox") process.exit(0);
if (args[0] !== "exec" || !args.includes("--ignore-user-config"))
  throw new Error("Expected SDK launcher");
process.chdir(args[args.indexOf("--cd") + 1]!);
if (
  JSON.parse(readFileSync("workday-contract.json", "utf8")).id !==
  "two-owner-v1"
)
  throw new Error("Incompatible workday fixture");
let prompt = "";
for await (const chunk of process.stdin) prompt += chunk;
const owner = prompt.includes("active component identity gateway as")
    ? "gateway"
    : "identity",
  stage = prompt.match(/Activity turn: ([a-z-]+)/)?.[1],
  delivered = prompt.includes("Verified owner delivery"),
  requestId = prompt.match(/Current request ID: ([a-f0-9-]+)/)?.[1] ?? null;
const result: AgentResult = {
  status: "completed",
  summary: "SIMULATED two-owner work",
  blockers: [],
  findings: [],
  activities: [],
  regression: null,
  reviewFindings: [],
  requests: [],
  plan: null,
  planUpdates: [],
  coordination: null,
};
if (stage === "planning") {
  result.plan = {
    approach: "SIMULATED bounded contract change",
    assumptions: [],
    activities: [
      {
        activity: "implementation",
        reason: "Implement captured owner contract",
      },
    ],
    items: [
      {
        id: "contract",
        activity: "implementation",
        result: "Verified contract",
        criteria: [0],
        expectedEvidence: ["host checks"],
        dependencies: [],
        status: "pending",
        evidence: [],
        explanation: "",
      },
    ],
    questions: [],
  };
  if (owner === "gateway" && !delivered) {
    result.status = "blocked";
    result.blockers = ["Requires identity owner"];
    result.coordination = {
      action: "request",
      contract: "identity-label",
      requestId: null,
      text: "Add label Identity: <id> while preserving id",
      activityComplete: false,
    };
    result.requests = [
      {
        fromComponent: "gateway",
        ownerId: "identity",
        request: "Add label Identity: <id> to formatIdentity",
        evidence: ["identity/index.mjs"],
        acceptanceCriteria: ["Preserve id and supply label for all strings"],
        reason: "Identity implementation belongs to another owner",
      },
    ];
  }
  if (owner === "identity")
    result.coordination = {
      action: "accept",
      contract: "identity-label",
      requestId,
      text: "Accept captured identity label envelope",
      activityComplete: true,
    };
}
if (stage === "specification") {
  writeFileSync(
    owner + "/README.md",
    "# " +
      owner +
      "\n\nIdentity labels are `Identity: <id>`; identity preserves id, gateway reads label.\n",
  );
  writeFileSync(
    owner + "/test.mjs",
    owner === "identity"
      ? "import assert from 'node:assert/strict';import {formatIdentity} from './index.mjs';for(const id of ['Ada','','Renée']){assert.equal(formatIdentity(id).id,id);assert.equal(formatIdentity(id).label,'Identity: '+id,'LABEL_EXPECTED');}\n"
      : "import assert from 'node:assert/strict';import {displayIdentity} from './index.mjs';for(const id of ['Ada','','Renée'])assert.equal(displayIdentity(id),'Identity: '+id,'LABEL_EXPECTED');\n",
  );
  result.regression = {
    verificationIndex: 0,
    exitCode: 1,
    outputIncludes: "LABEL_EXPECTED",
  };
}
if (stage === "implementation")
  writeFileSync(
    owner + "/index.mjs",
    owner === "identity"
      ? "export function formatIdentity(id) { return {id, label: 'Identity: '+id}; }\n"
      : "import {formatIdentity} from '../identity/index.mjs';\nexport function displayIdentity(id) { return formatIdentity(id).label; }\n",
  );
if (stage === "review")
  result.planUpdates = [
    {
      id: "contract",
      status: "completed",
      explanation: "SIMULATED change passed host checks",
      evidence: [owner + "/index.mjs", owner + "/test.mjs"],
    },
  ];
const n =
    ["planning", "specification", "implementation", "review"].indexOf(
      stage ?? "",
    ) +
    1 +
    (owner === "gateway" && (stage !== "planning" || delivered) ? 1 : 0),
  emit = (value: unknown) => console.log(JSON.stringify(value));
emit({
  type: "thread.started",
  thread_id:
    "simulation-" +
    createHash("sha256")
      .update(process.cwd() + owner)
      .digest("hex")
      .slice(0, 20),
});
emit({
  type: "item.completed",
  item: { id: "result", type: "agent_message", text: JSON.stringify(result) },
});
emit({
  type: "turn.completed",
  usage: { input_tokens: n * 10, cached_input_tokens: 0, output_tokens: n * 2 },
});
