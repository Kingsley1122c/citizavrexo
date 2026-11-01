import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { hashSync, verifySync } from "@node-rs/argon2";
import { clearAuthRateLimit, consumeAuthRateLimit } from "@/lib/auth/rate-limit-service";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import {
  accounts,
  auditEvents,
  bankDestinations,
  credentials,
  emailOutbox,
  notifications,
  users,
  withdrawalAuthorizationAttempts,
  withdrawalAuthorizationCodes,
  withdrawalRequests,
} from "@/lib/db/schema";
import type {
  AdminRole,
  Currency,
  WithdrawalAuthorizationCodeStage,
  WithdrawalAuthorizationCodeStatus,
  WithdrawalRequestStatus,
} from "@/lib/domain";
import { userUi } from "@/lib/i18n/user-ui";
import { assertTransactionPin, verifyTransactionPinForUser } from "@/lib/security/transaction-pin-service";

export class WithdrawalError extends Error {}
export type WithdrawalSupportDetails = { reference: string; amountMinor: number; currency: Currency; bankName: string; accountName: string; maskedAccountNumber: string };
export type WithdrawalAuthorizationIssueResult = { stage: WithdrawalAuthorizationCodeStage; code: string; expiresAt: string; requestReference: string };
export type WithdrawalAuthorizationVerifyResult = { nextStage: "awaiting_swift_code" | "authorized"; authorizationCompleted: boolean; requestReference: string };

const idempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const codePattern = /^[A-Z0-9-]{8,32}$/;
const codeHashOptions = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const maxCodeFailures = 5;
const lockoutMs = 10 * 60 * 1000;
const codeTtlMs = 15 * 60 * 1000;

const hashAuthorizationCode = (code: string) => hashSync(code, codeHashOptions);
const verifyAuthorizationCodeHash = (hash: string, code: string) => verifySync(hash, code);
const stageLabel = (stage: WithdrawalAuthorizationCodeStage) => stage === "withdrawal_code" ? "withdrawal code" : "SWIFT authorization code";

const normalizeCode = (value: string): string => value.trim().toUpperCase();

const generateAuthorizationCode = (stage: WithdrawalAuthorizationCodeStage): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  let body = "";
  for (const byte of bytes) body += alphabet[byte % alphabet.length];
  const prefix = stage === "withdrawal_code" ? "WDR" : "SWA";
  return `${prefix}-${body.slice(0, 5)}-${body.slice(5, 10)}`;
};

const requireAuthorizationStage = (
  currentStage: "awaiting_withdrawal_code" | "awaiting_swift_code" | "authorized",
  expectedCodeStage: WithdrawalAuthorizationCodeStage,
): void => {
  const expectedStage = expectedCodeStage === "withdrawal_code" ? "awaiting_withdrawal_code" : "awaiting_swift_code";
  if (currentStage !== expectedStage) throw new WithdrawalError("This authorization step is not currently available.");
};

const appendAudit = (
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: { actorId?: string; actorLabel: string; action: string; target: string; result: "success" | "denied" | "failed"; metadata: Record<string, string> },
): void => {
  tx.insert(auditEvents).values({
    id: `AUD-${randomUUID()}`,
    actorId: input.actorId,
    actorLabel: input.actorLabel,
    action: input.action,
    target: input.target,
    result: input.result,
    metadataJson: JSON.stringify(input.metadata),
    timestamp: new Date().toISOString(),
  }).run();
};

