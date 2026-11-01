export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startOffsiteBackupWorker } = await import("@/lib/backups/offsite-backup-worker");
    startOffsiteBackupWorker();
    const { isTransactionalEmailConfigured } = await import("@/lib/notifications/resend-transport");
    if (!isTransactionalEmailConfigured()) return;
    const { startEmailOutboxWorker } = await import("@/lib/notifications/outbox-service");
    startEmailOutboxWorker();
  }
}