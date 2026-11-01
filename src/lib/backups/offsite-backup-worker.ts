import "server-only";

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const requiredEnvironment = [
  "BACKUP_ENCRYPTION_KEY",
  "BACKUP_S3_ENDPOINT",
  "BACKUP_S3_REGION",
  "BACKUP_S3_BUCKET",
  "BACKUP_S3_ACCESS_KEY_ID",
  "BACKUP_S3_SECRET_ACCESS_KEY",
] as const;
const workerState = globalThis as typeof globalThis & { citizavrexoBackupWorkerStarted?: boolean; citizavrexoBackupRunning?: boolean };

function configured(): boolean {
  const configuredCount = requiredEnvironment.filter((name) => Boolean(process.env[name])).length;
  if (configuredCount > 0 && configuredCount < requiredEnvironment.length) console.error("[backup] Off-site backup configuration is incomplete; scheduled backups are disabled.");
  return configuredCount === requiredEnvironment.length;
}

async function backupIsDue(): Promise<boolean> {
  const intervalHours = Number(process.env.BACKUP_SCHEDULE_HOURS ?? "24");
  if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 168) {
    console.error("[backup] BACKUP_SCHEDULE_HOURS must be an integer from 1 through 168; scheduled backups are disabled.");
    return false;
  }
  try {
    const state = JSON.parse(await readFile(/* turbopackIgnore: true */ process.env.BACKUP_STATE_FILE ?? "/var/data/backups/offsite-success.json", "utf8")) as { completedAt?: string };
    const completedAt = Date.parse(state.completedAt ?? "");
    return !Number.isFinite(completedAt) || Date.now() - completedAt >= intervalHours * 3_600_000;
  } catch {
    return true;
  }
}

async function runWhenDue(): Promise<void> {
  if (workerState.citizavrexoBackupRunning || !(await backupIsDue())) return;
  workerState.citizavrexoBackupRunning = true;
  const child = spawn(process.execPath, ["scripts/offsite-backup.mjs"], { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let standardError = "";
  child.stderr.on("data", (chunk: Buffer) => { standardError += chunk.toString(); });
  child.once("exit", (code) => {
    workerState.citizavrexoBackupRunning = false;
    if (code === 0) console.info("[backup] Scheduled encrypted off-site backup completed.");
    else console.error(`[backup] Scheduled off-site backup failed${standardError.trim() ? `: ${standardError.trim().slice(0, 300)}` : "."}`);
  });
  child.once("error", () => {
    workerState.citizavrexoBackupRunning = false;
    console.error("[backup] Scheduled off-site backup could not start.");
  });
}

export function startOffsiteBackupWorker(): void {
  if (workerState.citizavrexoBackupWorkerStarted || !configured()) return;
  workerState.citizavrexoBackupWorkerStarted = true;
  const initial = setTimeout(() => void runWhenDue(), 30_000);
  const interval = setInterval(() => void runWhenDue(), 60 * 60 * 1000);
  initial.unref();
  interval.unref();
}