export function createWithdrawalRequest(input: { userId: string; actorLabel: string; accountId: string; destinationId: string; amountMinor: number; currency: Currency; idempotencyKey: string }): string {
  if (!idempotencyPattern.test(input.idempotencyKey)) throw new WithdrawalError("A valid withdrawal key is required.");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new WithdrawalError("Enter a valid amount greater than zero.");

  return db.transaction((tx) => {
    const existing = tx.select().from(withdrawalRequests).where(eq(withdrawalRequests.idempotencyKey, input.idempotencyKey)).get();
    if (existing) {
      const identical = existing.userId === input.userId && existing.accountId === input.accountId && existing.destinationId === input.destinationId && existing.amountMinor === input.amountMinor && existing.currency === input.currency;
      if (!identical) throw new WithdrawalError("This withdrawal key was already used for different details.");
      return existing.reference;
    }
    const owner = tx.select({ account: accounts, user: users }).from(accounts).innerJoin(users, eq(accounts.userId, users.id)).where(and(eq(accounts.id, input.accountId), eq(accounts.userId, input.userId))).get();
    if (!owner || owner.user.status !== "active" || owner.user.deletedAt) throw new WithdrawalError("The selected account is not available.");
    const credential = tx.select({ transactionPinHash: credentials.transactionPinHash }).from(credentials).where(eq(credentials.userId, input.userId)).get();
    if (!credential?.transactionPinHash) throw new WithdrawalError("Set up a transaction PIN in Security before requesting withdrawals.");
    if (owner.account.status !== "active") throw new WithdrawalError("The selected account must be active.");
    if (owner.account.currency !== input.currency) throw new WithdrawalError("The selected account currency changed.");
    const destination = tx.select().from(bankDestinations).where(and(eq(bankDestinations.id, input.destinationId), eq(bankDestinations.userId, input.userId))).get();
    if (!destination) throw new WithdrawalError("The selected bank destination is not available.");
    if (destination.currency !== input.currency) throw new WithdrawalError("The bank destination uses a different currency.");
    if (owner.account.balanceMinor < input.amountMinor) throw new WithdrawalError("The requested amount exceeds the available balance.");
    const pending = tx.select({ id: withdrawalRequests.id }).from(withdrawalRequests).where(and(eq(withdrawalRequests.accountId, owner.account.id), eq(withdrawalRequests.status, "pending"))).get();
    if (pending) throw new WithdrawalError("A withdrawal request is already pending for this account.");

    const now = new Date().toISOString();
    const id = randomUUID();
    const reference = `NVW-${randomUUID()}`;
    const t = userUi(owner.user.locale);
    tx.insert(withdrawalRequests).values({
      id,
      reference,
      idempotencyKey: input.idempotencyKey,
      userId: input.userId,
      accountId: owner.account.id,
      destinationId: destination.id,
      destinationBankName: destination.bankName,
      destinationAccountName: destination.accountName,
      destinationAccountNumber: destination.accountNumber,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: "pending",
      authorizationStage: "awaiting_withdrawal_code",
      pinVerifiedAt: now,
      submittedAt: now,
      updatedAt: now,
    }).run();
    tx.insert(notifications).values({
      id: randomUUID(),
      userId: input.userId,
      kind: "security",
      title: "Withdrawal authorization required",
      message: "Additional withdrawal authorization is required. Enter the internal withdrawal code issued by Customer Service to continue.",
      eventReference: `${reference}:authorization_required`,
      important: true,
      createdAt: now,
    }).run();
    tx.insert(emailOutbox).values({
      id: randomUUID(),
      recipient: owner.user.email,
      event: "security_alert",
      eventReference: `${reference}:authorization_required`,
      payloadJson: JSON.stringify({
        to: owner.user.email,
        locale: owner.user.locale,
        event: "security_alert",
        eventReference: reference,
        displayName: owner.user.name,
        summary: t.notifications.messageWithdrawalService,
      }),
      status: "pending",
      createdAt: now,
    }).run();
    appendAudit(tx, {
      actorId: input.userId,
      actorLabel: input.actorLabel,
      action: "withdrawal_request.create",
      target: reference,
      result: "success",
      metadata: {
        requestId: id,
        accountId: owner.account.id,
        destinationId: destination.id,
        amountMinor: String(input.amountMinor),
        currency: input.currency,
        authorizationStage: "awaiting_withdrawal_code",
        balanceChanged: "false",
      },
    });
    return reference;
  }, { behavior: "immediate" });
}

