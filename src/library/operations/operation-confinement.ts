import type { Component } from '../architecture/components.js';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ResolvedAssignment } from '../architecture/assignment.js';
import { toolDirectories, type Bindings } from '../architecture/bindings.js';
import { save, type RecordData } from '../workspace/state.js';
import { SourceConfinement } from './confinement.js';
import { operationEnvironment } from './environment.js';
import type { Operation } from './operations.js';
import { execute, git } from './process.js';

const hostIdentity = randomUUID();

/** Qualifies the current supervisor and constructs operation-specific source-read-only sandboxes. */
export class OperationConfinement {
  /** Binds the policy adapter to captured run authority and host cancellation. */
  constructor(
    private readonly root: string,
    private readonly record: RecordData,
    private readonly signal: AbortSignal,
  ) {}

  /** Refuses unqualified execution before a real operation can touch any generated or source path. */
  async prepare(op: Operation): Promise<SourceConfinement> {
    const adapter = this.confinement(op);
    await this.qualify(adapter);
    return adapter;
  }

  /** Builds operation-specific output permissions from frozen definitions and all maintained roots. */
  private confinement(op: Operation): SourceConfinement {
    const resolved = this.record.resolvedAssignment as ResolvedAssignment;
    const catalog =
      resolved?.initialization.catalog ?? (this.record.operationCatalog as Component[] | undefined);
    const owner =
      resolved?.context.at(-1) ?? catalog?.find((c) => c.id === op.resolvedContext?.ownerId);
    if (!owner || !catalog) throw new Error('Operation requires captured owner authority');
    const bindings = this.record.bindings as Bindings | undefined;
    return new SourceConfinement({
      workspace: this.record.workspace,
      reads: owner.access.readPaths,
      outputs: op.generatedDirectories,
      maintainedPaths: catalog
        .filter((c) => c.repository === owner.repository)
        .flatMap((c) => c.allowedWritePaths),
      temporaryRoot: join(this.root, 'runs', this.record.id, 'operation-tmp'),
      executable: bindings?.tools.codex ?? 'codex',
      network: op.network,
      toolDirectories: [...toolDirectories(this.record), this.record.commonDir],
    });
  }

  /** Proves source denial on disposable probe files before any real operation can run. */
  private async qualify(adapter: SourceConfinement): Promise<void> {
    if (this.record.confinementQualified === hostIdentity) return;
    const { source, root, probe } = this.probe(adapter);
    const script =
      "const f=require('fs');console.log('stdout-proof');console.error('stderr-proof');f.writeFileSync('output/proof','ok');for(const p of ['canary',process.env.CODEX_HOME+'/config.toml']){try{f.writeFileSync(p,'bad');process.exit(7)}catch(e){if(!['EROFS','EPERM','EACCES'].includes(e.code))throw e;}}";
    const log = join(root, `probe-${randomUUID()}.log`);
    await execute(
      probe.command({ command: process.execPath, args: ['-e', script] }),
      source,
      log,
      this.signal,
      { env: probe.environment(operationEnvironment(this.record)), fileOutput: true },
    );
    if (
      readFileSync(join(source, 'canary'), 'utf8') !== 'original' ||
      readFileSync(join(source, 'output/proof'), 'utf8') !== 'ok' ||
      !readFileSync(log, 'utf8').includes('stdout-proof') ||
      !readFileSync(log, 'utf8').includes('stderr-proof')
    )
      throw new Error('Source confinement qualification failed');
    this.record.confinementQualified = hostIdentity;
    save(this.root, this.record);
  }

  /** Creates disposable policy canaries without probing on maintained source. */
  private probe(adapter: SourceConfinement) {
    const root = join(adapter.temporaryRoot, 'qualification');
    const source = join(root, 'source');
    mkdirSync(source, { recursive: true });
    git(source, 'init', '-q');
    writeFileSync(join(source, 'canary'), 'original');
    const probe = new SourceConfinement({
      workspace: source,
      reads: ['.'],
      outputs: ['output'],
      temporaryRoot: join(root, 'private'),
      executable: (this.record.bindings as Bindings | undefined)?.tools.codex ?? 'codex',
    });
    return { source, root, probe };
  }
}
