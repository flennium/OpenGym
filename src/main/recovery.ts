import Database from "better-sqlite3";
import { copyFileSync, readFileSync, renameSync } from "node:fs";

export const SUPPORTED_SCHEMA_VERSION = 10;

export function inspectBackup(path: string) {
  if (readFileSync(path).subarray(0, 16).toString() !== "SQLite format 3\u0000")
    throw new Error("Not a valid SQLite database");
  const probe = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const integrity = probe.pragma("quick_check") as Array<{
      quick_check: string;
    }>;
    if (integrity[0]?.quick_check !== "ok")
      throw new Error("Database integrity check failed");
    const version = (
      probe
        .prepare("SELECT MAX(version) version FROM schema_migrations")
        .get() as { version?: number }
    )?.version;
    if (!version || version > SUPPORTED_SCHEMA_VERSION)
      throw new Error("Unsupported database version");
    return { version };
  } finally {
    probe.close();
  }
}

export function stageDatabaseReplacement(source: string, destination: string) {
  inspectBackup(source);
  const stamp = Date.now();
  const safety = `${destination}.safety-${stamp}`;
  const incoming = `${destination}.incoming-${stamp}`;
  copyFileSync(destination, safety);
  copyFileSync(source, incoming);
  inspectBackup(incoming);
  renameSync(destination, `${destination}.previous-${stamp}`);
  try {
    renameSync(incoming, destination);
  } catch (error) {
    copyFileSync(safety, destination);
    throw error;
  }
  return safety;
}