export async function issueWithdrawalAuthorizationCode(input: {
  actorId: string;
  actorLabel: string;
  actorRole: AdminRole | null;
  requestId: string;
  stage: WithdrawalAuthorizationCodeStage;
  mode: "issue" | "reissue";
}): Promise<WithdrawalAuthorizationIssueResult> {
  if (!hasPermission(input.actorRole, "withdrawals.review")) throw new WithdrawalError("Withdrawal review is not permitted.");

  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + codeTtlMs).toISOString();
  const code = generateAuthorizationCode(input.stage);
  const codeHash = hashAuthorizationCode(code);

  return db.transaction((tx) => {
    const requestRecord = tx
      .select({ request: withdrawalRequests, user: users })
      .from(withdrawalRequests)
      .innerJoin(users, eq(withdrawalRequests.userId, users.id))
      .where(eq(withdrawalRequests.id, input.requestId))
      .get();
    if (!requestRecord || requestRecord.request.status !== "pending") throw new WithdrawalError("This withdrawal request is no longer available.");

    requireAuthorizationStage(requestRecord.request.authorizationStage, input.stage);

    const existingIssued = tx.select().from(withdrawalAuthorizationCodes).where(and(
      eq(withdrawalAuthorizationCodes.withdrawalRequestId, input.requestId),
      eq(withdrawalAuthorizationCodes.stage, input.stage),
      eq(withdrawalAuthorizationCodes.status, "issued"),
    )).orderBy(desc(withdrawalAuthorizationCodes.issuedAt)).get();

    if (existingIssued && new Date(existingIssued.expiresAt).getTime() <= now.getTime()) {
      tx.update(withdrawalAuthorizationCodes)
        .set({ status: "expired" })
        .where(eq(withdrawalAuthorizationCodes.id, existingIssued.id))
        .run();
      appendAudit(tx, {
        actorLabel: "system",
        action: "withdrawal_authorization.code_expired",
        target: requestRecord.request.reference,
        result: "success",
        metadata: { requestId: requestRecord.request.id, codeId: existingIssued.id, stage: input.stage },
      });
    }

    const activeIssued = tx.select().from(withdrawalAuthorizationCodes).where(and(
      eq(withdrawalAuthorizationCodes.withdrawalRequestId, input.requestId),
      eq(withdrawalAuthorizationCodes.stage, input.stage),
      eq(withdrawalAuthorizationCodes.status, "issued"),
      gt(withdrawalAuthorizationCodes.expiresAt, nowIso),
    )).get();

    if (activeIssued && input.mode === "issue") {
      throw new WithdrawalError(`An active ${stageLabel(input.stage)} is already issued.`);
    }

    if (activeIssued && input.mode === "reissue") {
      tx.update(withdrawalAuthorizationCodes)
        .set({ status: "revoked", revokedAt: nowIso, revokedBy: input.actorId })
        .where(eq(withdrawalAuthorizationCodes.id, activeIssued.id))
        .run();
      appendAudit(tx, {
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        action: "withdrawal_authorization.code_revoked",
        target: requestRecord.request.reference,
        result: "success",
        metadata: {
          requestId: requestRecord.request.id,
          codeId: activeIssued.id,
          stage: input.stage,
          reason: "reissue",
        },
      });
    }

    const codeId = randomUUID();
    tx.insert(withdrawalAuthorizationCodes).values({
      id: codeId,
      withdrawalRequestId: requestRecord.request.id,
      userId: requestRecord.request.userId,
      stage: input.stage,
      codeHash,
      status: "issued",
      issuedBy: input.actorId,
      issuedAt: nowIso,
      expiresAt,
      failedAttempts: 0,
    }).run();

    tx.insert(notifications).values({
      id: randomUUID(),
      userId: requestRecord.request.userId,
      kind: "security",
      title: input.stage === "withdrawal_code" ? "Withdrawal code issued" : "SWIFT authorization code issued",
      message: input.stage === "withdrawal_code"
        ? "Your internal withdrawal code has been issued by Customer Service. Enter it to continue authorization."
        : "Your internal SWIFT authorization code has been issued by Customer Service. Enter it to complete authorization.",
      eventReference: `${requestRecord.request.reference}:${input.stage}:issued:${codeId}`,
      important: true,
      createdAt: nowIso,
    }).run();

    appendAudit(tx, {
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      action: "withdrawal_authorization.code_issued",
      target: requestRecord.request.reference,
      result: "success",
      metadata: {
        requestId: requestRecord.request.id,
        codeId,
        stage: input.stage,
        mode: input.mode,
        expiresAt,
      },
    });

    return { stage: input.stage, code, expiresAt, requestReference: requestRecord.request.reference };
  }, { behavior: "immediate" });
}

