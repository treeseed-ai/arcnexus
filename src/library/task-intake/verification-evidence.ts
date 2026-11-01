import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { candidateDigest, captureChanges } from '../change-inspection/changes.js';
import type { OperationBridge } from '../operations/operations.js';
import type { BridgeTool } from '../steward/bridge.js';
import type { RecordData } from '../workspace/state.js';

interface Artifact {
  id: string;
  content: string;
  sha256: string;
  path?: string;
  encoding: string;
}

/** Pins host-observed changes and exposes only their retained artifacts to independent reviewers. */
export class VerificationEvidence {
  private readonly artifacts = new Map<string, Artifact>();

  readonly candidate: string;

  /** Captures complete change evidence outside the editable candidate and rejects concurrent changes. */
  constructor(root: string, record: RecordData, baseline: string) {
    this.candidate = candidateDigest(record);
    const captured: RecordData = { ...record, base: baseline };
    captureChanges(root, captured);
    const directory = join(root, 'runs', record.id);
    this.add('patch', readFileSync(join(directory, 'changes.patch'), 'utf8'), 'git-binary-patch');
    this.addFiles(JSON.parse(readFileSync(join(directory, 'new-files.json'), 'utf8')));
    this.execution(record);
    const manifest = {
      baseline,
      candidateDigest: this.candidate,
      changes: captured.changes,
      artifacts: [...this.artifacts.values()].map(({ content, ...metadata }) => ({
        ...metadata,
        totalCharacters: content.length,
      })),
    };
    this.add('manifest', JSON.stringify(manifest, null, 2), 'json');
    record.verificationEvidence = this.retain(directory, manifest);
    if (candidateDigest(record) !== this.candidate)
      throw Object.assign(new Error('Candidate changed during evidence capture'), {
        name: 'CandidateIntegrityError',
      });
  }

  /** Pins current-run host observations without accepting a foreign task as execution evidence. */
  private execution(record: RecordData): void {
    const evidence = record.hostExecutionEvidence as { run?: { id?: string } } | undefined;
    if (!evidence) return;
    if (!record.executionRunId || evidence.run?.id !== record.executionRunId)
      throw new Error('Host execution evidence belongs to a different run');
    this.add('execution', JSON.stringify(evidence, null, 2), 'json');
  }

  /** Extends the declared operations with a fixed read-only artifact capability. */
  wrap(operations: OperationBridge): OperationBridge {
    return {
      ...operations,
      tools: [...operations.tools, this.tool()],
      call: async (name, args) =>
        name === 'verification.evidence' ? this.read(args) : operations.call(name, args),
    };
  }

  /** Encodes new files losslessly; text is readable directly while binary content stays base64. */
  private addFiles(files: Record<string, string>): void {
    for (const [path, base64] of Object.entries(files)) {
      const bytes = Buffer.from(base64, 'base64');
      const text = bytes.toString('utf8');
      const textual = !bytes.includes(0) && Buffer.from(text).equals(bytes);
      this.add('added:' + path, textual ? text : base64, textual ? 'utf8' : 'base64', path);
    }
  }

  /** Hashes exact served content and assigns a capability name unrelated to host filesystem lookup. */
  private add(id: string, content: string, encoding: string, path?: string): void {
    const sha256 = createHash('sha256').update(content).digest('hex');
    this.artifacts.set(id, { id, content, sha256, encoding, ...(path ? { path } : {}) });
  }

  /** Saves immutable evidence copies by content hash and records the manifest for historical inspection. */
  private retain(directory: string, manifest: unknown): unknown {
    const destination = join(directory, 'verification-evidence');
    mkdirSync(destination, { mode: 0o700 });
    for (const artifact of this.artifacts.values())
      writeFileSync(join(destination, artifact.sha256), artifact.content, { mode: 0o400 });
    return {
      ...(manifest as object),
      directory: destination,
      manifest: this.artifacts.get('manifest')!.sha256,
    };
  }

  /** Validates bounded transport pages without limiting how much evidence a reviewer may inspect. */
  private read(args: unknown): unknown {
    if (!args || typeof args !== 'object') throw new Error('Invalid verification evidence request');
    const request = args as Record<string, unknown>;
    if (Object.keys(request).some((key) => !['artifact', 'offset', 'length'].includes(key)))
      throw new Error('Invalid verification evidence arguments');
    const artifact = this.artifacts.get(String(request.artifact));
    if (!artifact) throw new Error('Unknown verification artifact');
    const { offset, length } = this.page(request, artifact.content.length);
    const content = artifact.content.slice(offset, offset + length);
    const nextOffset = offset + content.length;
    return {
      artifact: artifact.id,
      sha256: artifact.sha256,
      totalCharacters: artifact.content.length,
      offset,
      nextOffset,
      complete: nextOffset === artifact.content.length,
      content,
    };
  }

  /** Rejects malformed or out-of-range page requests before slicing captured content. */
  private page(
    request: Record<string, unknown>,
    total: number,
  ): { offset: number; length: number } {
    const offset = request.offset ?? 0;
    const length = request.length ?? 8192;
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(length) ||
      Number(offset) < 0 ||
      Number(offset) > total ||
      Number(length) < 1 ||
      Number(length) > 32768
    )
      throw new Error('Invalid verification evidence page');
    return { offset: Number(offset), length: Number(length) };
  }

  /** Advertises explicit paging and fixed artifact names without exposing arbitrary filesystem access. */
  private tool(): BridgeTool {
    return {
      name: 'verification.evidence',
      description:
        'Read pinned host change evidence. Start with artifact=manifest, then read its artifacts. Follow nextOffset until complete; offsets and lengths count JavaScript string characters.',
      inputSchema: {
        type: 'object',
        properties: {
          artifact: { type: 'string' },
          offset: { type: 'integer', minimum: 0 },
          length: { type: 'integer', minimum: 1, maximum: 32768 },
        },
        required: ['artifact'],
        additionalProperties: false,
      },
    };
  }
}
