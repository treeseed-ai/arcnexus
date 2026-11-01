import { appendFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export class ControlledInitializer {
  respond(prompt: string, args: string[], calls: string, mode = 'ready'): boolean {
    if (!prompt.startsWith('ArcNexus initialization:')) return false;
    const owners = JSON.parse(
      prompt.split('Captured execution owners: ')[1]!.split('\n')[0]!,
    ) as string[];
    appendFileSync(calls + '.initialization', JSON.stringify({ owners, args }) + '\n');
    if (mode === 'write') writeFileSync('source.txt', 'initializer mutation');
    this.result(this.response(owners, mode));
    return true;
  }
  private response(owners: string[], mode: string): unknown {
    const result: any = {
      status: mode === 'question' ? 'needs_clarification' : 'ready',
      summary: 'Captured owners confirmed',
      selectedOwners: owners.map((id) => ({
        id: mode === 'widen' ? 'unauthorized-owner' : id,
        reason: 'Captured responsibility',
      })),
      rejectedOwners: [],
      questions: mode === 'question' ? ['Which contract should change?'] : [],
      assignments: [],
      dependency: null,
      architectureProposal: null as any,
    };
    if (mode === 'proposal-missing') {
      result.status = 'architecture_change_required';
      result.architectureProposal = this.missing();
    }
    this.proposal(result, mode);
    return result;
  }
  private proposal(result: any, mode: string): void {
    if (mode === 'proposal-workday') this.workday(result);
    if (mode === 'proposal-research') {
      result.selectedOwners = [{ id: 'sample', reason: 'Source behavior owner' }];
      result.assignments = [
        {
          ownerId: 'sample',
          objective: 'Research sample behavior',
          kind: 'research',
          changeType: 'behavior',
          acceptanceCriteria: ['Evidence-backed explanation'],
          allowedWritePaths: [],
        },
      ];
    }
  }
  private workday(result: any): void {
    result.selectedOwners = ['sample', 'dependency'].map((id) => ({
      id,
      reason: 'Captured fixture owner',
    }));
    result.assignments = ['sample', 'dependency'].map((ownerId) => ({
      ownerId,
      objective:
        ownerId === 'sample'
          ? 'Consume verified dependency contract'
          : 'Deliver dependency contract',
      kind: 'change',
      changeType: 'behavior',
      acceptanceCriteria: ['Independent acceptance passes'],
      allowedWritePaths:
        ownerId === 'sample'
          ? ['source.txt', 'docs', 'tests']
          : ['dependency.txt', 'dependency-docs', 'dependency-tests'],
    }));
    result.dependency = {
      from: 'sample',
      to: 'dependency',
      contract: 'sample-contract',
      delivery: 'Verified dependency contract in this candidate',
    };
  }
  private missing() {
    return {
      responsibility: 'Deployment requires a new accountable owner',
      definitionsYaml: 'id: deployment',
      directories: [{ owner: 'deployment', path: 'src/deployment' }],
      relationships: ['platform'],
      roles: ['systems-engineer'],
      operations: [],
      verification: ['Caller-defined deployment acceptance'],
      affectedOwners: [],
      migration: ['No existing source changes'],
      acceptanceCriteria: ['Capture deployment authority'],
      questions: [],
    };
  }
  private result(result: unknown): void {
    this.emit({
      type: 'thread.started',
      thread_id:
        'initializer-' + createHash('sha256').update(process.cwd()).digest('hex').slice(0, 12),
    });
    this.emit({
      type: 'item.completed',
      item: { id: 'initializer-result', type: 'agent_message', text: JSON.stringify(result) },
    });
    this.emit({
      type: 'turn.completed',
      usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 },
    });
  }
  private emit(value: unknown): void {
    console.log(JSON.stringify(value));
  }
}