export function revokeWithdrawalAuthorizationCode(input: {
  actorId: string;
  actorLabel: string;
  actorRole: AdminRole | null;
  requestId: string;
  stage: WithdrawalAuthorizationCodeStage;
  reason?: string;
}): void {
  if (!hasPermission(input.actorRole, "withdrawals.review")) throw new WithdrawalError("Withdrawal review is not permitted.");

  const nowIso = new Date().toISOString();
  db.transaction((tx) => {
    const requestRecord = tx.select().from(withdrawalRequests).where(eq(withdrawalRequests.id, input.requestId)).get();
    if (!requestRecord || requestRecord.status !== "pending") throw new WithdrawalError("This withdrawal request is no longer available.");

    const issued = tx.select().from(withdrawalAuthorizationCodes).where(and(
      eq(withdrawalAuthorizationCodes.withdrawalRequestId, input.requestId),
      eq(withdrawalAuthorizationCodes.stage, input.stage),
      eq(withdrawalAuthorizationCodes.status, "issued"),
    )).orderBy(desc(withdrawalAuthorizationCodes.issuedAt)).get();

    if (!issued) throw new WithdrawalError(`No active ${stageLabel(input.stage)} is available to revoke.`);

    tx.update(withdrawalAuthorizationCodes)
      .set({ status: "revoked", revokedAt: nowIso, revokedBy: input.actorId })
      .where(eq(withdrawalAuthorizationCodes.id, issued.id))
      .run();

    tx.insert(notifications).values({
      id: randomUUID(),
      userId: requestRecord.userId,
      kind: "security",
      title: input.stage === "withdrawal_code" ? "Withdrawal code revoked" : "SWIFT authorization code revoked",
      message: "A previously issued authorization code was revoked. Contact Customer Service to request a replacement code.",
      eventReference: `${requestRecord.reference}:${input.stage}:revoked`,
      important: true,
      createdAt: nowIso,
    }).run();

    appendAudit(tx, {
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      action: "withdrawal_authorization.code_revoked",
      target: requestRecord.reference,
      result: "success",
      metadata: {
        requestId: requestRecord.id,
        codeId: issued.id,
        stage: input.stage,
        reason: input.reason?.trim() || "manual",
      },
    });
  }, { behavior: "immediate" });
}

