import "server-only";

import { Resend } from "resend";
import { z } from "zod";
import { consumeAuthRateLimit } from "@/lib/auth/rate-limit-service";
import { isRecoveryCodePepperConfigured } from "@/lib/security/runtime-secrets";
import type { EmailTransport } from "./email-service";

const senderSchema = z.string().trim().min(3).max(320).regex(/^.+<[^<>\s]+@[^<>\s]+>$/);
export const canonicalApplicationUrl = "https://citizavrexo.com";

export class DailyEmailLimitError extends Error {}
export class TransactionalEmailUnavailableError extends Error {}

export function isTransactionalEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.APP_URL && isRecoveryCodePepperConfigured());
}

export function requireTransactionalEmailConfiguration(): void {
  if (!isTransactionalEmailConfigured()) throw new TransactionalEmailUnavailableError("Transactional email delivery is unavailable.");
}

export function getApplicationUrl(): string {
  const value = new URL(process.env.APP_URL ?? "");
  if (process.env.NODE_ENV === "production" && value.protocol !== "https:") throw new Error("APP_URL must use HTTPS in production.");
  if (process.env.NODE_ENV === "production") return canonicalApplicationUrl;
  return value.origin;
}

export const resendEmailTransport: EmailTransport = {
  async send(message) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("Transactional email delivery is unavailable.");
    const from = senderSchema.parse(process.env.EMAIL_FROM);
    if (!consumeAuthRateLimit("email_delivery", "global")) throw new DailyEmailLimitError();
    const { data, error } = await new Resend(apiKey).emails.send({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers: { "X-Entity-Ref-ID": message.idempotencyKey },
    }, { idempotencyKey: message.idempotencyKey });
    if (error || !data?.id) throw new Error("Transactional email provider rejected the message.");
  },
};