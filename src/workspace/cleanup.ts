import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
  type Stats,
} from 'node:fs';
import { join } from 'node:path';
import { environment, InputError } from '../architecture/config.js';
import { ConfigurationReader } from '../architecture/configuration.js';
import { git } from '../operations/process.js';
import { assertServicesStopped } from '../operations/service-state.js';
import { observe, readTimeline } from '../report/timeline.js';
import { cleanupMembers, type Member } from './members.js';
import { assertOutputs } from './outputs.js';
import type { RecordData } from './state.js';

interface CleanupIntent {
  schemaVersion: number;
  id: string;
  source: string;
  commonDir: string;
  base: string;
  branch: string;
  workspace: string;
  members: Member[];
  status: string;
  device?: number;
  inode?: number;
}

export class WorkspaceCleanup {
  private readonly record: RecordData;
  private readonly directory: string;
  private readonly receiptPath: string;
  private readonly intentPath: string;
  private readonly members: Member[];
  private intent?: CleanupIntent;

  constructor(
    private readonly root: string,
    private readonly id: string,
  ) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new InputError('Invalid workspace ID');
    this.directory = join(root, 'runs', id);
    this.record = JSON.parse(
      readFileSync(join(this.directory, 'report.json'), 'utf8'),
    ) as RecordData;
    if (this.record.id !== id || this.record.workspace !== join(root, 'workspaces', id))
      throw new Error('Workspace ownership mismatch');
    this.members = (this.record.members ?? []) as Member[];
    this.receiptPath = join(this.directory, 'cleanup.json');
    this.intentPath = join(this.directory, 'cleanup-intent.json');
  }

  run(): RecordData {
    this.resources();
    if (this.record.status === 'removed' || existsSync(this.receiptPath)) {
      if (lstatSync(this.record.workspace, { throwIfNoEntry: false }))
        throw new Error('Previously removed workspace path is occupied');
      return { ...this.record, cleanupStatus: 'removed' };
    }
    this.loadIntent();
    const stat = lstatSync(this.record.workspace, { throwIfNoEntry: false });
    if (!stat) this.reconcile();
    else this.remove(stat);
    return { ...this.record, cleanupStatus: 'removed' };
  }

  private resources(): void {
    const { root, id, record } = this;
    if (['preparing', 'running'].includes(record.status))
      throw new Error('Workspace operation is active or incomplete; inspect before cleanup');
    assertServicesStopped(root, id);
    if (!record.workday) return;
    const workday = record.workday as { assignments: string[]; parking: string; active?: boolean };
    if (workday.active) throw new Error('Workday is active or interrupted; inspect before cleanup');
    for (const child of workday.assignments) assertServicesStopped(root, child);
    if (existsSync(workday.parking)) {
      const parking = JSON.parse(readFileSync(workday.parking, 'utf8'));
      if (!['none', 'restored'].includes(parking.status))
        throw new Error('Workday parking/restoration is unresolved');
    }
  }

  private identity() {
    const { record, members, id } = this;
    return {
      schemaVersion: 1,
      id,
      source: record.source,
      commonDir: record.commonDir,
      base: record.base,
      branch: record.branch,
      workspace: record.workspace,
      members,
    };
  }

  private loadIntent(): void {
    this.intent = existsSync(this.intentPath)
      ? JSON.parse(readFileSync(this.intentPath, 'utf8'))
      : undefined;
    const intent = this.intent;
    if (
      intent &&
      Object.entries(this.identity()).some(
        ([key, value]) =>
          JSON.stringify((intent as unknown as Record<string, unknown>)[key]) !==
          JSON.stringify(value),
      )
    )
      throw new Error('Cleanup intent ownership mismatch');
  }

  private writeIntent(value: CleanupIntent): void {
    writeFileSync(this.intentPath + '.tmp', JSON.stringify(value), { mode: 0o600 });
    renameSync(this.intentPath + '.tmp', this.intentPath);
  }

  private reconcile(): void {
    const { intent, record } = this;
    if (!intent || !['removing', 'removed'].includes(intent.status))
      throw new Error('Workspace disappeared without cleanup intent');
    if (
      commonDirectory(record.source) !== record.commonDir ||
      registered(record.source, record.workspace)
    )
      throw new Error('Absent workspace ownership is unresolved');
    this.reconcileMembers();
    this.writeIntent({ ...intent, status: 'removed' });
    this.receipt(false);
    observe(this.root, this.timelineRecord(), 'cleanup.completed', {
      status: 'removed',
      reconciled: true,
    });
  }

  private reconcileMembers(): void {
    const progress = join(this.directory, 'members-cleanup.json');
    const removed = existsSync(progress) ? JSON.parse(readFileSync(progress, 'utf8')).removed : [];
    for (const member of this.members) {
      if (
        !removed.includes(member.id) ||
        lstatSync(member.workspace, { throwIfNoEntry: false }) ||
        registered(member.source, member.workspace) ||
        commonDirectory(member.source) !== member.commonDir
      )
        throw new Error('Dependency removal is unresolved');
    }
  }

  private remove(stat: Stats): void {
    const { record, intent, root } = this;
    this.validateExisting(stat);
    const env = this.capturedEnvironment();
    assertOutputs(record.workspace, env);
    cleanupMembers(root, record, true);
    const identity = { ...this.identity(), device: stat.dev, inode: stat.ino };
    if (!intent) this.writeIntent({ ...identity, status: 'removing' });
    const timeline = this.timelineRecord();
    observe(root, timeline, 'cleanup.started', {});
    cleanupMembers(root, record);
    git(record.source, 'worktree', 'remove', record.workspace);
    this.writeIntent({ ...identity, status: 'removed' });
    this.receipt(true);
    observe(root, timeline, 'cleanup.completed', { status: 'removed' });
  }

  private validateExisting(stat: Stats): void {
    const { record, intent } = this;
    if (
      intent &&
      (intent.status !== 'removing' || intent.device !== stat.dev || intent.inode !== stat.ino)
    )
      throw new Error('Cleanup workspace was replaced');
    if (realpathSync(record.workspace) !== record.workspace)
      throw new Error('Workspace path is redirected');
    if (
      commonDirectory(record.workspace) !== record.commonDir ||
      !registered(record.source, record.workspace)
    )
      throw new Error('Workspace registration mismatch');
  }

  private capturedEnvironment() {
    const { record, members } = this;
    // Use the immutable base configuration, not potentially edited report settings.
    const env = environment(
      new ConfigurationReader().definition(
        record.workspace,
        record.base,
        'architecture/environment',
      ).value,
    );
    const definitions = env.workspace?.dependencies ?? [];
    if (definitions.length !== members.length)
      throw new Error('Dependency ownership record mismatch');
    for (const [i, definition] of definitions.entries()) {
      const member = members[i]!;
      if (
        member.id !== definition.id ||
        member.base !== definition.commit ||
        member.workspace !== join(record.workspace, definition.path)
      )
        throw new Error('Dependency ownership record mismatch');
      member.definition = definition;
    }
    return env;
  }

  private receipt(formatted: boolean): void {
    const receipt = { cleanupStatus: 'removed', removedAt: new Date().toISOString() };
    const text = formatted ? JSON.stringify(receipt, null, 2) + '\n' : JSON.stringify(receipt);
    writeFileSync(this.receiptPath + '.tmp', text, { mode: 0o600 });
    renameSync(this.receiptPath + '.tmp', this.receiptPath);
  }

  private timelineRecord(): RecordData {
    return { ...this.record, timelineSequence: readTimeline(this.directory).events.length };
  }
}

function registered(source: string, path: string): boolean {
  return git(source, 'worktree', 'list', '--porcelain', '-z')
    .split('\0')
    .includes(`worktree ${path}`);
}

function commonDirectory(source: string): string {
  return realpathSync(
    git(source, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim(),
  );
}