export async function verifyWithdrawalAuthorizationCode(input: {
  userId: string;
  actorLabel: string;
  requestId: string;
  stage: WithdrawalAuthorizationCodeStage;
  code: string;
  now?: Date;
}): Promise<WithdrawalAuthorizationVerifyResult> {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const normalized = normalizeCode(input.code);
  if (!codePattern.test(normalized)) throw new WithdrawalError("Enter a valid authorization code.");

  const limiterKey = `${input.requestId}:${input.stage}:${input.userId}`;
  if (!consumeAuthRateLimit("withdrawal_authorization", limiterKey, now.getTime())) {
    throw new WithdrawalError("Too many incorrect code attempts. Try again shortly.");
  }

  const result = db.transaction((tx) => {
    const requestRecord = tx.select().from(withdrawalRequests).where(and(eq(withdrawalRequests.id, input.requestId), eq(withdrawalRequests.userId, input.userId), eq(withdrawalRequests.status, "pending"))).get();
    if (!requestRecord) throw new WithdrawalError("This withdrawal request is invalid or unavailable.");

    requireAuthorizationStage(requestRecord.authorizationStage, input.stage);

    const codeRecord = tx.select().from(withdrawalAuthorizationCodes).where(and(
      eq(withdrawalAuthorizationCodes.withdrawalRequestId, input.requestId),
      eq(withdrawalAuthorizationCodes.userId, input.userId),
      eq(withdrawalAuthorizationCodes.stage, input.stage),
      eq(withdrawalAuthorizationCodes.status, "issued"),
    )).orderBy(desc(withdrawalAuthorizationCodes.issuedAt)).get();

    if (!codeRecord) throw new WithdrawalError("Authorization code is not available. Contact Customer Service.");

    if (new Date(codeRecord.expiresAt).getTime() <= now.getTime()) {
      tx.update(withdrawalAuthorizationCodes).set({ status: "expired" }).where(eq(withdrawalAuthorizationCodes.id, codeRecord.id)).run();
      tx.insert(withdrawalAuthorizationAttempts).values({
        id: randomUUID(),
        withdrawalRequestId: requestRecord.id,
        userId: input.userId,
        stage: input.stage,
        codeId: codeRecord.id,
        outcome: "expired",
        reason: "expired",
        createdAt: nowIso,
      }).run();
      appendAudit(tx, {
        actorId: input.userId,
        actorLabel: input.actorLabel,
        action: "withdrawal_authorization.code_expired",
        target: requestRecord.reference,
        result: "denied",
        metadata: { requestId: requestRecord.id, codeId: codeRecord.id, stage: input.stage },
      });
      return { ok: false as const, message: "Authorization code expired. Request a new code from Customer Service." };
    }

    if (codeRecord.lockedUntil && new Date(codeRecord.lockedUntil).getTime() > now.getTime()) {
      tx.insert(withdrawalAuthorizationAttempts).values({
        id: randomUUID(),
        withdrawalRequestId: requestRecord.id,
        userId: input.userId,
        stage: input.stage,
        codeId: codeRecord.id,
        outcome: "blocked",
        reason: "locked",
        createdAt: nowIso,
      }).run();
      return { ok: false as const, message: "Too many incorrect code attempts. Try again shortly." };
    }

    const matched = verifyAuthorizationCodeHash(codeRecord.codeHash, normalized);
    if (!matched) {
      const nextFailures = codeRecord.failedAttempts + 1;
      const lockedUntil = nextFailures >= maxCodeFailures ? new Date(now.getTime() + lockoutMs).toISOString() : null;
      tx.update(withdrawalAuthorizationCodes).set({
        failedAttempts: nextFailures,
        lockedUntil,
        lastFailedAt: nowIso,
      }).where(eq(withdrawalAuthorizationCodes.id, codeRecord.id)).run();
      tx.insert(withdrawalAuthorizationAttempts).values({
        id: randomUUID(),
        withdrawalRequestId: requestRecord.id,
        userId: input.userId,
        stage: input.stage,
        codeId: codeRecord.id,
        outcome: "failure",
        reason: "incorrect",
        createdAt: nowIso,
      }).run();
      appendAudit(tx, {
        actorId: input.userId,
        actorLabel: input.actorLabel,
        action: "withdrawal_authorization.verify_failed",
        target: requestRecord.reference,
        result: "denied",
        metadata: {
          requestId: requestRecord.id,
          codeId: codeRecord.id,
          stage: input.stage,
          failedAttempts: String(nextFailures),
          locked: lockedUntil ? "true" : "false",
        },
      });
      if (lockedUntil) {
        tx.insert(notifications).values({
          id: randomUUID(),
          userId: input.userId,
          kind: "security",
          title: "Withdrawal authorization temporarily locked",
          message: "Too many incorrect authorization attempts were detected. Try again shortly or contact Customer Service.",
          eventReference: `${requestRecord.reference}:${input.stage}:locked`,
          important: true,
          createdAt: nowIso,
        }).run();
        return { ok: false as const, message: "Too many incorrect code attempts. Try again shortly." };
      }
      return { ok: false as const, message: "The authorization code is invalid or expired." };
    }

    const consumed = tx.update(withdrawalAuthorizationCodes).set({
      status: "verified",
      verifiedAt: nowIso,
      failedAttempts: codeRecord.failedAttempts,
      lockedUntil: null,
    }).where(and(
      eq(withdrawalAuthorizationCodes.id, codeRecord.id),
      eq(withdrawalAuthorizationCodes.status, "issued"),
      gt(withdrawalAuthorizationCodes.expiresAt, nowIso),
    )).run();

    if (consumed.changes !== 1) return { ok: false as const, message: "The authorization code is invalid or expired." };

    tx.insert(withdrawalAuthorizationAttempts).values({
      id: randomUUID(),
      withdrawalRequestId: requestRecord.id,
      userId: input.userId,
      stage: input.stage,
      codeId: codeRecord.id,
      outcome: "success",
      reason: "verified",
      createdAt: nowIso,
    }).run();

    const nextStage = input.stage === "withdrawal_code" ? "awaiting_swift_code" as const : "authorized" as const;
    const updatePayload: Partial<typeof withdrawalRequests.$inferInsert> = {
      authorizationStage: nextStage,
      updatedAt: nowIso,
    };
    if (nextStage === "authorized") updatePayload.authorizationCompletedAt = nowIso;
    tx.update(withdrawalRequests).set(updatePayload).where(and(eq(withdrawalRequests.id, requestRecord.id), eq(withdrawalRequests.authorizationStage, requestRecord.authorizationStage))).run();

    tx.insert(notifications).values({
      id: randomUUID(),
      userId: input.userId,
      kind: "security",
      title: nextStage === "authorized" ? "Withdrawal authorization completed" : "Withdrawal code verified",
      message: nextStage === "authorized"
        ? "Withdrawal authorization is complete. Your request remains pending administrator review and customer-service completion."
        : "Initial withdrawal verification succeeded. Enter your SWIFT authorization code to continue.",
      eventReference: `${requestRecord.reference}:${input.stage}:verified`,
      important: true,
      createdAt: nowIso,
    }).run();

    appendAudit(tx, {
      actorId: input.userId,
      actorLabel: input.actorLabel,
      action: "withdrawal_authorization.code_verified",
      target: requestRecord.reference,
      result: "success",
      metadata: {
        requestId: requestRecord.id,
        codeId: codeRecord.id,
        stage: input.stage,
        nextStage,
      },
    });

    return {
      ok: true as const,
      value: {
        nextStage,
        authorizationCompleted: nextStage === "authorized",
        requestReference: requestRecord.reference,
      },
    };
  }, { behavior: "immediate" });

  if (!result.ok) throw new WithdrawalError(result.message);

  await clearAuthRateLimit("withdrawal_authorization", limiterKey);
  return result.value;
}

