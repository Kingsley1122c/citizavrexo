import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts, auditEvents, emailOutbox, internalTransfers, notifications, transactions, transferPinAuthorizations, transferQuotes, users } from "@/lib/db/schema";
import type { Currency, TransferReceipt } from "@/lib/domain";
import { convertMinorAmount } from "@/lib/exchange-rates/decimal";
import { getExchangeRateProvider } from "@/lib/exchange-rates/provider";
import type { ExchangeRateProvider, ExchangeRateSnapshot } from "@/lib/exchange-rates/types";
import { ExchangeRateError } from "@/lib/exchange-rates/types";
import { financialEventCopy } from "@/lib/i18n/financial-events";
import { formatCurrency } from "@/lib/currency";
import { minorToMajor } from "@/lib/money";

export class TransferError extends Error {}

type TransferInput = {
  userId: string;
  actorLabel: string;
  quoteId: string;
  idempotencyKey: string;
};

const idempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function findCompletedTransferRetry(input: Pick<TransferInput, "userId" | "quoteId" | "idempotencyKey">): string | undefined {
  if (!idempotencyPattern.test(input.idempotencyKey)) throw new TransferError("A valid transfer key is required.");
  const existing = db.select().from(internalTransfers).where(eq(internalTransfers.idempotencyKey, input.idempotencyKey)).get();
  if (!existing) return undefined;
  const requestedQuote = db.select().from(transferQuotes).where(and(eq(transferQuotes.id, input.quoteId), eq(transferQuotes.userId, input.userId))).get();
  const identical = requestedQuote && existing.senderAccountId === requestedQuote.senderAccountId && existing.recipientAccountId === requestedQuote.recipientAccountId && existing.amountMinor === requestedQuote.sourceAmountMinor && existing.currency === requestedQuote.sourceCurrency && existing.createdBy === input.userId;
  if (!identical) throw new TransferError("This transfer key was already used for different details.");
  return existing.reference;
}

export type TransferQuote = {
  id: string;
  recipientName: string;
  maskedAccountNumber: string;
  sourceAmount: number;
  sourceCurrency: Currency;
  recipientAmount: number;
  recipientCurrency: Currency;
  exchangeRate: string;
  rateDate: string;
  rateTimestamp: string;
  rateProvider: string;
  expiresAt: string;
};

export function findTransferRecipient(userId: string, senderAccountId: string, accountNumber: string) {
  const normalized = accountNumber.trim();
  if (!/^\d{10}$/.test(normalized)) throw new TransferError("Enter a valid ten-digit Nivora account number.");
  const sender = db.select({ account: accounts, user: users }).from(accounts).innerJoin(users, eq(accounts.userId, users.id)).where(and(eq(accounts.id, senderAccountId), eq(accounts.userId, userId))).get();
  if (!sender || sender.account.status !== "active" || sender.user.status !== "active" || sender.user.deletedAt) throw new TransferError("The sending account is not available.");
  const recipient = db.select({ accountId: accounts.id, accountNumber: accounts.number, accountName: accounts.name, currency: accounts.currency, accountStatus: accounts.status, userId: users.id, userName: users.name, userStatus: users.status })
    .from(accounts)
    .innerJoin(users, eq(accounts.userId, users.id))
    .where(and(eq(accounts.number, normalized), isNull(users.deletedAt)))
    .get();
  if (!recipient || recipient.userStatus !== "active") throw new TransferError("No eligible recipient was found for that account number.");
  if (recipient.userId === userId) throw new TransferError("You cannot send money to your own account.");
  if (recipient.accountStatus !== "active") throw new TransferError("The recipient account cannot receive transfers.");
  return recipient;
}

