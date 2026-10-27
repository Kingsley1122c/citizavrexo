import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditEvents, credentials, transferPinAuthorizations, transferQuotes } from "@/lib/db/schema";
import { clearAuthRateLimit, consumeAuthRateLimit } from "@/lib/auth/rate-limit-service";

const pinPattern = /^\d{4}$/;
const pinHashOptions = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export class TransactionPinError extends Error {}

const assertPin = (pin: string) => {
  if (!pinPattern.test(pin)) throw new TransactionPinError("Enter an exactly 4-digit transaction PIN.");
};

const hashPin = async (pin: string) => (await import("@node-rs/argon2")).hash(pin, pinHashOptions);
const verifyPin = async (hash: string, pin: string) => (await import("@node-rs/argon2")).verify(hash, pin);

export async function setUpTransactionPin(input: { userId: string; actorLabel: string; pin: string; confirmation: string }): Promise<void> {
  assertPin(input.pin);
  if (input.pin !== input.confirmation) throw new TransactionPinError("Transaction PINs do not match.");
  const credential = db.select({ transactionPinHash: credentials.transactionPinHash }).from(credentials).where(eq(credentials.userId, input.userId)).get();
  if (!credential || credential.transactionPinHash) throw new TransactionPinError("Transaction PIN setup is not available.");
  const pinHash = await hashPin(input.pin);
  const now = new Date().toISOString();
  db.transaction((tx) => {
    const updated = tx.update(credentials).set({ transactionPinHash: pinHash }).where(and(eq(credentials.userId, input.userId), isNull(credentials.transactionPinHash))).run();
    if (updated.changes !== 1) throw new TransactionPinError("Transaction PIN setup is not available.");
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: input.userId, actorLabel: input.actorLabel, action: "transaction_pin.setup", target: input.userId, result: "success", metadataJson: "{}", timestamp: now }).run();
  });
}

export async function changeTransactionPin(input: { userId: string; actorLabel: string; currentPin: string; newPin: string; confirmation: string }): Promise<void> {
  assertPin(input.currentPin);
  assertPin(input.newPin);
  if (input.newPin !== input.confirmation) throw new TransactionPinError("Transaction PINs do not match.");
  const credential = db.select({ transactionPinHash: credentials.transactionPinHash }).from(credentials).where(eq(credentials.userId, input.userId)).get();
  if (!credential?.transactionPinHash) throw new TransactionPinError("Set up a transaction PIN first.");
  if (!consumeAuthRateLimit("transaction_pin", input.userId)) throw new TransactionPinError("Too many incorrect PIN attempts. Try again later.");
  if (!(await verifyPin(credential.transactionPinHash, input.currentPin))) throw new TransactionPinError("The current transaction PIN is incorrect.");
  await clearAuthRateLimit("transaction_pin", input.userId);
  const pinHash = await hashPin(input.newPin);
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(credentials).set({ transactionPinHash: pinHash }).where(eq(credentials.userId, input.userId)).run();
    tx.delete(transferPinAuthorizations).where(eq(transferPinAuthorizations.userId, input.userId)).run();
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: input.userId, actorLabel: input.actorLabel, action: "transaction_pin.change", target: input.userId, result: "success", metadataJson: "{}", timestamp: now }).run();
  });
}

export async function authorizeTransferWithPin(input: { userId: string; quoteId: string; pin: string }, now = new Date()): Promise<string> {
  assertPin(input.pin);
  const timestamp = now.toISOString();
  const quote = db.select({ expiresAt: transferQuotes.expiresAt }).from(transferQuotes).where(and(eq(transferQuotes.id, input.quoteId), eq(transferQuotes.userId, input.userId), isNull(transferQuotes.consumedAt), gt(transferQuotes.expiresAt, timestamp))).get();
  if (!quote) throw new TransactionPinError("This transfer quote is invalid or expired. Review the transfer again.");
  const credential = db.select({ transactionPinHash: credentials.transactionPinHash }).from(credentials).where(eq(credentials.userId, input.userId)).get();
  if (!credential?.transactionPinHash) throw new TransactionPinError("Set up a transaction PIN in Security before sending money.");
  if (!consumeAuthRateLimit("transaction_pin", input.userId, now.getTime())) throw new TransactionPinError("Too many incorrect PIN attempts. Try again later.");
  if (!(await verifyPin(credential.transactionPinHash, input.pin))) throw new TransactionPinError("The transaction PIN is incorrect.");
  await clearAuthRateLimit("transaction_pin", input.userId);
  const existing = db.select().from(transferPinAuthorizations).where(and(eq(transferPinAuthorizations.quoteId, input.quoteId), eq(transferPinAuthorizations.userId, input.userId), isNull(transferPinAuthorizations.consumedAt), gt(transferPinAuthorizations.expiresAt, timestamp))).get();
  if (existing) return existing.id;
  const id = randomUUID();
  const expiresAt = new Date(Math.min(new Date(quote.expiresAt).getTime(), now.getTime() + 2 * 60_000)).toISOString();
  db.insert(transferPinAuthorizations).values({ id, userId: input.userId, quoteId: input.quoteId, expiresAt, createdAt: timestamp }).run();
  return id;
}