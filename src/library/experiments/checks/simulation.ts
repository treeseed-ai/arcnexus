import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Independently checks simulation against retained candidate evidence. */
class SimulationAcceptance {
  /** Executes this lifecycle through its configured collaborators and propagates failures. */
  run(path: string, scenario: string): void {
    const record = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(record.evidenceMode, 'simulation');
    if (scenario === 'boundary') {
      assert.equal(record.outcome, 'blocked');
      assert.equal(record.requests[0].ownerId, 'dependency');
      assert.equal(record.changes.length, 0);
    } else this.change(record, scenario);
    console.log('SIMULATED acceptance ' + scenario);
  }

  /** Handles change within this component’s captured contract. */
  private change(record: any, scenario: string): void {
    assert.equal(record.outcome, 'ready_for_integration');
    assert.equal(readFileSync(record.workspace + '/source.txt', 'utf8'), 'after');
    assert.ok(record.operations.some((operation: any) => operation.exitCode === 0));
    if (scenario === 'repair') {
      assert.equal(record.implementationAttempts, 2);
      assert.ok(record.commands.some((command: any) => command.exitCode === 1));
    }
  }
}

new SimulationAcceptance().run(process.argv[2]!, process.argv[3]!);
