import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts, auditEvents, notifications, transactions } from "@/lib/db/schema";
import type { Currency, TransactionStatus, TransactionType } from "@/lib/domain";

export type LedgerEntryInput = { idempotencyKey: string; accountId: string; amountMinor: number; currency: Currency; type: TransactionType; description: string; status: TransactionStatus; actorId: string; actorLabel: string };

export async function recordLedgerEntry(input: LedgerEntryInput): Promise<string> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(input.idempotencyKey)) throw new Error("A valid idempotency key is required.");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor === 0) throw new Error("A non-zero integer minor-unit amount is required.");
  if (input.status !== "completed") throw new Error("Only completed entries may affect an account balance.");
  if ((input.type === "credit") !== (input.amountMinor > 0)) throw new Error("The transaction type does not match the amount direction.");
  if (!input.description.trim() || input.description.length > 200) throw new Error("A valid transaction description is required.");
  return db.transaction((tx) => {
    const existing = tx.select().from(transactions).where(eq(transactions.idempotencyKey, input.idempotencyKey)).get();
    if (existing) {
      const sameEntry = existing.accountId === input.accountId && existing.amountMinor === input.amountMinor && existing.currency === input.currency && existing.type === input.type && existing.description === input.description && existing.status === input.status;
      if (!sameEntry) throw new Error("The idempotency key was already used for a different transaction.");
      return existing.reference;
    }
    const account = tx.select().from(accounts).where(eq(accounts.id, input.accountId)).get();
    if (!account || account.status !== "active" || account.currency !== input.currency) throw new Error("The account cannot accept this transaction.");
    const reference = `NVC-${randomUUID()}`;
    const now = new Date().toISOString();
    const balanceAfterMinor = account.balanceMinor + input.amountMinor;
    if (!Number.isSafeInteger(balanceAfterMinor)) throw new Error("The resulting balance exceeds the supported range.");
    if (balanceAfterMinor < 0) throw new Error("Insufficient available balance.");
    const update = tx.update(accounts).set({ balanceMinor: balanceAfterMinor, updatedAt: now }).where(and(eq(accounts.id, account.id), eq(accounts.balanceMinor, account.balanceMinor))).run();
    if (update.changes !== 1) throw new Error("The account balance changed concurrently. Retry the transaction.");
    tx.insert(transactions).values({ id: randomUUID(), reference, idempotencyKey: input.idempotencyKey, accountId: account.id, type: input.type, description: input.description, amountMinor: input.amountMinor, currency: input.currency, occurredAt: now, status: input.status, balanceBeforeMinor: account.balanceMinor, balanceAfterMinor, createdBy: input.actorId, createdAt: now }).run();
    tx.insert(notifications).values({ id: randomUUID(), userId: account.userId, kind: input.amountMinor > 0 ? "credit" : "debit", title: input.amountMinor > 0 ? "Account credited" : "Account debited", message: input.description, eventReference: reference, important: false, createdAt: now }).run();
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: input.actorId, actorLabel: input.actorLabel, action: "transaction.create", target: reference, result: "success", metadataJson: JSON.stringify({ accountId: account.id, amountMinor: String(input.amountMinor), currency: input.currency }), timestamp: now }).run();
    return reference;
  });
}