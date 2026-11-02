# Component test selection

Use `arcnexus test inspect report --project . --json` to see the source suites,
compiled paths, metadata and hashes selected from the working checkout. Inspection
reads literal registrations; it does not import test modules, prepare an environment,
or invoke a model. Component roots and the shared profile come from captured HEAD.
Untracked regular suites under those roots are visible; symlink traversal is rejected.

For minimal v5 definitions, discovery derives test files from owned paths and captured
classification rules; no leaf repeats test directories. Containers contribute the
inherited profile without becoming test owners. The Node convention maps a package's
`tests/` tree into the profile output root, preserving paths below `tests/`. Both
captured and newly created suites use the same ownership and classification checks.
Unsupported source layouts fail with a diagnostic rather than selecting no tests.

Use `arcnexus test run report --project .` to prepare and execute that selection.
Omit the component to select all declared suites. Filters intersect:

```text
arcnexus test inspect --project . --level integration --category regression
arcnexus test run report --project . --tag deterministic --tag fast
```

Each repeated tag must match. A required selection containing no suites is an error,
not a passing test run. Unsupported profiles and malformed metadata are errors too.

## Suite structure

A maintained test file has one literal registration and a cohesive scenario class:

```typescript
import { registerSuite } from '../../../../dist/library/testing/suite.js';

registerSuite({ component: 'report', level: 'unit', tags: ['deterministic'] });
```

The import depth depends on the file's location. Node's ordinary `test` declarations
still invoke the class's scenario methods; registration does not replace the runner.
Keep helpers in `support/`, where discovery does not report them as suites.

Use the owning component's `unit/`, `integration/`, `acceptance/`, or `regression/`
directory. Regression identifies why a suite exists; its registration separately
states the unit, integration, or acceptance level. A file with different testing
levels should be split so selection has a useful meaning.

## Preparation and evidence

New test profiles use schema version 2: `preparation` entries reference a shared
`operation` and retain their `purpose` (`production` or `tests`); `run` names the
shared finite test operation. Command definitions exist only in the operation
registry. The host resolves `selectedTestFiles` to the validated compiled suite
paths and `testOutputRoot` to the captured profile output root. Every preparation
and runner invocation uses source-read-only confinement and retains its captured
definition, context and output through the common operation executor. Required
verification remains a separate checkpoint from an engineering test invocation.

Preparation references must be available through the owner's `setup` or `refresh`
usage, and its runner through `agent` or `verify`. Missing references, incompatible
profiles, services in finite checkpoints and mixed old/new test profiles fail before
execution. Repeated equivalent preparations run once per test checkpoint; changing
candidate inputs requires a new checkpoint. These rules also apply to test code and
package hooks: generated output is writable, maintained source is not.

Confinement qualification also requires retained stdout and stderr sentinels. A
successful exit without diagnostic transport is insufficient. On the tested Linux
runtime, Node socket-backed stdio inside the restricted sandbox can become a generic
`Writable` stream that discards output, while direct descriptor writes work. Confined
commands therefore preload a host-owned Node compatibility module that restores only
these inherited stdout/stderr descriptors. The preload is read-only and also applies
to Node subprocesses. Finite commands additionally receive host-opened regular output
descriptors because Node's test coordinator initializes its reporter before preloads.
A diagnostic-size watchdog retains the existing output limit; source/network
restrictions and cancellation supervision remain in force.

The shared Node profile declares fixed preparation commands and the compiled output
root. The service runs preparation once, then invokes Node with the selected compiled
files. `npm test` first builds the production service, then delegates to it with the
production preparation step marked caller-prepared. It does not recursively invoke
itself. Existing `npm run test:<owner>` commands are compatibility delegates.

Each invocation retains `result.json` and bounded command logs under the ArcNexus
state directory's `test-runs/`. Results include the captured revision, selected source
hashes, preparation commands, exit codes, durations and evidence paths. Cancellation
stops supervised processes and retains partial evidence. No default execution timeout
is introduced. Exit codes are 0 for success, 1 for preparation/test failure, 2 for
invalid input/selection, and 130 for cancellation.

Fixed test commands can execute candidate code at the existing trusted host-command
boundary. This is not complete OS isolation. Independently captured acceptance and
frozen regression checks remain mandatory; selectable suites do not replace them.

Assignments capture suite identities and the shared profile's original bytes and
hashes before preparation. Final host checks reject deletion or selection-metadata
changes to captured mandatory suites; newly discovered suites may add coverage.
Captured frozen regression contents remain separately enforced. The test CLI also
accepts an explicit `--timeout-seconds` through shared cancellation; omitting it
leaves execution unbounded and cancellable.

The npm compatibility entry point prints retained command output before its JSON
summary so CI failures include the actual diagnostics. The public `--json` CLI keeps
stdout machine-readable. Selection reports distinguish unchanged, modified, and
added source suites; only profiles belonging to selected suites are prepared.

JSON results include a bounded excerpt from the latest command, with a truncation
flag and the complete retained log reference. Declared operations therefore deliver
actual compiler/test diagnostics to the steward without requiring access to the
private report directory. A caller-configured timeout is a failed execution; explicit
cancellation remains exit 130.
