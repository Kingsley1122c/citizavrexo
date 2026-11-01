import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { hashSync, verifySync } from "@node-rs/argon2";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { hasPermission } from "@/lib/auth/permissions";
import { clearAuthRateLimit, consumeAuthRateLimit } from "@/lib/auth/rate-limit-service";
import { db } from "@/lib/db/client";
import {
  auditEvents,
  transactionAuthorizationAttempts,
  transactionAuthorizationCodes,
  transactionAuthorizationRequests,
  transferPinAuthorizations,
  transferQuotes,
  users,
} from "@/lib/db/schema";
import type { AdminRole } from "@/lib/domain";
import { persistUserEvent } from "@/lib/notifications/user-event-service";
import { transferBetweenUsers } from "./transfer-service";

const codePattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const codeTtlMs = 15 * 60_000;
const requestTtlMs = 24 * 60 * 60_000;
const lockoutMs = 15 * 60_000;
const maxCodeFailures = 5;
const hashOptions = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const idempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export class TransactionAuthorizationError extends Error {}

const normalizeCode = (value: string) => value.trim().toUpperCase();
const generateCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  const raw = Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
};

export function requestTransactionAuthorization(input: {
  userId: string;
  actorLabel: string;
  quoteId: string;
  pinAuthorizationId: string;
  idempotencyKey: string;
  now?: Date;
}) {
  if (!idempotencyPattern.test(input.idempotencyKey)) throw new TransactionAuthorizationError("A valid transfer key is required.");
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const requestExpiresAt = new Date(now.getTime() + requestTtlMs).toISOString();

  return db.transaction((tx) => {
    const existing = tx.select().from(transactionAuthorizationRequests).where(eq(transactionAuthorizationRequests.idempotencyKey, input.idempotencyKey)).get();
    if (existing) {
      if (existing.userId !== input.userId || existing.quoteId !== input.quoteId) throw new TransactionAuthorizationError("This transfer key was already used for different details.");
      return { requestId: existing.id, reference: existing.reference, status: existing.status, transferReference: existing.transferReference ?? undefined };
    }

    const quote = tx.select().from(transferQuotes).where(and(eq(transferQuotes.id, input.quoteId), eq(transferQuotes.userId, input.userId), isNull(transferQuotes.consumedAt), gt(transferQuotes.expiresAt, timestamp))).get();
    const pinAuthorization = tx.select().from(transferPinAuthorizations).where(and(eq(transferPinAuthorizations.id, input.pinAuthorizationId), eq(transferPinAuthorizations.quoteId, input.quoteId), eq(transferPinAuthorizations.userId, input.userId), isNull(transferPinAuthorizations.consumedAt), gt(transferPinAuthorizations.expiresAt, timestamp))).get();
    if (!quote || !pinAuthorization) throw new TransactionAuthorizationError("Transaction PIN authorization is invalid or expired. Enter your PIN again.");

    const id = randomUUID();
    const reference = `NVA-${randomUUID()}`;
    tx.insert(transactionAuthorizationRequests).values({
      id,
      reference,
      userId: input.userId,
      quoteId: quote.id,
      pinAuthorizationId: pinAuthorization.id,
      idempotencyKey: input.idempotencyKey,
      senderAccountId: quote.senderAccountId,
      recipientAccountId: quote.recipientAccountId,
      sourceAmountMinor: quote.sourceAmountMinor,
      sourceCurrency: quote.sourceCurrency,
      recipientAmountMinor: quote.recipientAmountMinor,
      recipientCurrency: quote.recipientCurrency,
      exchangeRate: quote.exchangeRate,
      rateDate: quote.rateDate,
      rateTimestamp: quote.rateTimestamp,
      rateProvider: quote.rateProvider,
      status: "pending",
      requestedAt: timestamp,
    }).run();
    tx.update(transferQuotes).set({ expiresAt: requestExpiresAt }).where(and(eq(transferQuotes.id, quote.id), isNull(transferQuotes.consumedAt))).run();
    tx.update(transferPinAuthorizations).set({ expiresAt: requestExpiresAt }).where(and(eq(transferPinAuthorizations.id, pinAuthorization.id), isNull(transferPinAuthorizations.consumedAt))).run();
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: input.userId, actorLabel: input.actorLabel, action: "transaction_authorization.request", target: reference, result: "success", metadataJson: JSON.stringify({ requestId: id, quoteId: quote.id }), timestamp }).run();
    const customer = tx.select().from(users).where(eq(users.id, input.userId)).get();
    if (customer) persistUserEvent(tx, {
      userId: customer.id,
      email: customer.email,
      displayName: customer.name,
      locale: customer.locale,
      kind: "security",
      title: "Transaction authorization requested",
      message: "Your transfer is awaiting a transaction authorization code from an administrator.",
      emailEvent: "transaction_pending",
      eventKey: `${reference}:requested`,
      publicReference: reference,
      emailSummary: "Your transfer is awaiting a transaction authorization code from an administrator.",
      important: true,
      createdAt: timestamp,
    });
    return { requestId: id, reference, status: "pending" as const };
  }, { behavior: "immediate" });
}

