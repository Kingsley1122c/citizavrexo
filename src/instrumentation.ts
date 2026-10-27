export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.APP_URL) {
    const { startEmailOutboxWorker } = await import("@/lib/notifications/outbox-service");
    startEmailOutboxWorker();
  }
}