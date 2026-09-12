import { rmSync } from "node:fs";
import { join } from "node:path";

export const managedDataNames = [
  "opengym.db",
  "opengym.db-wal",
  "opengym.db-shm",
  "receipts",
  "member-photos",
  "branding",
] as const;

export function removeManagedData(dataDir: string) {
  for (const name of managedDataNames)
    rmSync(join(dataDir, name), { recursive: true, force: true });
}
