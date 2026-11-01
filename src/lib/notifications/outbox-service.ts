import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { adminMessages, auditEvents, authenticationTokens, emailOutbox, users } from "@/lib/db/schema";
import { deriveActionToken } from "@/lib/auth/action-token";
import type { EmailTransport, SafeEmailPayload } from "./email-service";
import { safeEmailPayloadSchema, sendEventEmail } from "./email-service";
import { DailyEmailLimitError, getApplicationUrl, resendEmailTransport } from "./resend-transport";

const maximumAttempts = 5;
const retryMinutes = [1, 5, 15, 60, 240];

export async function queueEmail(payload: SafeEmailPayload): Promise<string> {
  const validated = safeEmailPayloadSchema.parse(payload);
  const id = randomUUID();
  await db.insert(emailOutbox).values({ id, recipient: validated.to, event: validated.event, eventReference: validated.eventReference, payloadJson: JSON.stringify(validated), status: "pending", createdAt: new Date().toISOString() });
  return id;
}

export async function deliverQueuedEmail(id: string, transport: EmailTransport): Promise<void> {
  const lockedAt = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const claim = await db.update(emailOutbox).set({ status: "processing", lockedAt, attempts: sql`${emailOutbox.attempts} + 1`, lastError: null, nextAttemptAt: null }).where(and(eq(emailOutbox.id, id), lt(emailOutbox.attempts, maximumAttempts), or(eq(emailOutbox.status, "pending"), and(eq(emailOutbox.status, "failed"), or(isNull(emailOutbox.nextAttemptAt), lte(emailOutbox.nextAttemptAt, lockedAt))), and(eq(emailOutbox.status, "processing"), lt(emailOutbox.lockedAt, staleBefore)))));
  if (claim.changes !== 1) return;
  const [row] = await db.select().from(emailOutbox).where(and(eq(emailOutbox.id, id), eq(emailOutbox.status, "processing"), eq(emailOutbox.lockedAt, lockedAt))).limit(1);
  if (!row) return;
  try {
    const payload = safeEmailPayloadSchema.parse(JSON.parse(row.payloadJson));
    let actionUrl: string | undefined;
    if (payload.event !== "admin_message" && payload.action) {
      const [token] = await db.select().from(authenticationTokens).where(eq(authenticationTokens.id, payload.action.tokenId)).limit(1);
      const purpose = payload.action.kind === "verify_email" ? "email_verification" : "password_reset";
      if (!token || token.purpose !== purpose || token.usedAt || token.expiresAt <= lockedAt) throw new Error("Email action is no longer valid.");
      const path = payload.action.kind === "verify_email" ? "/verify-email" : "/reset-password";
      const value = deriveActionToken(token.id, purpose);
      actionUrl = `${getApplicationUrl()}${path}?token=${encodeURIComponent(value)}`;
    }
    await sendEventEmail(transport, payload, `outbox/${row.id}`, actionUrl);
    const sentAt = new Date().toISOString();
    db.transaction((tx) => {
      tx.update(emailOutbox).set({ status: "sent", sentAt, lockedAt: null, lastError: null }).where(and(eq(emailOutbox.id, id), eq(emailOutbox.lockedAt, lockedAt))).run();
      tx.update(adminMessages).set({ deliveryStatus: "sent", deliveredAt: sentAt }).where(eq(adminMessages.outboxId, id)).run();
      const message = tx.select().from(adminMessages).where(eq(adminMessages.outboxId, id)).get();
      const actor = message ? tx.select({ email: users.email }).from(users).where(eq(users.id, message.sentBy)).get() : undefined;
      if (message && actor) tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: message.sentBy, actorLabel: actor.email, action: "admin.message.send", target: message.recipientUserId, result: "success", metadataJson: JSON.stringify({ messageId: message.id, recipient: message.recipientEmail, subject: message.subject, delivery: "sent" }), timestamp: sentAt }).run();
    });
  } catch (error) {
    const delay = error instanceof DailyEmailLimitError ? 24 * 60 : retryMinutes[Math.min(row.attempts, retryMinutes.length - 1)];
    db.transaction((tx) => {
      tx.update(emailOutbox).set({ status: "failed", lockedAt: null, lastError: "Transactional email delivery failed.", nextAttemptAt: new Date(Date.now() + delay * 60 * 1000).toISOString() }).where(and(eq(emailOutbox.id, id), eq(emailOutbox.lockedAt, lockedAt))).run();
      tx.update(adminMessages).set({ deliveryStatus: "failed" }).where(eq(adminMessages.outboxId, id)).run();
      const message = tx.select().from(adminMessages).where(eq(adminMessages.outboxId, id)).get();
      const actor = message ? tx.select({ email: users.email }).from(users).where(eq(users.id, message.sentBy)).get() : undefined;
      if (message && actor) tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: message.sentBy, actorLabel: actor.email, action: "admin.message.send", target: message.recipientUserId, result: "failed", metadataJson: JSON.stringify({ messageId: message.id, recipient: message.recipientEmail, subject: message.subject, delivery: "failed" }), timestamp: new Date().toISOString() }).run();
    });
    throw new Error("Transactional email delivery failed.");
  }
}

export async function processEmailOutbox(transport: EmailTransport = resendEmailTransport): Promise<void> {
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const rows = await db.select({ id: emailOutbox.id }).from(emailOutbox).where(and(lt(emailOutbox.attempts, maximumAttempts), or(eq(emailOutbox.status, "pending"), and(eq(emailOutbox.status, "failed"), or(isNull(emailOutbox.nextAttemptAt), lte(emailOutbox.nextAttemptAt, now))), and(eq(emailOutbox.status, "processing"), lt(emailOutbox.lockedAt, staleBefore))))).limit(10);
  await Promise.allSettled(rows.map((row) => deliverQueuedEmail(row.id, transport)));
}

declare global { var CitizavrexoEmailWorkerStarted: boolean | undefined; }

export function startEmailOutboxWorker(): void {
  if (globalThis.CitizavrexoEmailWorkerStarted) return;
  globalThis.CitizavrexoEmailWorkerStarted = true;
  void processEmailOutbox();
  setInterval(() => void processEmailOutbox(), 60_000).unref();
}
