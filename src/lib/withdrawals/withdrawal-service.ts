import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { accounts, auditEvents, bankDestinations, emailOutbox, notifications, users, withdrawalRequests } from "@/lib/db/schema";
import type { AdminRole, Currency, WithdrawalRequestStatus } from "@/lib/domain";
import { userUi } from "@/lib/i18n/user-ui";

export class WithdrawalError extends Error {}
export type WithdrawalSupportDetails = { reference: string; amountMinor: number; currency: Currency; bankName: string; accountName: string; maskedAccountNumber: string };

const idempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

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
    tx.insert(withdrawalRequests).values({ id, reference, idempotencyKey: input.idempotencyKey, userId: input.userId, accountId: owner.account.id, destinationId: destination.id, destinationBankName: destination.bankName, destinationAccountName: destination.accountName, destinationAccountNumber: destination.accountNumber, amountMinor: input.amountMinor, currency: input.currency, status: "pending", submittedAt: now, updatedAt: now }).run();
    tx.insert(notifications).values({ id: randomUUID(), userId: input.userId, kind: "transaction", title: "Withdrawal request received", message: "Please contact Nivora Core Customer Service to complete this transaction.", eventReference: reference, important: true, createdAt: now }).run();
    tx.insert(emailOutbox).values({ id: randomUUID(), recipient: owner.user.email, event: "transaction_pending", eventReference: `${reference}:submitted`, payloadJson: JSON.stringify({ to: owner.user.email, locale: owner.user.locale, event: "transaction_pending", eventReference: reference, displayName: owner.user.name, summary: t.notifications.messageWithdrawalService }), status: "pending", createdAt: now }).run();
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: input.userId, actorLabel: input.actorLabel, action: "withdrawal_request.create", target: reference, result: "success", metadataJson: JSON.stringify({ requestId: id, accountId: owner.account.id, destinationId: destination.id, amountMinor: String(input.amountMinor), currency: input.currency, balanceChanged: "false" }), timestamp: now }).run();
    return reference;
  }, { behavior: "immediate" });
}

export function getWithdrawalSupportDetailsForUser(reference: string, userId: string): WithdrawalSupportDetails {
  const request = db.select().from(withdrawalRequests).where(and(eq(withdrawalRequests.reference, reference), eq(withdrawalRequests.userId, userId))).get();
  if (!request || !request.destinationBankName || !request.destinationAccountName || !request.destinationAccountNumber) throw new WithdrawalError("The withdrawal support details are unavailable.");
  return { reference: request.reference, amountMinor: request.amountMinor, currency: request.currency, bankName: request.destinationBankName, accountName: request.destinationAccountName, maskedAccountNumber: `****${request.destinationAccountNumber.slice(-4)}` };
}

export function reviewWithdrawalRequest(input: { actorId: string; actorLabel: string; actorRole: AdminRole | null; requestId: string; decision: Extract<WithdrawalRequestStatus, "completed" | "rejected">; rejectionReason?: string }): void {
  if (!hasPermission(input.actorRole, "withdrawals.review")) throw new WithdrawalError("Withdrawal review is not permitted.");
  const reason = input.rejectionReason?.trim();
  if (input.decision === "rejected" && (!reason || reason.length < 3 || reason.length > 240)) throw new WithdrawalError("Provide a valid rejection reason.");

  db.transaction((tx) => {
    const record = tx.select({ request: withdrawalRequests, account: accounts, user: users }).from(withdrawalRequests).innerJoin(accounts, eq(withdrawalRequests.accountId, accounts.id)).innerJoin(users, eq(withdrawalRequests.userId, users.id)).where(eq(withdrawalRequests.id, input.requestId)).get();
    if (!record || record.request.status !== "pending" || record.account.userId !== record.user.id) throw new WithdrawalError("This withdrawal request is no longer available for review.");
    if (record.user.id === input.actorId) throw new WithdrawalError("Administrators cannot review their own withdrawal requests.");
    const now = new Date().toISOString();
    const update = tx.update(withdrawalRequests).set({ status: input.decision, rejectionReason: input.decision === "rejected" ? reason : null, reviewedBy: input.actorId, reviewedAt: now, updatedAt: now }).where(and(eq(withdrawalRequests.id, record.request.id), eq(withdrawalRequests.status, "pending"))).run();
    if (update.changes !== 1) throw new WithdrawalError("This withdrawal request was already reviewed.");
    const completed = input.decision === "completed";
    const t = userUi(record.user.locale);
    tx.insert(notifications).values({ id: randomUUID(), userId: record.user.id, kind: "transaction", title: `Withdrawal request ${input.decision}`, message: completed ? "Customer Service marked your withdrawal request as completed. No balance was changed by Nivora Core." : "Your withdrawal request was rejected. Open Nivora Core to review its status.", eventReference: `${record.request.reference}:${input.decision}`, important: true, createdAt: now }).run();
    tx.insert(emailOutbox).values({ id: randomUUID(), recipient: record.user.email, event: completed ? "transaction_completed" : "transaction_failed", eventReference: `${record.request.reference}:${input.decision}`, payloadJson: JSON.stringify({ to: record.user.email, locale: record.user.locale, event: completed ? "transaction_completed" : "transaction_failed", eventReference: record.request.reference, displayName: record.user.name, summary: completed ? t.notifications.messageWithdrawalCompleted : t.notifications.messageWithdrawalRejected }), status: "pending", createdAt: now }).run();
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: input.actorId, actorLabel: input.actorLabel, action: `withdrawal_request.${input.decision}`, target: record.request.reference, result: "success", metadataJson: JSON.stringify({ requestId: record.request.id, userId: record.user.id, accountId: record.account.id, balanceChanged: "false" }), timestamp: now }).run();
  }, { behavior: "immediate" });
}

export function cancelOwnedWithdrawalRequest(input: { userId: string; actorLabel: string; requestId: string }): void {
  db.transaction((tx) => {
    const record = tx.select().from(withdrawalRequests).where(and(eq(withdrawalRequests.id, input.requestId), eq(withdrawalRequests.userId, input.userId), eq(withdrawalRequests.status, "pending"))).get();
    if (!record) throw new WithdrawalError("This withdrawal request cannot be cancelled.");
    const now = new Date().toISOString();
    const update = tx.update(withdrawalRequests).set({ status: "cancelled", updatedAt: now }).where(and(eq(withdrawalRequests.id, record.id), eq(withdrawalRequests.userId, input.userId), eq(withdrawalRequests.status, "pending"))).run();
    if (update.changes !== 1) throw new WithdrawalError("This withdrawal request cannot be cancelled.");
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: input.userId, actorLabel: input.actorLabel, action: "withdrawal_request.cancelled", target: record.reference, result: "success", metadataJson: JSON.stringify({ requestId: record.id, accountId: record.accountId, balanceChanged: "false" }), timestamp: now }).run();
  }, { behavior: "immediate" });
}
