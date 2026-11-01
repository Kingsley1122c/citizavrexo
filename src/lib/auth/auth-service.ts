import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { accounts, auditEvents, authenticationTokens, credentials, emailOutbox, recoveryRequests, sessions, users } from "@/lib/db/schema";
import { generateAccountNumber } from "@/lib/accounts/account-number";
import type { EmailTransport } from "@/lib/notifications/email-service";
import { deliverQueuedEmail } from "@/lib/notifications/outbox-service";
import { requireTransactionalEmailConfiguration, resendEmailTransport } from "@/lib/notifications/resend-transport";
import { persistUserEvent } from "@/lib/notifications/user-event-service";
import type { Locale } from "@/lib/i18n/config";
import type { Currency } from "@/lib/currency";
import { userUi } from "@/lib/i18n/user-ui";
import { deriveActionToken, hashActionToken } from "./action-token";
import { createSession } from "./session-service";
import { hashTransactionPin } from "@/lib/security/transaction-pin-service";
import { passwordSchema } from "./password-policy";

const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
const passwordOptions = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const hashPassword = async (password: string) => (await import("@node-rs/argon2")).hash(password, passwordOptions);
const verifyPassword = async (passwordHash: string, password: string) => (await import("@node-rs/argon2")).verify(passwordHash, password);
const safeName = z.string().trim().min(2).max(100).regex(/^[^\p{Cc}\p{Cf}]+$/u);
type SessionRequest = { ipAddress?: string; userAgent?: string };
export class VerificationEmailDeliveryError extends Error {}

export async function registerUser(input: { name: string; email: string; password: string; pin: string; locale: Locale; currency: Currency }, _request?: SessionRequest, transport?: EmailTransport): Promise<void> {
  if (!transport) requireTransactionalEmailConfiguration();
  const deliveryTransport = transport ?? resendEmailTransport;
  const name = safeName.parse(input.name);
  const password = passwordSchema.parse(input.password);
  const email = input.email.trim().toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) throw new Error("Unable to create account.");
  const userId = randomUUID(); const now = new Date().toISOString();
  const tokenId = randomUUID();
  const outboxId = randomUUID();
  const verificationToken = deriveActionToken(tokenId, "email_verification");
  const passwordHash = await hashPassword(password);
  const transactionPinHash = await hashTransactionPin(input.pin);
  db.transaction((tx) => {
    const accountNumber = generateAccountNumber((number) => Boolean(tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.number, number)).get()));
    tx.insert(users).values({ id: userId, name, email, avatarInitials: initials(name), status: "pending", locale: input.locale, displayCurrency: input.currency, createdAt: now, updatedAt: now }).run();
    tx.insert(credentials).values({ userId, passwordHash, transactionPinHash, passwordChangedAt: now }).run();
    tx.insert(accounts).values({ id: randomUUID(), userId, name: "Personal Account", number: accountNumber, type: "personal", currency: input.currency, balanceMinor: 0, status: "active", createdAt: now, updatedAt: now }).run();
    tx.insert(authenticationTokens).values({ id: tokenId, userId, purpose: "email_verification", tokenHash: hashActionToken(verificationToken), expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), createdAt: now }).run();
    tx.insert(emailOutbox).values({ id: outboxId, recipient: email, event: "welcome", eventReference: `VERIFY-${tokenId}`, payloadJson: JSON.stringify({ to: email, locale: input.locale, event: "welcome", eventReference: tokenId, displayName: name, summary: "Verify your email address to activate your Citizavrexo account.", action: { kind: "verify_email", tokenId } }), status: "pending", createdAt: now }).run();
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: userId, actorLabel: email, action: "user.register", target: userId, result: "success", metadataJson: JSON.stringify({ accountCurrency: input.currency, emailVerified: false, transactionPinConfigured: true }), timestamp: now }).run();
  }, { behavior: "immediate" });
  try {
    await deliverQueuedEmail(outboxId, deliveryTransport);
  } catch {
    throw new VerificationEmailDeliveryError("Verification email delivery failed. The account remains pending.");
  }
}