export async function createTransferQuote(input: { userId: string; senderAccountId: string; recipientAccountNumber: string; amountMinor: number; provider?: ExchangeRateProvider; now?: Date }): Promise<TransferQuote> {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new TransferError("Enter a valid amount greater than zero.");
  const recipient = findTransferRecipient(input.userId, input.senderAccountId, input.recipientAccountNumber);
  const sender = db.select().from(accounts).where(and(eq(accounts.id, input.senderAccountId), eq(accounts.userId, input.userId))).get();
  if (!sender || sender.balanceMinor < input.amountMinor) throw new TransferError("Insufficient available balance.");
  const now = input.now ?? new Date();
  let rate: ExchangeRateSnapshot;
  try {
    rate = sender.currency === recipient.currency
      ? { fromCurrency: sender.currency, toCurrency: recipient.currency, rate: "1", effectiveDate: now.toISOString().slice(0, 10), publishedAt: now.toISOString(), provider: "same_currency" }
      : await (input.provider ?? getExchangeRateProvider()).getRate({ fromCurrency: sender.currency, toCurrency: recipient.currency });
  } catch (error) {
    if (error instanceof ExchangeRateError) throw new TransferError(error.message);
    throw new TransferError("A verified exchange rate is temporarily unavailable. No transfer was made.");
  }
  if (sender.currency !== recipient.currency) {
    const publishedAt = new Date(rate.publishedAt).getTime();
    const maxAgeSeconds = Number(process.env.EXCHANGE_RATE_MAX_AGE_SECONDS ?? "21600");
    if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 60 || maxAgeSeconds > 86_400 || !Number.isFinite(publishedAt) || publishedAt > now.getTime() + 300_000 || now.getTime() - publishedAt > maxAgeSeconds * 1_000) {
      throw new TransferError("A current verified exchange rate is unavailable. No transfer was made.");
    }
  }
  const recipientAmountMinor = convertMinorAmount(input.amountMinor, sender.currency, recipient.currency, rate.rate);
  const id = randomUUID();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 5 * 60_000).toISOString();
  db.insert(transferQuotes).values({ id, userId: input.userId, senderAccountId: sender.id, recipientAccountId: recipient.accountId, sourceAmountMinor: input.amountMinor, sourceCurrency: sender.currency, recipientAmountMinor, recipientCurrency: recipient.currency, exchangeRate: rate.rate, rateDate: rate.effectiveDate, rateTimestamp: rate.publishedAt, rateProvider: rate.provider, expiresAt, createdAt }).run();
  return { id, recipientName: recipient.userName, maskedAccountNumber: `•••• ${recipient.accountNumber.slice(-4)}`, sourceAmount: minorToMajor(input.amountMinor, sender.currency), sourceCurrency: sender.currency, recipientAmount: minorToMajor(recipientAmountMinor, recipient.currency), recipientCurrency: recipient.currency, exchangeRate: rate.rate, rateDate: rate.effectiveDate, rateTimestamp: rate.publishedAt, rateProvider: rate.provider, expiresAt };
}
export function transferBetweenUsers(input: TransferInput): string {
  if (!idempotencyPattern.test(input.idempotencyKey)) throw new TransferError("A valid transfer key is required.");

  return db.transaction((tx) => {
    const existing = tx.select().from(internalTransfers).where(eq(internalTransfers.idempotencyKey, input.idempotencyKey)).get();
    if (existing) {
      const requestedQuote = tx.select().from(transferQuotes).where(and(eq(transferQuotes.id, input.quoteId), eq(transferQuotes.userId, input.userId))).get();
      const identical = requestedQuote && existing.senderAccountId === requestedQuote.senderAccountId && existing.recipientAccountId === requestedQuote.recipientAccountId && existing.amountMinor === requestedQuote.sourceAmountMinor && existing.currency === requestedQuote.sourceCurrency && existing.createdBy === input.userId;
      if (!identical) throw new TransferError("This transfer key was already used for different details.");
      return existing.reference;
    }

    const now = new Date().toISOString();
    const quote = tx.select().from(transferQuotes).where(and(eq(transferQuotes.id, input.quoteId), eq(transferQuotes.userId, input.userId), isNull(transferQuotes.consumedAt), gt(transferQuotes.expiresAt, now))).get();
    if (!quote) throw new TransferError("This transfer quote is invalid, expired, or already used. Review the transfer again.");
    const authorization = tx.select().from(transferPinAuthorizations).where(and(eq(transferPinAuthorizations.userId, input.userId), eq(transferPinAuthorizations.quoteId, quote.id), isNull(transferPinAuthorizations.consumedAt), gt(transferPinAuthorizations.expiresAt, now))).get();
    if (!authorization) throw new TransferError("Transaction PIN authorization is invalid or expired. Enter your PIN again.");
    const sender = tx.select({ account: accounts, user: users }).from(accounts).innerJoin(users, eq(accounts.userId, users.id)).where(and(eq(accounts.id, quote.senderAccountId), eq(accounts.userId, input.userId))).get();
    if (!sender || sender.user.status !== "active" || sender.user.deletedAt) throw new TransferError("The sending account is not available.");
    const recipient = tx.select({ account: accounts, user: users }).from(accounts).innerJoin(users, eq(accounts.userId, users.id)).where(eq(accounts.id, quote.recipientAccountId)).get();
    if (!recipient || recipient.user.status !== "active" || recipient.user.deletedAt) throw new TransferError("The recipient account is not available.");
    if (sender.user.id === recipient.user.id) throw new TransferError("You cannot send money to your own account.");
    if (sender.account.status !== "active" || recipient.account.status !== "active") throw new TransferError("Both accounts must be active.");
    if (sender.account.currency !== quote.sourceCurrency || recipient.account.currency !== quote.recipientCurrency) throw new TransferError("Account currencies changed. Review the transfer again.");
    if (sender.account.balanceMinor < quote.sourceAmountMinor) throw new TransferError("Insufficient available balance.");

    const senderAfter = sender.account.balanceMinor - quote.sourceAmountMinor;
    const recipientAfter = recipient.account.balanceMinor + quote.recipientAmountMinor;
    if (!Number.isSafeInteger(senderAfter) || !Number.isSafeInteger(recipientAfter)) throw new TransferError("The resulting balance exceeds the supported range.");

    const reference = `NVT-${randomUUID()}`;
    const senderText = financialEventCopy(sender.user.locale);
    const recipientText = financialEventCopy(recipient.user.locale);
    const sourceAmount = formatCurrency(minorToMajor(quote.sourceAmountMinor, quote.sourceCurrency), quote.sourceCurrency, sender.user.locale);
    const destinationAmount = formatCurrency(minorToMajor(quote.recipientAmountMinor, quote.recipientCurrency), quote.recipientCurrency, recipient.user.locale);
    const quoteClaim = tx.update(transferQuotes).set({ consumedAt: now }).where(and(eq(transferQuotes.id, quote.id), eq(transferQuotes.userId, input.userId), isNull(transferQuotes.consumedAt), gt(transferQuotes.expiresAt, now))).run();
    if (quoteClaim.changes !== 1) throw new TransferError("This transfer quote is invalid, expired, or already used. Review the transfer again.");
    const authorizationClaim = tx.update(transferPinAuthorizations).set({ consumedAt: now }).where(and(eq(transferPinAuthorizations.id, authorization.id), isNull(transferPinAuthorizations.consumedAt), gt(transferPinAuthorizations.expiresAt, now))).run();
    if (authorizationClaim.changes !== 1) throw new TransferError("Transaction PIN authorization is invalid or expired. Enter your PIN again.");
    const senderUpdate = tx.update(accounts).set({ balanceMinor: senderAfter, updatedAt: now }).where(and(eq(accounts.id, sender.account.id), eq(accounts.balanceMinor, sender.account.balanceMinor), eq(accounts.currency, quote.sourceCurrency), eq(accounts.status, "active"))).run();
    if (senderUpdate.changes !== 1) throw new TransferError("Your balance changed. Review the transfer again.");
    const recipientUpdate = tx.update(accounts).set({ balanceMinor: recipientAfter, updatedAt: now }).where(and(eq(accounts.id, recipient.account.id), eq(accounts.balanceMinor, recipient.account.balanceMinor), eq(accounts.currency, quote.recipientCurrency), eq(accounts.status, "active"))).run();
    if (recipientUpdate.changes !== 1) throw new TransferError("The recipient account changed. Try again.");

    tx.insert(internalTransfers).values({ id: randomUUID(), reference, idempotencyKey: input.idempotencyKey, senderAccountId: sender.account.id, recipientAccountId: recipient.account.id, amountMinor: quote.sourceAmountMinor, currency: quote.sourceCurrency, recipientAmountMinor: quote.recipientAmountMinor, recipientCurrency: quote.recipientCurrency, exchangeRate: quote.exchangeRate, rateDate: quote.rateDate, rateTimestamp: quote.rateTimestamp, rateProvider: quote.rateProvider, senderName: sender.user.name, senderAccountName: sender.account.name, senderAccountNumber: sender.account.number, recipientName: recipient.user.name, recipientAccountName: recipient.account.name, recipientAccountNumber: recipient.account.number, status: "completed", createdBy: input.userId, createdAt: now }).run();
    tx.insert(transactions).values([
      { id: randomUUID(), reference: `${reference}-D`, idempotencyKey: `${input.idempotencyKey}:debit`, accountId: sender.account.id, type: "transfer", description: `Transfer to ${recipient.user.name}`, amountMinor: -quote.sourceAmountMinor, currency: quote.sourceCurrency, occurredAt: now, status: "completed", balanceBeforeMinor: sender.account.balanceMinor, balanceAfterMinor: senderAfter, createdBy: input.userId, createdAt: now },
      { id: randomUUID(), reference: `${reference}-C`, idempotencyKey: `${input.idempotencyKey}:credit`, accountId: recipient.account.id, type: "transfer", description: `Transfer from ${sender.user.name}`, amountMinor: quote.recipientAmountMinor, currency: quote.recipientCurrency, occurredAt: now, status: "completed", balanceBeforeMinor: recipient.account.balanceMinor, balanceAfterMinor: recipientAfter, createdBy: input.userId, createdAt: now },
    ]).run();
    tx.insert(notifications).values([
      { id: randomUUID(), userId: sender.user.id, kind: "transfer", title: senderText.transferSentTitle, message: senderText.transferSent(sourceAmount, recipient.user.name, destinationAmount), eventReference: reference, important: false, createdAt: now },
      { id: randomUUID(), userId: recipient.user.id, kind: "transfer", title: recipientText.transferReceivedTitle, message: recipientText.transferReceived(destinationAmount, sender.user.name, sourceAmount), eventReference: reference, important: false, createdAt: now },
    ]).run();
    tx.insert(emailOutbox).values([
      { id: randomUUID(), recipient: sender.user.email, event: "transaction_completed", eventReference: `${reference}:sender`, payloadJson: JSON.stringify({ to: sender.user.email, locale: sender.user.locale, event: "transaction_completed", eventReference: reference, displayName: sender.user.name, summary: senderText.transferSent(sourceAmount, recipient.user.name, destinationAmount) }), status: "pending", createdAt: now },
      { id: randomUUID(), recipient: recipient.user.email, event: "transaction_completed", eventReference: `${reference}:recipient`, payloadJson: JSON.stringify({ to: recipient.user.email, locale: recipient.user.locale, event: "transaction_completed", eventReference: reference, displayName: recipient.user.name, summary: recipientText.transferReceived(destinationAmount, sender.user.name, sourceAmount) }), status: "pending", createdAt: now },
    ]).run();
    tx.insert(auditEvents).values({ id: `AUD-${randomUUID()}`, actorId: input.userId, actorLabel: input.actorLabel, action: "transfer.complete", target: reference, result: "success", metadataJson: JSON.stringify({ quoteId: quote.id, senderAccountId: sender.account.id, recipientAccountId: recipient.account.id, sourceAmountMinor: String(quote.sourceAmountMinor), sourceCurrency: quote.sourceCurrency, recipientAmountMinor: String(quote.recipientAmountMinor), recipientCurrency: quote.recipientCurrency, exchangeRate: quote.exchangeRate, rateDate: quote.rateDate, rateTimestamp: quote.rateTimestamp, rateProvider: quote.rateProvider }), timestamp: now }).run();
    return reference;
  }, { behavior: "immediate" });
}

