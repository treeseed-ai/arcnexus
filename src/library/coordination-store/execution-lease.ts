import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** Holds an OS-released SQLite writer lease for the lifetime of one canonical project host. */
export class ExecutionLease {
  private readonly database: DatabaseSync;

  /** Acquires exclusive hosting authority before recovery or socket replacement can occur. */
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.database = new DatabaseSync(path);
    chmodSync(path, 0o600);
    try {
      this.database.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE');
    } catch {
      this.database.close();
      throw new Error('A host already owns project execution');
    }
  }

  /** Releases hosting authority during an orderly host shutdown. */
  close(): void {
    this.database.close();
  }
}
