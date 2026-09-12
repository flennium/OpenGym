import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectBackup, SUPPORTED_SCHEMA_VERSION } from "./recovery.js";

const dirs: string[] = [];
const fixture = (version = SUPPORTED_SCHEMA_VERSION) => {
  const dir = mkdtempSync(join(tmpdir(), "opengym-recovery-")); dirs.push(dir);
  const path = join(dir, "backup.db");
  const db = new Database(path);
  db.exec("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
  db.prepare("INSERT INTO schema_migrations VALUES(?,datetime('now'))").run(version);
  db.close();
  return path;
};
afterEach(() => dirs.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

describe("backup recovery validation", () => {
  it("accepts a complete supported backup", () => expect(inspectBackup(fixture()).version).toBe(SUPPORTED_SCHEMA_VERSION));
  it("rejects an intentionally interrupted database copy", () => {
    const path = fixture();
    writeFileSync(path, Buffer.from("SQLite format 3\0partial-copy"));
    expect(() => inspectBackup(path)).toThrow();
  });
  it("rejects a backup from a newer schema", () => expect(() => inspectBackup(fixture(SUPPORTED_SCHEMA_VERSION + 1))).toThrow(/unsupported/i));
});