export function getWithdrawalSupportDetailsForUser(reference: string, userId: string): WithdrawalSupportDetails {
  const request = db.select().from(withdrawalRequests).where(and(eq(withdrawalRequests.reference, reference), eq(withdrawalRequests.userId, userId))).get();
  if (!request || !request.destinationBankName || !request.destinationAccountName || !request.destinationAccountNumber) throw new WithdrawalError("The withdrawal support details are unavailable.");
  return { reference: request.reference, amountMinor: request.amountMinor, currency: request.currency, bankName: request.destinationBankName, accountName: request.destinationAccountName, maskedAccountNumber: `****${request.destinationAccountNumber.slice(-4)}` };
}

export async function requestWithdrawalWithPin(input: {
  userId: string;
  actorLabel: string;
  accountId: string;
  destinationId: string;
  amountMinor: number;
  currency: Currency;
  idempotencyKey: string;
  pin: string;
}): Promise<string> {
  assertTransactionPin(input.pin);
  await verifyTransactionPinForUser({ userId: input.userId, pin: input.pin, purpose: "withdrawal" });
  return createWithdrawalRequest(input);
}

export function reviewWithdrawalRequest(input: { actorId: string; actorLabel: string; actorRole: AdminRole | null; requestId: string; decision: Extract<WithdrawalRequestStatus, "completed" | "rejected">; rejectionReason?: string }): void {
  if (!hasPermission(input.actorRole, "withdrawals.review")) throw new WithdrawalError("Withdrawal review is not permitted.");
  const reason = input.rejectionReason?.trim();
  if (input.decision === "rejected" && (!reason || reason.length < 3 || reason.length > 240)) throw new WithdrawalError("Provide a valid rejection reason.");

  db.transaction((tx) => {
    const record = tx.select({ request: withdrawalRequests, account: accounts, user: users }).from(withdrawalRequests).innerJoin(accounts, eq(withdrawalRequests.accountId, accounts.id)).innerJoin(users, eq(withdrawalRequests.userId, users.id)).where(eq(withdrawalRequests.id, input.requestId)).get();
    if (!record || record.request.status !== "pending" || record.account.userId !== record.user.id) throw new WithdrawalError("This withdrawal request is no longer available for review.");
    if (record.user.id === input.actorId) throw new WithdrawalError("Administrators cannot review their own withdrawal requests.");
    if (record.request.authorizationStage !== "authorized") throw new WithdrawalError("Withdrawal authorization is not complete.");
    const now = new Date().toISOString();
    const update = tx.update(withdrawalRequests).set({ status: input.decision, rejectionReason: input.decision === "rejected" ? reason : null, reviewedBy: input.actorId, reviewedAt: now, updatedAt: now }).where(and(eq(withdrawalRequests.id, record.request.id), eq(withdrawalRequests.status, "pending"))).run();
    if (update.changes !== 1) throw new WithdrawalError("This withdrawal request was already reviewed.");
    const completed = input.decision === "completed";
    const t = userUi(record.user.locale);
    tx.insert(notifications).values({ id: randomUUID(), userId: record.user.id, kind: "transaction", title: `Withdrawal request ${input.decision}`, message: completed ? "Customer Service marked your withdrawal request as completed. No balance was changed by Nivora Core." : "Your withdrawal request was rejected. Open Nivora Core to review its status.", eventReference: `${record.request.reference}:${input.decision}`, important: true, createdAt: now }).run();
    tx.insert(emailOutbox).values({ id: randomUUID(), recipient: record.user.email, event: completed ? "transaction_completed" : "transaction_failed", eventReference: `${record.request.reference}:${input.decision}`, payloadJson: JSON.stringify({ to: record.user.email, locale: record.user.locale, event: completed ? "transaction_completed" : "transaction_failed", eventReference: record.request.reference, displayName: record.user.name, summary: completed ? t.notifications.messageWithdrawalCompleted : t.notifications.messageWithdrawalRejected }), status: "pending", createdAt: now }).run();
    appendAudit(tx, {
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      action: `withdrawal_request.${input.decision}`,
      target: record.request.reference,
      result: "success",
      metadata: { requestId: record.request.id, userId: record.user.id, accountId: record.account.id, balanceChanged: "false" },
    });
  }, { behavior: "immediate" });
}