export async function requestEmailVerification(emailInput: string, transport?: EmailTransport, now = new Date()): Promise<void> {
  if (!transport) requireTransactionalEmailConfiguration();
  const startedAt = Date.now();
  const email = emailInput.trim().toLowerCase();
  const user = db.select().from(users).where(and(eq(users.email, email), eq(users.status, "pending"), isNull(users.emailVerifiedAt))).get();
  let outboxId: string | undefined;
  if (user) {
    const timestamp = now.toISOString();
    const tokenId = randomUUID();
    outboxId = randomUUID();
    const verificationToken = deriveActionToken(tokenId, "email_verification");
    db.transaction((tx) => {
      const oldTokens = tx.select({ id: authenticationTokens.id }).from(authenticationTokens).where(and(eq(authenticationTokens.userId, user.id), eq(authenticationTokens.purpose, "email_verification"), isNull(authenticationTokens.usedAt))).all();
      if (oldTokens.length) {
        tx.update(authenticationTokens).set({ usedAt: timestamp }).where(inArray(authenticationTokens.id, oldTokens.map((token) => token.id))).run();
        tx.delete(emailOutbox).where(and(inArray(emailOutbox.eventReference, oldTokens.map((token) => `VERIFY-${token.id}`)), ne(emailOutbox.status, "sent"))).run();
      }
      tx.insert(authenticationTokens).values({ id: tokenId, userId: user.id, purpose: "email_verification", tokenHash: hashActionToken(verificationToken), expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(), createdAt: timestamp }).run();
      tx.insert(emailOutbox).values({ id: outboxId!, recipient: user.email, event: "welcome", eventReference: `VERIFY-${tokenId}`, payloadJson: JSON.stringify({ to: user.email, locale: user.locale, event: "welcome", eventReference: tokenId, displayName: user.name, summary: "Verify your email address to activate your Citizavrexo account.", action: { kind: "verify_email", tokenId } }), status: "pending", createdAt: timestamp }).run();
      tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: user.id, actorLabel: user.email, action: "email.verify.resend", target: user.id, result: "success", metadataJson: "{}", timestamp }).run();
    }, { behavior: "immediate" });
    if (transport) await deliverQueuedEmail(outboxId, transport).catch(() => undefined);
  }
  const minimumMs = 250 + randomBytes(1)[0] % 101;
  const remainingMs = minimumMs - (Date.now() - startedAt);
  if (remainingMs > 0) await new Promise((resolve) => setTimeout(resolve, remainingMs));
}

export function verifyRegisteredEmail(verificationToken: string, emailInput: string, now = new Date()): void {
  const timestamp = now.toISOString();
  const digest = hashActionToken(verificationToken);
  const expectedEmail = emailInput.trim().toLowerCase();
  db.transaction((tx) => {
    const token = tx.select().from(authenticationTokens).where(and(eq(authenticationTokens.tokenHash, digest), eq(authenticationTokens.purpose, "email_verification"), isNull(authenticationTokens.usedAt), gt(authenticationTokens.expiresAt, timestamp))).limit(1).get();
    if (!token) throw new Error("Verification link is invalid or expired.");
    const user = tx.select().from(users).where(and(eq(users.id, token.userId), eq(users.email, expectedEmail), eq(users.status, "pending"))).get();
    if (!user) throw new Error("Verification link is invalid or expired.");
    const consumed = tx.update(authenticationTokens).set({ usedAt: timestamp }).where(and(eq(authenticationTokens.id, token.id), isNull(authenticationTokens.usedAt))).run();
    if (consumed.changes !== 1) throw new Error("Verification link is invalid or expired.");
    const activated = tx.update(users).set({ status: "active", emailVerifiedAt: timestamp, updatedAt: timestamp }).where(and(eq(users.id, token.userId), eq(users.status, "pending"))).run();
    if (activated.changes !== 1) throw new Error("Verification link is invalid or expired.");
    const t = userUi(user.locale);
    persistUserEvent(tx, { userId: user.id, email: user.email, displayName: user.name, locale: user.locale, kind: "system", title: "Welcome to CITIZAVREXO", message: "Your account is verified and ready. Review your profile and security settings to finish setup.", emailEvent: "welcome", eventKey: `WELCOME-${user.id}`, publicReference: `WELCOME-${user.id}`, emailSummary: t.notifications.messageWelcomeReady, important: true, createdAt: timestamp });
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: token.userId, actorLabel: "verified-email", action: "email.verify", target: token.userId, result: "success", metadataJson: "{}", timestamp }).run();
  });
}