export function getTransferReceiptForUser(reference: string, userId: string): TransferReceipt {
  const transfer = db.select().from(internalTransfers).where(eq(internalTransfers.reference, reference)).get();
  if (!transfer) throw new TransferError("The transfer receipt is not available.");
  const senderAccount = db.select().from(accounts).where(eq(accounts.id, transfer.senderAccountId)).get();
  const recipientAccount = db.select().from(accounts).where(eq(accounts.id, transfer.recipientAccountId)).get();
  const sender = senderAccount ? db.select().from(users).where(eq(users.id, senderAccount.userId)).get() : undefined;
  const recipient = recipientAccount ? db.select().from(users).where(eq(users.id, recipientAccount.userId)).get() : undefined;
  if (!senderAccount || !recipientAccount || !sender || !recipient || (sender.id !== userId && recipient.id !== userId)) throw new TransferError("The transfer receipt is not available.");
  const recipientAmountMinor = transfer.recipientAmountMinor ?? transfer.amountMinor;
  const recipientCurrency = transfer.recipientCurrency ?? transfer.currency;
  return { reference: transfer.reference, occurredAt: transfer.createdAt, amount: minorToMajor(transfer.amountMinor, transfer.currency), currency: transfer.currency, sourceAmount: minorToMajor(transfer.amountMinor, transfer.currency), sourceCurrency: transfer.currency, recipientAmount: minorToMajor(recipientAmountMinor, recipientCurrency), recipientCurrency, exchangeRate: transfer.exchangeRate ?? "1", rateDate: transfer.rateDate ?? transfer.createdAt.slice(0, 10), rateTimestamp: transfer.rateTimestamp ?? transfer.createdAt, rateProvider: transfer.rateProvider ?? "same_currency", status: transfer.status, senderName: transfer.senderName ?? sender.name, senderAccountName: transfer.senderAccountName ?? senderAccount.name, senderAccountNumber: transfer.senderAccountNumber ?? senderAccount.number, recipientName: transfer.recipientName ?? recipient.name, recipientAccountName: transfer.recipientAccountName ?? recipientAccount.name, recipientAccountNumber: transfer.recipientAccountNumber ?? recipientAccount.number };
}
