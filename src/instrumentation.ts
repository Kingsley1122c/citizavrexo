export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { isTransactionalEmailConfigured } = await import("@/lib/notifications/resend-transport");
    if (!isTransactionalEmailConfigured()) return;
    const { startEmailOutboxWorker } = await import("@/lib/notifications/outbox-service");
    startEmailOutboxWorker();
  }
}