export async function loginUser(input: { email: string; password: string; persistent: boolean }, request?: SessionRequest): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const [row] = await db.select({ user: users, credential: credentials }).from(users).innerJoin(credentials, eq(users.id, credentials.userId)).where(eq(users.email, email)).limit(1);
  const valid = row ? await verifyPassword(row.credential.passwordHash, input.password) : false;
  if (!row || !valid || row.user.status !== "active") {
    await db.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorLabel: email || "unknown", action: "login", target: email || "unknown", result: "denied", metadataJson: "{}", timestamp: new Date().toISOString() });
    throw new Error("Invalid email or password.");
  }
  await createSession(row.user.id, input.persistent, request);
  await db.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: row.user.id, actorLabel: row.user.email, action: "login", target: row.user.id, result: "success", metadataJson: "{}", timestamp: new Date().toISOString() });
}

export async function requestPasswordReset(emailInput: string, transport?: EmailTransport): Promise<void> {
  if (!transport) requireTransactionalEmailConfiguration();
  const deliveryTransport = transport ?? resendEmailTransport;
  const startedAt = Date.now();
  const email = emailInput.trim().toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (user) {
    const now = new Date().toISOString();
    const tokenId = randomUUID(); const reference = tokenId; const outboxId = randomUUID();
    const resetToken = deriveActionToken(tokenId, "password_reset");
    db.transaction((tx) => {
      const oldTokens = tx.select({ id: authenticationTokens.id }).from(authenticationTokens).where(and(eq(authenticationTokens.userId, user.id), eq(authenticationTokens.purpose, "password_reset"), isNull(authenticationTokens.usedAt))).all();
      if (oldTokens.length) {
        tx.update(authenticationTokens).set({ usedAt: now }).where(inArray(authenticationTokens.id, oldTokens.map((token) => token.id))).run();
        tx.delete(emailOutbox).where(and(inArray(emailOutbox.eventReference, oldTokens.map((token) => `RESET-${token.id}`)), ne(emailOutbox.status, "sent"))).run();
      }
      tx.insert(recoveryRequests).values({ id: reference, userId: user.id, status: "submitted", method: "email", risk: "low", submittedAt: now }).run();
      tx.insert(authenticationTokens).values({ id: tokenId, userId: user.id, purpose: "password_reset", tokenHash: hashActionToken(resetToken), expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), createdAt: now }).run();
      tx.insert(emailOutbox).values({ id: outboxId, recipient: email, event: "account_recovery", eventReference: `RESET-${reference}`, payloadJson: JSON.stringify({ to: email, locale: user.locale, event: "account_recovery", eventReference: reference, displayName: user.name, summary: userUi(user.locale).email.actionSubjects.reset_password, action: { kind: "reset_password", tokenId } }), status: "pending", createdAt: now }).run();
      tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: user.id, actorLabel: user.email, action: "recovery.request", target: reference, result: "success", metadataJson: JSON.stringify({ method: "email" }), timestamp: now }).run();
    });
    await deliverQueuedEmail(outboxId, deliveryTransport).catch(() => undefined);
  }
  const minimumMs = 250 + randomBytes(1)[0] % 101;
  const remainingMs = minimumMs - (Date.now() - startedAt);
  if (remainingMs > 0) await new Promise((resolve) => setTimeout(resolve, remainingMs));
}

export async function resetPasswordWithToken(resetToken: string, newPassword: string, now = new Date()): Promise<void> {
  const timestamp = now.toISOString();
  const digest = hashActionToken(resetToken);
  const passwordHash = await hashPassword(passwordSchema.parse(newPassword));
  db.transaction((tx) => {
    const token = tx.select().from(authenticationTokens).where(and(eq(authenticationTokens.tokenHash, digest), eq(authenticationTokens.purpose, "password_reset"), isNull(authenticationTokens.usedAt), gt(authenticationTokens.expiresAt, timestamp))).limit(1).get();
    if (!token) throw new Error("Password reset link is invalid or expired.");
    const consumed = tx.update(authenticationTokens).set({ usedAt: timestamp }).where(and(eq(authenticationTokens.id, token.id), isNull(authenticationTokens.usedAt))).run();
    if (consumed.changes !== 1) throw new Error("Password reset link is invalid or expired.");
    tx.update(credentials).set({ passwordHash, transactionPinHash: null, passwordChangedAt: timestamp }).where(eq(credentials.userId, token.userId)).run();
    tx.update(sessions).set({ revokedAt: timestamp }).where(and(eq(sessions.userId, token.userId), isNull(sessions.revokedAt))).run();
    tx.update(recoveryRequests).set({ status: "completed", reviewedAt: timestamp }).where(eq(recoveryRequests.id, token.id)).run();
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: token.userId, actorLabel: "verified-email", action: "recovery.complete", target: token.id, result: "success", metadataJson: JSON.stringify({ method: "email" }), timestamp }).run();
  });
}