export function cancelOwnedWithdrawalRequest(input: { userId: string; actorLabel: string; requestId: string }): void {
  db.transaction((tx) => {
    const record = tx.select().from(withdrawalRequests).where(and(eq(withdrawalRequests.id, input.requestId), eq(withdrawalRequests.userId, input.userId), eq(withdrawalRequests.status, "pending"))).get();
    if (!record) throw new WithdrawalError("This withdrawal request cannot be cancelled.");
    const now = new Date().toISOString();
    const update = tx.update(withdrawalRequests).set({ status: "cancelled", updatedAt: now }).where(and(eq(withdrawalRequests.id, record.id), eq(withdrawalRequests.userId, input.userId), eq(withdrawalRequests.status, "pending"))).run();
    if (update.changes !== 1) throw new WithdrawalError("This withdrawal request cannot be cancelled.");
    appendAudit(tx, {
      actorId: input.userId,
      actorLabel: input.actorLabel,
      action: "withdrawal_request.cancelled",
      target: record.reference,
      result: "success",
      metadata: { requestId: record.id, accountId: record.accountId, balanceChanged: "false" },
    });
  }, { behavior: "immediate" });
}

export function getWithdrawalAuthorizationStateForUser(requestId: string, userId: string) {
  const request = db.select().from(withdrawalRequests).where(and(eq(withdrawalRequests.id, requestId), eq(withdrawalRequests.userId, userId))).get();
  if (!request) throw new WithdrawalError("This withdrawal request is invalid or unavailable.");

  const codeRows = db.select().from(withdrawalAuthorizationCodes).where(eq(withdrawalAuthorizationCodes.withdrawalRequestId, requestId)).orderBy(desc(withdrawalAuthorizationCodes.issuedAt)).all();
  const latestByStage = new Map<WithdrawalAuthorizationCodeStage, (typeof codeRows)[number]>();
  for (const row of codeRows) {
    if (!latestByStage.has(row.stage)) latestByStage.set(row.stage, row);
  }

  const attempts = db.select().from(withdrawalAuthorizationAttempts).where(eq(withdrawalAuthorizationAttempts.withdrawalRequestId, requestId)).orderBy(desc(withdrawalAuthorizationAttempts.createdAt)).all();

  return {
    request,
    latestWithdrawalCode: latestByStage.get("withdrawal_code"),
    latestSwiftCode: latestByStage.get("swift_code"),
    attempts,
  };
}
