# Component layout and shared testing (#72)

The maintained CLI executable moves under `src/gateway/cli`. Libraries use
`src/library/<id>`, with mirrored documentation and tests. Foundation owns package
build settings and scripts; release owns CI and future Docker/Compose paths. A
shared testing library owns discovery, selection, execution and reusable helpers.
Each leaf's own YAML definition is an exact writable path; shared catalog directories
remain subject to documented directory-granularity exceptions and captured authority.

CLI adapters separate assignment, workspace, workday, experiment, guidance, task,
observation and testing commands. The build generates the stable `dist/cli.js`
launcher. Existing public command behavior and historical compatibility launchers
remain supported.

## Component tests

```
arcnexus test inspect [component-id] --project <repository>
  [--level unit|integration|acceptance] [--category regression] [--tag <tag> ...] [--json]
arcnexus test run [component-id] --project <repository>
  [--level unit|integration|acceptance] [--category regression] [--tag <tag> ...] [--json]
```

Test files register literal component, level and tag metadata through the shared
suite API. Inspection parses metadata without executing test modules. Working-tree
tests are discovered beneath captured component roots; helpers live in support
folders. Regression suites retain a unit/integration/acceptance level.

Filters intersect; repeated tags must all match. Empty selections and unsupported
profiles fail explicitly. The Node profile declares fixed production/test build
commands and compiled output roots. Preparation occurs once per invocation; npm's
bootstrap delegates to the same service after its successful production build.

Execution records selection, preparation, command output and result evidence outside
the project checkout. Caller-prepared builds are labeled as such. Exit codes are 0
(success), 1 (build/test failure), 2 (invalid selection/configuration), and 130
(cancellation). No implicit execution limits are added. Independent host acceptance
and frozen regression checks remain outside this selectable test inventory.

The initial adapter supports Node tests. TreeSeed remains unchanged. No React,
containers, publication or recovery is introduced in this increment.
