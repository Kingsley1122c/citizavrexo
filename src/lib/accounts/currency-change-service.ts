import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { hasPermission } from "@/lib/auth/permissions";
import { isSupportedCurrency, type Currency } from "@/lib/currency";
import { db } from "@/lib/db/client";
import { accounts, auditEvents, cardRequests, cards, currencyChangeRequests, emailOutbox, notifications, users, withdrawalRequests } from "@/lib/db/schema";
import type { AdminRole } from "@/lib/domain";
import { financialEventCopy } from "@/lib/i18n/financial-events";

export class CurrencyChangeError extends Error {}

function assertFinanciallyClean(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], accountId: string): void {
  const account = tx.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account || account.status !== "active") throw new CurrencyChangeError("The account is not available for a currency change.");
  if (account.balanceMinor !== 0) throw new CurrencyChangeError("The account balance must be zero before its currency can change.");
  if (tx.select({ id: withdrawalRequests.id }).from(withdrawalRequests).where(and(eq(withdrawalRequests.accountId, accountId), eq(withdrawalRequests.status, "pending"))).get()) throw new CurrencyChangeError("Complete or cancel the pending withdrawal before changing currency.");
  if (tx.select({ id: cards.id }).from(cards).where(and(eq(cards.accountId, accountId), inArray(cards.status, ["active", "frozen"]))).get()) throw new CurrencyChangeError("Close every active or frozen card before changing currency.");
  if (tx.select({ id: cardRequests.id }).from(cardRequests).where(and(eq(cardRequests.accountId, accountId), eq(cardRequests.status, "pending"))).get()) throw new CurrencyChangeError("Complete or cancel the pending card request before changing currency.");
}

export function requestCurrencyChange(input: { userId: string; actorLabel: string; accountId: string; requestedCurrency: Currency; reason?: string }): string {
  if (!isSupportedCurrency(input.requestedCurrency)) throw new CurrencyChangeError("Select a supported account currency.");
  const reason = input.reason?.trim();
  if (reason && reason.length > 240) throw new CurrencyChangeError("The currency-change reason is too long.");
  return db.transaction((tx) => {
    const account = tx.select().from(accounts).where(and(eq(accounts.id, input.accountId), eq(accounts.userId, input.userId))).get();
    if (!account) throw new CurrencyChangeError("The account is not available for a currency change.");
    if (account.currency === input.requestedCurrency) throw new CurrencyChangeError("Choose a different account currency.");
    assertFinanciallyClean(tx, account.id);
    if (tx.select({ id: currencyChangeRequests.id }).from(currencyChangeRequests).where(and(eq(currencyChangeRequests.accountId, account.id), eq(currencyChangeRequests.status, "pending"))).get()) throw new CurrencyChangeError("A currency-change request is already pending.");
    const now = new Date().toISOString();
    const id = randomUUID();
    tx.insert(currencyChangeRequests).values({ id, accountId: account.id, userId: input.userId, currentCurrency: account.currency, requestedCurrency: input.requestedCurrency, reason, status: "pending", requestedAt: now, updatedAt: now }).run();
    tx.insert(notifications).values({ id: randomUUID(), userId: input.userId, kind: "system", title: "Currency change requested", message: `Your request to change this account from ${account.currency} to ${input.requestedCurrency} is pending review.`, eventReference: `CURRENCY-${id}:submitted`, important: true, createdAt: now }).run();
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: input.userId, actorLabel: input.actorLabel, action: "currency_change.requested", target: id, result: "success", metadataJson: JSON.stringify({ accountId: account.id, currentCurrency: account.currency, requestedCurrency: input.requestedCurrency, balanceChanged: "false" }), timestamp: now }).run();
    return id;
  }, { behavior: "immediate" });
}

export function reviewCurrencyChange(input: { actorId: string; actorLabel: string; actorRole: AdminRole | null; requestId: string; decision: "approved" | "rejected"; rejectionReason?: string }): void {
  if (!hasPermission(input.actorRole, "accounts.currency.review")) throw new CurrencyChangeError("Currency-change review is not permitted.");
  const reason = input.rejectionReason?.trim();
  if (input.decision === "rejected" && (!reason || reason.length < 3 || reason.length > 240)) throw new CurrencyChangeError("Provide a valid rejection reason.");
  db.transaction((tx) => {
    const record = tx.select({ request: currencyChangeRequests, account: accounts, user: users }).from(currencyChangeRequests).innerJoin(accounts, eq(currencyChangeRequests.accountId, accounts.id)).innerJoin(users, eq(currencyChangeRequests.userId, users.id)).where(eq(currencyChangeRequests.id, input.requestId)).get();
    if (!record || record.request.status !== "pending" || record.user.status !== "active" || record.user.deletedAt || record.account.userId !== record.user.id || record.account.currency !== record.request.currentCurrency) throw new CurrencyChangeError("This currency-change request is no longer available for review.");
    if (record.user.id === input.actorId) throw new CurrencyChangeError("Administrators cannot review their own currency-change requests.");
    if (input.decision === "approved") assertFinanciallyClean(tx, record.account.id);
    const now = new Date().toISOString();
    const updated = tx.update(currencyChangeRequests).set({ status: input.decision, reviewedBy: input.actorId, reviewedAt: now, rejectionReason: input.decision === "rejected" ? reason : null, updatedAt: now }).where(and(eq(currencyChangeRequests.id, record.request.id), eq(currencyChangeRequests.status, "pending"))).run();
    if (updated.changes !== 1) throw new CurrencyChangeError("This currency-change request was already reviewed.");
    if (input.decision === "approved") {
      const changed = tx.update(accounts).set({ currency: record.request.requestedCurrency, updatedAt: now }).where(and(eq(accounts.id, record.account.id), eq(accounts.currency, record.request.currentCurrency), eq(accounts.balanceMinor, 0))).run();
      if (changed.changes !== 1) throw new CurrencyChangeError("The account changed during review. No currency change was made.");
    }
    const approved = input.decision === "approved";
    const eventCopy = financialEventCopy(record.user.locale);
    const summary = approved ? eventCopy.currencyApproved(record.request.requestedCurrency) : eventCopy.currencyRejected(reason);
    const title = approved ? eventCopy.currencyApprovedTitle : eventCopy.currencyRejectedTitle;
    tx.insert(notifications).values({ id: randomUUID(), userId: record.user.id, kind: "system", title, message: summary, eventReference: `CURRENCY-${record.request.id}:${input.decision}`, important: true, createdAt: now }).run();
    tx.insert(emailOutbox).values({ id: randomUUID(), recipient: record.user.email, event: "important_account_notification", eventReference: `CURRENCY-${record.request.id}:${input.decision}`, payloadJson: JSON.stringify({ to: record.user.email, locale: record.user.locale, event: "important_account_notification", eventReference: record.request.id, displayName: record.user.name, summary }), status: "pending", createdAt: now }).run();
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: input.actorId, actorLabel: input.actorLabel, action: `currency_change.${input.decision}`, target: record.request.id, result: "success", metadataJson: JSON.stringify({ accountId: record.account.id, previousCurrency: record.request.currentCurrency, requestedCurrency: record.request.requestedCurrency, balanceChanged: "false", historicalTransactionsChanged: "false" }), timestamp: now }).run();
  }, { behavior: "immediate" });
}