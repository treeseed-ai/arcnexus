import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { InputError } from '../architecture/config.js';

export interface WorkdayEvent {
  sequence: number;
  observedAt: string;
  type: string;
  payload: unknown;
}

export interface Message {
  id: string;
  from: string;
  to: string;
  kind: 'assignment' | 'request' | 'response';
  replyTo?: string;
  payload: unknown;
}

interface Update {
  id: string;
  status: string;
  data: unknown;
}

/** Single writer; reports project transactional state rather than replacing it. */
export class WorkdayStore {
  private db: DatabaseSync;

  /** Captures the dependencies and state used throughout this instance’s lifecycle. */
  constructor(
    readonly path: string,
    create = false,
  ) {
    if (create) {
      if (existsSync(path)) throw new InputError('Workday database already exists');
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    } else if (!existsSync(path)) throw new InputError('Workday database unavailable');
    this.db = new DatabaseSync(path, { readOnly: !create });
    this.db.exec('PRAGMA foreign_keys=ON');
    if (create) {
      chmodSync(path, 0o600);
      this.db.exec(`
   CREATE TABLE workdays(id TEXT PRIMARY KEY,status TEXT NOT NULL,data TEXT NOT NULL);
   CREATE TABLE assignments(id TEXT PRIMARY KEY,status TEXT NOT NULL,data TEXT NOT NULL);
   CREATE TABLE messages(id TEXT PRIMARY KEY,sender TEXT NOT NULL REFERENCES assignments(id),recipient TEXT NOT NULL REFERENCES assignments(id),kind TEXT NOT NULL,reply_to TEXT REFERENCES messages(id),data TEXT NOT NULL);
   CREATE TABLE executions(id TEXT PRIMARY KEY,assignment_id TEXT NOT NULL REFERENCES assignments(id),data TEXT NOT NULL);
   CREATE TABLE events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,observed_at TEXT NOT NULL,type TEXT NOT NULL,data TEXT NOT NULL);
   PRAGMA user_version=1;`);
    }
    const version = this.db.prepare('PRAGMA user_version').get();
    if (version?.user_version !== 1) {
      this.db.close();
      throw new InputError('Unsupported workday database version');
    }
  }

  /** Creates initial workday and assignment rows in the private SQLite database. */
  initialize(id: string, data: unknown, owners: string[]): void {
    this.transaction(() => {
      this.db
        .prepare('INSERT INTO workdays VALUES(?,?,?)')
        .run(id, 'preparing', JSON.stringify(data));
      for (const owner of owners)
        this.db.prepare('INSERT INTO assignments VALUES(?,?,?)').run(owner, 'pending', '{}');
      this.event('workday.created', { id, owners });
    });
  }

  /** Commits all coordination changes together or rolls them back on failure. */
  private transaction(action: () => void): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      action();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /** Appends an ordered coordination event within the current transaction. */
  private event(type: string, payload: unknown): void {
    this.db
      .prepare('INSERT INTO events(observed_at,type,data) VALUES(?,?,?)')
      .run(new Date().toISOString(), type, JSON.stringify(payload));
  }

  /** Atomically persists delivery, readiness and the corresponding coordination event. */
  commit(
    type: string,
    payload: unknown,
    options: {
      workday?: Update;
      assignments?: Update[];
      messages?: Message[];
      execution?: { assignment: string; data: unknown };
    } = {},
  ): void {
    this.transaction(() => {
      if (options.workday) this.update('workdays', options.workday);
      for (const assignment of options.assignments ?? []) this.update('assignments', assignment);
      for (const m of options.messages ?? [])
        this.db
          .prepare('INSERT INTO messages VALUES(?,?,?,?,?,?)')
          .run(m.id, m.from, m.to, m.kind, m.replyTo ?? null, JSON.stringify(m.payload));
      if (options.execution)
        this.db
          .prepare('INSERT INTO executions VALUES(?,?,?)')
          .run(randomUUID(), options.execution.assignment, JSON.stringify(options.execution.data));
      this.event(type, payload);
    });
  }

  /** Updates exactly one known workday or assignment row. */
  private update(table: 'workdays' | 'assignments', value: Update): void {
    const result = this.db
      .prepare(`UPDATE ${table} SET status=?,data=? WHERE id=?`)
      .run(value.status, JSON.stringify(value.data), value.id);
    if (result.changes !== 1)
      throw new Error(table === 'workdays' ? 'Unknown workday' : 'Unknown assignment');
  }

  /** Reads the authoritative coordination projection for inspection and reports. */
  snapshot() {
    const rows = this.db.prepare('SELECT * FROM workdays').all();
    if (rows.length !== 1) throw new InputError('Incomplete workday database');
    const decode = (row: Record<string, unknown>): Record<string, unknown> => ({
      ...row,
      data: JSON.parse(String(row.data)),
    });
    return {
      workday: decode(rows[0]!),
      assignments: this.db.prepare('SELECT * FROM assignments ORDER BY id').all().map(decode),
      messages: this.db.prepare('SELECT * FROM messages ORDER BY rowid').all().map(decode),
      executions: this.db.prepare('SELECT * FROM executions ORDER BY rowid').all().map(decode),
    };
  }

  /** Reads ordered coordination events after the caller’s cursor. */
  events(after = 0): WorkdayEvent[] {
    return this.db
      .prepare('SELECT * FROM events WHERE sequence>? ORDER BY sequence')
      .all(after)
      .map((r) => ({
        sequence: Number(r.sequence),
        observedAt: String(r.observed_at),
        type: String(r.type),
        payload: JSON.parse(String(r.data)),
      }));
  }

  /** Releases resources owned by this instance. */
  close(): void {
    this.db.close();
  }
}
