import {
  openSync,
  closeSync,
  fsyncSync,
  readFileSync,
  writeFileSync,
  lstatSync,
  mkdirSync,
  unlinkSync,
  chmodSync,
  renameSync,
  existsSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { changes, checkScope } from "./changes.js";
import { git } from "./process.js";
import { digest } from "./assignment.js";
import { assertIdentity } from "./workspace.js";
import type { RecordData } from "./state.js";
interface FileState {
  content: string;
  mode: number;
}
interface Entry {
  path: string;
  working: FileState | null;
  index: { mode: string; oid: string; content: string } | null;
}
export function entry(record: RecordData, path: string): Entry {
  checkScope(record.workspace, [{ path, kind: "M" }], [path]);
  const file = join(record.workspace, path),
    stat = lstatSync(file, { throwIfNoEntry: false });
  if (stat && !stat.isFile())
    throw new Error("Candidate path is not a regular file: " + path);
  const rows = git(record.workspace, "ls-files", "--stage", "-z", "--", path)
    .split("\0")
    .filter(Boolean);
  if (rows.length > 1 || rows.some((r) => !/^\d+ [a-f0-9]+ 0\t/.test(r)))
    throw new Error("Unmerged index is unsupported");
  const fields = rows[0]?.split("\t")[0]?.split(" ");
  return {
    path,
    working: stat
      ? {
          content: readFileSync(file).toString("base64"),
          mode: stat.mode & 0o777,
        }
      : null,
    index: fields
      ? {
          mode: fields[0]!,
          oid: fields[1]!,
          content: execFileSync("git", [
            "-C",
            record.workspace,
            "cat-file",
            "blob",
            fields[1]!,
          ]).toString("base64"),
        }
      : null,
  };
}
export function snapshotChanges(record: RecordData): Entry[] {
  return changes(record).map((c) => entry(record, c.path));
}
export function assertOwner(
  record: RecordData,
  scope: string[],
  foreign: Entry[],
): void {
  assertIdentity(record);
  const owns = (p: string) =>
    scope.some((q) => q === "." || p === q || p.startsWith(q + "/"));
  for (const original of foreign) {
    if (
      JSON.stringify(entry(record, original.path)) !== JSON.stringify(original)
    )
      throw new Error("Other-owner candidate changed: " + original.path);
  }
  const allowedForeign = new Set(foreign.map((e) => e.path));
  checkScope(
    record.workspace,
    changes(record).filter((c) => !allowedForeign.has(c.path)),
    scope,
  );
  if (foreign.some((e) => owns(e.path)))
    throw new Error("Foreign checkpoint overlaps owner authority");
}
export class WorktreeParking {
  status = "none";
  private entries: Entry[] = [];
  private baseline: Entry[] = [];
  private hash = "";
  constructor(
    private record: RecordData,
    readonly path: string,
  ) {}
  private save() {
    const bytes =
      JSON.stringify(
        {
          schemaVersion: 1,
          workspace: this.record.workspace,
          base: this.record.base,
          branch: this.record.branch,
          status: this.status,
          entries: this.entries,
          baseline: this.baseline,
          hash: this.hash,
        },
        null,
        2,
      ) + "\n";
    writeFileSync(this.path + ".tmp", bytes, { mode: 0o600 });
    const file = openSync(this.path + ".tmp", "r");
    try {
      fsyncSync(file);
    } finally {
      closeSync(file);
    }
    renameSync(this.path + ".tmp", this.path);
    const directory = openSync(dirname(this.path), "r");
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  }
  park(scope: string[]): void {
    assertIdentity(this.record);
    this.entries = snapshotChanges(this.record);
    checkScope(
      this.record.workspace,
      this.entries.map((e) => ({ path: e.path, kind: "M" })),
      scope,
    );
    this.hash = digest(JSON.stringify(this.entries));
    this.status = "parking";
    this.save();
    for (const item of this.entries) {
      const tree = git(
        this.record.workspace,
        "ls-tree",
        this.record.base,
        "--",
        item.path,
      );
      if (tree) {
        git(
          this.record.workspace,
          "restore",
          "--source=" + this.record.base,
          "--staged",
          "--worktree",
          "--",
          item.path,
        );
      } else {
        git(
          this.record.workspace,
          "rm",
          "--cached",
          "--ignore-unmatch",
          "--",
          item.path,
        );
        const p = join(this.record.workspace, item.path);
        if (existsSync(p)) unlinkSync(p);
      }
    }
    this.baseline = this.entries.map((e) => entry(this.record, e.path));
    assertIdentity(this.record);
    this.status = "parked";
    this.save();
  }
  restore(): void {
    if (this.status === "restored" || this.status === "none") return;
    if (this.status !== "parked")
      throw new Error("Parking transition is unresolved");
    assertIdentity(this.record);
    const persisted = JSON.parse(readFileSync(this.path, "utf8"));
    if (
      persisted.hash !== this.hash ||
      digest(JSON.stringify(persisted.entries)) !== this.hash ||
      JSON.stringify(persisted.baseline) !== JSON.stringify(this.baseline)
    )
      throw new Error("Parked evidence changed");
    for (const before of this.baseline)
      if (
        JSON.stringify(entry(this.record, before.path)) !==
        JSON.stringify(before)
      )
        throw new Error("Parked path was replaced: " + before.path);
    const parkedPaths = new Set(this.entries.map((e) => e.path)),
      foreign = snapshotChanges(this.record).filter(
        (e) => !parkedPaths.has(e.path),
      );
    this.status = "restoring";
    this.save();
    for (const item of this.entries) {
      if (item.index) {
        const oid = execFileSync(
          "git",
          ["-C", this.record.workspace, "hash-object", "-w", "--stdin"],
          {
            input: Buffer.from(item.index.content, "base64"),
            encoding: "utf8",
          },
        ).trim();
        if (oid !== item.index.oid)
          throw new Error("Parked index blob hash mismatch");
        git(
          this.record.workspace,
          "update-index",
          "--add",
          "--cacheinfo",
          item.index.mode,
          item.index.oid,
          item.path,
        );
      } else
        git(
          this.record.workspace,
          "rm",
          "--cached",
          "--ignore-unmatch",
          "--",
          item.path,
        );
      const p = join(this.record.workspace, item.path);
      if (item.working) {
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, Buffer.from(item.working.content, "base64"));
        chmodSync(p, item.working.mode);
      } else if (existsSync(p)) unlinkSync(p);
    }
    for (const original of [...this.entries, ...foreign])
      if (
        JSON.stringify(entry(this.record, original.path)) !==
        JSON.stringify(original)
      )
        throw new Error("Restoration did not preserve candidate");
    assertIdentity(this.record);
    this.status = "restored";
    this.save();
  }
}
