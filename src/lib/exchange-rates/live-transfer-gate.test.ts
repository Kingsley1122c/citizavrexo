import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import type { Currency } from "@/lib/currency";

const pairs = [
  ["USD", "JPY"], ["USD", "KRW"], ["USD", "EUR"],
  ["EUR", "USD"], ["JPY", "USD"], ["KRW", "USD"],
] as const satisfies readonly (readonly [Currency, Currency])[];
const currencyOrder = ["USD", "KRW", "TWD", "JPY", "HKD", "SGD", "CNY", "THB", "VND", "IDR", "MYR", "INR", "PHP", "GBP", "EUR", "KWD"] as const;
const databasePath = process.env.DATABASE_URL?.replace(/^file:/, "");
const enabled = process.env.NODE_ENV !== "production" && !process.env.RENDER && process.env.QA_FIXTURE_MODE === "local-only" && process.env.LIVE_TRANSFER_GATE === "local-only" && databasePath !== undefined && resolve(databasePath) === resolve("data/Citizavrexo-next-gate.db") && process.env.APP_URL === "http://localhost:3011" && process.env.EXCHANGE_RATE_PROVIDER === "open_exchange_rates" && Boolean(process.env.OPEN_EXCHANGE_RATES_APP_ID);

describe.skipIf(!enabled)("live cross-currency transfer gate", () => {
  it("executes six quoted directions atomically and serves immutable persisted receipts", async () => {
    const { eq } = await import("drizzle-orm");
    const { currencyFractionDigits } = await import("@/lib/currency");
    const { db } = await import("@/lib/db/client");
    const { accounts, internalTransfers, transactions, transferPinAuthorizations, transferQuotes } = await import("@/lib/db/schema");
    const { createTransferQuote, getTransferReceiptForUser, transferBetweenUsers } = await import("@/lib/transactions/transfer-service");

    for (const [fromCurrency, toCurrency] of pairs) {
      const senderAccountId = `qa-sender-${fromCurrency.toLowerCase()}`;
      const recipientAccountNumber = String(9200000000 + currencyOrder.indexOf(toCurrency));
      const amountMinor = 10 * 10 ** currencyFractionDigits(fromCurrency);
      const senderBefore = db.select().from(accounts).where(eq(accounts.id, senderAccountId)).get()!;
      const recipientBefore = db.select().from(accounts).where(eq(accounts.number, recipientAccountNumber)).get()!;
      const quote = await createTransferQuote({ userId: "qa-local-customer", senderAccountId, recipientAccountNumber, amountMinor });
      const persistedQuote = db.select().from(transferQuotes).where(eq(transferQuotes.id, quote.id)).get()!;
      expect(persistedQuote).toMatchObject({ sourceCurrency: fromCurrency, recipientCurrency: toCurrency, rateProvider: "open_exchange_rates", consumedAt: null });
      expect(Number(persistedQuote.exchangeRate)).toBeGreaterThan(0);
      db.insert(transferPinAuthorizations).values({ id: `${quote.id}-live-pin`, userId: "qa-local-customer", quoteId: quote.id, expiresAt: quote.expiresAt, createdAt: new Date().toISOString() }).run();

      const idempotencyKey = `live-gate-${fromCurrency.toLowerCase()}-${toCurrency.toLowerCase()}-20260915`;
      const reference = transferBetweenUsers({ userId: "qa-local-customer", actorLabel: "qa.customer@local.test", quoteId: quote.id, idempotencyKey });
      expect(transferBetweenUsers({ userId: "qa-local-customer", actorLabel: "qa.customer@local.test", quoteId: quote.id, idempotencyKey })).toBe(reference);
      const transfer = db.select().from(internalTransfers).where(eq(internalTransfers.reference, reference)).get()!;
      expect(transfer).toMatchObject({ amountMinor, currency: fromCurrency, recipientAmountMinor: persistedQuote.recipientAmountMinor, recipientCurrency: toCurrency, exchangeRate: persistedQuote.exchangeRate, rateDate: persistedQuote.rateDate, rateTimestamp: persistedQuote.rateTimestamp, rateProvider: "open_exchange_rates" });
      const ledgerEntries = db.select().from(transactions).all().filter((entry) => entry.reference === `${reference}-D` || entry.reference === `${reference}-C`);
      expect(ledgerEntries).toHaveLength(2);
      expect(ledgerEntries.map((entry) => [entry.currency, entry.amountMinor])).toEqual(expect.arrayContaining([[fromCurrency, -amountMinor], [toCurrency, persistedQuote.recipientAmountMinor]]));
      expect(db.select().from(accounts).where(eq(accounts.id, senderAccountId)).get()!.balanceMinor).toBe(senderBefore.balanceMinor - amountMinor);
      expect(db.select().from(accounts).where(eq(accounts.number, recipientAccountNumber)).get()!.balanceMinor).toBe(recipientBefore.balanceMinor + persistedQuote.recipientAmountMinor);
      expect(db.select().from(accounts).where(eq(accounts.id, senderAccountId)).get()!.balanceMinor).toBeGreaterThanOrEqual(0);

      const receipt = getTransferReceiptForUser(reference, "qa-local-customer");
      expect(receipt).toMatchObject({ reference, sourceCurrency: fromCurrency, recipientCurrency: toCurrency, exchangeRate: persistedQuote.exchangeRate, rateDate: persistedQuote.rateDate, rateTimestamp: persistedQuote.rateTimestamp, rateProvider: "open_exchange_rates" });
      expect(getTransferReceiptForUser(reference, "qa-local-recipient")).toEqual(receipt);
      expect(getTransferReceiptForUser(reference, "qa-local-customer")).toEqual(receipt);
    }
  }, 45_000);
});
