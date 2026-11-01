import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, type TestContext } from 'node:test';
import { ExecutionContext } from '../../../../dist/library/architecture/execution-context.js';
import { ProjectHost } from '../../../../dist/library/execution-runtime/project-host.js';
import { registerSuite } from '../../../../dist/library/testing/suite.js';
import { GeneralFixture } from '../../testing/support/general-fixture.js';

/** Carries retained noninteractive questions into a new prompt without silently resuming old work. */
class TaskReferenceScenario {
  /** The next director sees the exact referenced question while old task and assignment state remain unchanged. */
  async run(t: TestContext): Promise<void> {
    const f = new GeneralFixture(t).fixture;
    const host = new ProjectHost(f.state, new ExecutionContext().resolve(f.repo));
    t.after(() => host.store.close());
    const previous = host.submit('Retained goal requiring an answer');
    const assignment = host.store.enqueue(previous.id, 'c', 'Unfinished retained assignment');
    host.store.updateRun(previous.id, 'needs_input', {
      questions: ['Which evidence format: JSON or Markdown?'],
    });
    host.store.updateAssignment(assignment.id, 'waiting');
    const next = host.submit(`Use JSON for retained task ${previous.id}; finish the goal`);
    await host.tick();
    const calls = readFileSync(f.calls, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const prompt = calls.find((call) => call.prompt.startsWith('ArcNexus task direction.')).prompt;
    assert.match(prompt, /Which evidence format: JSON or Markdown/);
    assert.match(prompt, /Unfinished retained assignment/);
    assert.match(prompt, /Retained goal requiring an answer/);
    assert.notEqual(next.id, previous.id);
    assert.equal(host.store.run(previous.id).status, 'needs_input');
    assert.equal(host.store.assignment(assignment.id).status, 'waiting');
    assert.equal(host.store.assignments(next.id).length, 1);
  }
}

const scenario = new TaskReferenceScenario();

test('a subsequent prompt gives the director explicitly referenced retained task context', (t) =>
  scenario.run(t));

registerSuite({ component: 'execution-runtime', level: 'acceptance', tags: ['deterministic'] });
