import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { hasPermission } from "@/lib/auth/permissions";
import type { AdminRole, Currency } from "@/lib/domain";
import { db } from "@/lib/db/client";
import { accounts, adminCredits, auditEvents, transactions, users } from "@/lib/db/schema";
import { userUi } from "@/lib/i18n/user-ui";
import { persistUserEvent } from "@/lib/notifications/user-event-service";
import { formatCurrency } from "@/lib/currency";
import { minorToMajor } from "@/lib/money";

export class AdminCreditError extends Error {}

export function creditUserAccount(input: { actorId: string; actorLabel: string; actorRole: AdminRole | null; accountId: string; amountMinor: number; currency: Currency; reason: string; idempotencyKey: string }): string {
  const reason = input.reason.trim();
  if (!hasPermission(input.actorRole, "accounts.credit")) throw new AdminCreditError("Account credit is not permitted.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(input.idempotencyKey)) throw new AdminCreditError("A valid operation key is required.");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new AdminCreditError("Enter a valid amount greater than zero.");
  if (reason.length < 3 || reason.length > 200 || /[\p{Cc}\p{Cf}]/u.test(reason)) throw new AdminCreditError("Enter a valid internal reason.");

  return db.transaction((tx) => {
    const existing = tx.select().from(adminCredits).where(eq(adminCredits.idempotencyKey, input.idempotencyKey)).get();
    if (existing) {
      const identical = existing.accountId === input.accountId && existing.amountMinor === input.amountMinor && existing.currency === input.currency && existing.reason === reason && existing.createdBy === input.actorId;
      if (!identical) throw new AdminCreditError("This operation key was already used for different details.");
      return existing.reference;
    }
    const actor = tx.select().from(users).where(and(eq(users.id, input.actorId), eq(users.status, "active"), isNull(users.deletedAt))).get();
    if (!actor || actor.adminRole !== input.actorRole || !hasPermission(actor.adminRole, "accounts.credit")) throw new AdminCreditError("Account credit is not permitted.");
    const target = tx.select({ account: accounts, user: users }).from(accounts).innerJoin(users, eq(accounts.userId, users.id)).where(and(eq(accounts.id, input.accountId), isNull(users.deletedAt))).get();
    if (!target || target.account.status !== "active" || target.user.status !== "active" || target.user.adminRole) throw new AdminCreditError("The selected customer account is not eligible.");
    if (target.account.currency !== input.currency) throw new AdminCreditError("The selected currency does not match the account ledger.");
    const balanceAfterMinor = target.account.balanceMinor + input.amountMinor;
    if (!Number.isSafeInteger(balanceAfterMinor)) throw new AdminCreditError("The resulting balance exceeds the supported range.");

    const now = new Date().toISOString();
    const reference = `NAC-${randomUUID()}`;
    const transactionId = randomUUID();
    const t = userUi(target.user.locale);
    const update = tx.update(accounts).set({ balanceMinor: balanceAfterMinor, updatedAt: now }).where(and(eq(accounts.id, target.account.id), eq(accounts.balanceMinor, target.account.balanceMinor), eq(accounts.status, "active"))).run();
    if (update.changes !== 1) throw new AdminCreditError("The account balance changed. Review and retry.");
    tx.insert(transactions).values({ id: transactionId, reference, idempotencyKey: input.idempotencyKey, accountId: target.account.id, type: "credit", description: "Administrative account credit", amountMinor: input.amountMinor, currency: input.currency, occurredAt: now, status: "completed", balanceBeforeMinor: target.account.balanceMinor, balanceAfterMinor, createdBy: actor.id, createdAt: now }).run();
    tx.insert(adminCredits).values({ id: randomUUID(), reference, idempotencyKey: input.idempotencyKey, userId: target.user.id, accountId: target.account.id, transactionId, amountMinor: input.amountMinor, currency: input.currency, reason, createdBy: actor.id, createdAt: now }).run();
    const amount = formatCurrency(minorToMajor(input.amountMinor, input.currency), input.currency, target.user.locale);
    persistUserEvent(tx, { userId: target.user.id, email: target.user.email, displayName: target.user.name, locale: target.user.locale, kind: "credit", title: "Money added to your account", message: `${amount} has been credited to your account.`, emailEvent: "transaction_completed", eventKey: reference, emailEventKey: `${reference}:credited`, publicReference: reference, emailSummary: `${amount} · ${t.notifications.titleMoneyAdded}. ${t.email.reference}: ${reference}.`, important: true, createdAt: now });
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: actor.id, actorLabel: actor.email, action: "account.admin_credit", target: reference, result: "success", metadataJson: JSON.stringify({ userId: target.user.id, accountId: target.account.id, amountMinor: String(input.amountMinor), currency: input.currency, reason }), timestamp: now }).run();
    return reference;
  }, { behavior: "immediate" });
}