export function issueTransactionAuthorizationCode(input: {
  actorId: string;
  actorLabel: string;
  actorRole: AdminRole | null;
  requestId: string;
  mode: "issue" | "reissue";
  now?: Date;
}) {
  if (!hasPermission(input.actorRole, "transactions.authorize")) throw new TransactionAuthorizationError("Transaction authorization is not permitted.");
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const expiresAt = new Date(now.getTime() + codeTtlMs).toISOString();
  const code = generateCode();
  const codeHash = hashSync(code, hashOptions);

  return db.transaction((tx) => {
    const record = tx.select({ request: transactionAuthorizationRequests, user: users }).from(transactionAuthorizationRequests).innerJoin(users, eq(transactionAuthorizationRequests.userId, users.id)).where(eq(transactionAuthorizationRequests.id, input.requestId)).get();
    if (!record || (record.request.status !== "pending" && record.request.status !== "code_issued")) throw new TransactionAuthorizationError("This transaction authorization request is no longer available.");
    const active = tx.select().from(transactionAuthorizationCodes).where(and(eq(transactionAuthorizationCodes.requestId, input.requestId), eq(transactionAuthorizationCodes.status, "issued"), gt(transactionAuthorizationCodes.expiresAt, timestamp))).orderBy(desc(transactionAuthorizationCodes.issuedAt)).get();
    if (active && input.mode === "issue") throw new TransactionAuthorizationError("An active transaction authorization code is already issued.");
    if (active) tx.update(transactionAuthorizationCodes).set({ status: "revoked", revokedAt: timestamp, revokedBy: input.actorId }).where(eq(transactionAuthorizationCodes.id, active.id)).run();
    tx.update(transactionAuthorizationCodes).set({ status: "expired" }).where(and(eq(transactionAuthorizationCodes.requestId, input.requestId), eq(transactionAuthorizationCodes.status, "issued"))).run();

    const codeId = randomUUID();
    tx.insert(transactionAuthorizationCodes).values({ id: codeId, requestId: record.request.id, userId: record.user.id, codeHash, status: "issued", issuedBy: input.actorId, issuedAt: timestamp, expiresAt }).run();
    tx.update(transactionAuthorizationRequests).set({ status: "code_issued" }).where(eq(transactionAuthorizationRequests.id, record.request.id)).run();
    persistUserEvent(tx, {
      userId: record.user.id,
      email: record.user.email,
      displayName: record.user.name,
      locale: record.user.locale,
      kind: "security",
      title: "Transaction authorization code issued",
      message: "Your transaction authorization code was issued and sent to your verified email. It expires in 15 minutes.",
      emailEvent: "security_alert",
      eventKey: `${record.request.reference}:code:${codeId}`,
      publicReference: record.request.reference,
      emailSummary: `Your transaction authorization code is ${code}. It expires in 15 minutes.`,
      important: true,
      createdAt: timestamp,
    });
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: input.actorId, actorLabel: input.actorLabel, action: "transaction_authorization.code_issued", target: record.request.reference, result: "success", metadataJson: JSON.stringify({ requestId: record.request.id, codeId, mode: input.mode, expiresAt }), timestamp }).run();
    return { code, expiresAt, requestReference: record.request.reference };
  }, { behavior: "immediate" });
}

