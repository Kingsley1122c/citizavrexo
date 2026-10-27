import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { hasPermission } from "@/lib/auth/permissions";
import { consumeAuthRateLimit } from "@/lib/auth/rate-limit-service";
import { db } from "@/lib/db/client";
import { adminMessages, emailOutbox, users } from "@/lib/db/schema";
import type { AdminRole } from "@/lib/domain";
import type { EmailTransport } from "@/lib/notifications/email-service";
import { adminMessagePayloadSchema } from "@/lib/notifications/email-service";
import { deliverQueuedEmail } from "@/lib/notifications/outbox-service";
import { resendEmailTransport } from "@/lib/notifications/resend-transport";

export class AdminMessageError extends Error {}

const safeSubject = (value: string) => value.trim().replace(/\s+/g, " ");
const safeBody = (value: string) => value.trim().replace(/\r\n?/g, "\n");
const messageInputSchema = z.object({
  recipientUserId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
  subject: z.string().trim().min(2).max(120),
  message: z.string().trim().min(2).max(4000),
  idempotencyKey: z.string().min(8).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]+$/),
});

export async function sendAdminMessage(input: { actorId: string; actorLabel: string; actorRole: AdminRole | null; recipientUserId: string; subject: string; message: string; idempotencyKey: string }, transport: EmailTransport = resendEmailTransport) {
  if (!hasPermission(input.actorRole, "notifications.manage")) throw new AdminMessageError("Customer messaging is not permitted.");
  const parsed = messageInputSchema.safeParse(input);
  if (!parsed.success) throw new AdminMessageError("Enter a subject and message using the allowed lengths.");
  const subject = safeSubject(parsed.data.subject);
  const message = safeBody(parsed.data.message);
  const existing = await db.select().from(adminMessages).where(eq(adminMessages.idempotencyKey, input.idempotencyKey)).get();
  if (existing) {
    if (existing.sentBy !== input.actorId || existing.recipientUserId !== input.recipientUserId || existing.subject !== subject || existing.body !== message) throw new AdminMessageError("This message key was already used for different content.");
    return existing;
  }
  if (!consumeAuthRateLimit("admin_message", input.actorId)) throw new AdminMessageError("Message sending is temporarily limited. Try again later.");

  const actor = await db.select().from(users).where(and(eq(users.id, input.actorId), eq(users.status, "active"), isNull(users.deletedAt))).get();
  const recipient = await db.select().from(users).where(and(eq(users.id, input.recipientUserId), isNull(users.deletedAt), isNull(users.adminRole))).get();
  if (!actor || actor.adminRole !== input.actorRole || !hasPermission(actor.adminRole, "notifications.manage")) throw new AdminMessageError("Customer messaging is not permitted.");
  if (!recipient || recipient.status === "deleted") throw new AdminMessageError("The selected customer is no longer available.");

  const messageId = `NMSG-${randomUUID()}`;
  const outboxId = randomUUID();
  const now = new Date().toISOString();
  const payload = adminMessagePayloadSchema.parse({ to: recipient.email, locale: recipient.locale, event: "admin_message", eventReference: messageId, displayName: recipient.name, subject, message });
  db.transaction((tx) => {
    tx.insert(emailOutbox).values({ id: outboxId, recipient: recipient.email, event: "admin_message", eventReference: messageId, payloadJson: JSON.stringify(payload), status: "pending", createdAt: now }).run();
    tx.insert(adminMessages).values({ id: messageId, idempotencyKey: input.idempotencyKey, recipientUserId: recipient.id, recipientName: recipient.name, recipientEmail: recipient.email, subject, body: message, sentBy: actor.id, outboxId, deliveryStatus: "pending", createdAt: now }).run();
  });

  try {
    await deliverQueuedEmail(outboxId, transport);
  } catch {
    throw new AdminMessageError("Email delivery failed. Confirm the address and try again shortly.");
  }
  return (await db.select().from(adminMessages).where(eq(adminMessages.id, messageId)).get())!;
}