export async function verifyTransactionAuthorizationCode(input: {
  userId: string;
  actorLabel: string;
  requestId: string;
  code: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const normalized = normalizeCode(input.code);
  if (!codePattern.test(normalized)) throw new TransactionAuthorizationError("Enter a valid transaction authorization code.");
  const limiterKey = `${input.requestId}:${input.userId}`;
  if (!consumeAuthRateLimit("transaction_authorization", limiterKey, now.getTime())) throw new TransactionAuthorizationError("Too many incorrect code attempts. Try again shortly.");

  const verification = db.transaction((tx) => {
    const request = tx.select().from(transactionAuthorizationRequests).where(and(eq(transactionAuthorizationRequests.id, input.requestId), eq(transactionAuthorizationRequests.userId, input.userId), eq(transactionAuthorizationRequests.status, "code_issued"))).get();
    if (!request) throw new TransactionAuthorizationError("This transaction authorization request is invalid or unavailable.");
    const issued = tx.select().from(transactionAuthorizationCodes).where(and(eq(transactionAuthorizationCodes.requestId, request.id), eq(transactionAuthorizationCodes.userId, input.userId), eq(transactionAuthorizationCodes.status, "issued"))).orderBy(desc(transactionAuthorizationCodes.issuedAt)).get();
    const verified = tx.select().from(transactionAuthorizationCodes).where(and(eq(transactionAuthorizationCodes.requestId, request.id), eq(transactionAuthorizationCodes.userId, input.userId), eq(transactionAuthorizationCodes.status, "verified"))).orderBy(desc(transactionAuthorizationCodes.issuedAt)).get();
    if (!issued && verified) return { request, alreadyVerified: true as const };
    if (!issued) throw new TransactionAuthorizationError("Transaction authorization code is not available. Contact Customer Service.");
    if (new Date(issued.expiresAt).getTime() <= now.getTime()) {
      tx.update(transactionAuthorizationCodes).set({ status: "expired" }).where(eq(transactionAuthorizationCodes.id, issued.id)).run();
      tx.insert(transactionAuthorizationAttempts).values({ id: randomUUID(), requestId: request.id, userId: input.userId, codeId: issued.id, outcome: "expired", reason: "expired", createdAt: timestamp }).run();
      tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: input.userId, actorLabel: input.actorLabel, action: "transaction_authorization.code_expired", target: request.reference, result: "denied", metadataJson: JSON.stringify({ requestId: request.id, codeId: issued.id }), timestamp }).run();
      return { error: "Transaction authorization code expired. Request a new code." };
    }
    if (issued.lockedUntil && new Date(issued.lockedUntil).getTime() > now.getTime()) {
      tx.insert(transactionAuthorizationAttempts).values({ id: randomUUID(), requestId: request.id, userId: input.userId, codeId: issued.id, outcome: "blocked", reason: "locked", createdAt: timestamp }).run();
      return { error: "Too many incorrect code attempts. Try again shortly." };
    }
    if (!verifySync(issued.codeHash, normalized)) {
      const failedAttempts = issued.failedAttempts + 1;
      const lockedUntil = failedAttempts >= maxCodeFailures ? new Date(now.getTime() + lockoutMs).toISOString() : null;
      tx.update(transactionAuthorizationCodes).set({ failedAttempts, lockedUntil, lastFailedAt: timestamp }).where(eq(transactionAuthorizationCodes.id, issued.id)).run();
      tx.insert(transactionAuthorizationAttempts).values({ id: randomUUID(), requestId: request.id, userId: input.userId, codeId: issued.id, outcome: "failure", reason: "incorrect", createdAt: timestamp }).run();
      tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: input.userId, actorLabel: input.actorLabel, action: "transaction_authorization.verify_failed", target: request.reference, result: "denied", metadataJson: JSON.stringify({ requestId: request.id, codeId: issued.id, failedAttempts: String(failedAttempts), locked: lockedUntil ? "true" : "false" }), timestamp }).run();
      return { error: lockedUntil ? "Too many incorrect code attempts. Try again shortly." : "The transaction authorization code is invalid or expired." };
    }
    const claimed = tx.update(transactionAuthorizationCodes).set({ status: "verified", verifiedAt: timestamp, lockedUntil: null }).where(and(eq(transactionAuthorizationCodes.id, issued.id), eq(transactionAuthorizationCodes.status, "issued"), gt(transactionAuthorizationCodes.expiresAt, timestamp))).run();
    if (claimed.changes !== 1) throw new TransactionAuthorizationError("The transaction authorization code is invalid or expired.");
    tx.insert(transactionAuthorizationAttempts).values({ id: randomUUID(), requestId: request.id, userId: input.userId, codeId: issued.id, outcome: "success", reason: "verified", createdAt: timestamp }).run();
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: input.userId, actorLabel: input.actorLabel, action: "transaction_authorization.verified", target: request.reference, result: "success", metadataJson: JSON.stringify({ requestId: request.id, codeId: issued.id }), timestamp }).run();
    return { request, alreadyVerified: false as const };
  }, { behavior: "immediate" });

  if ("error" in verification) throw new TransactionAuthorizationError(verification.error);
  await clearAuthRateLimit("transaction_authorization", limiterKey);
  const transferReference = transferBetweenUsers({ userId: input.userId, actorLabel: input.actorLabel, quoteId: verification.request.quoteId, idempotencyKey: verification.request.idempotencyKey, authorizationRequestId: verification.request.id });
  return { transferReference, requestReference: verification.request.reference };
}