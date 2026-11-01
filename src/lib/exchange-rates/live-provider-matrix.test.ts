import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { currencyFractionDigits, type Currency } from "@/lib/currency";
import { convertMinorAmount } from "./decimal";

const pairs = [
  ["USD", "JPY"], ["USD", "KRW"], ["USD", "TWD"], ["USD", "HKD"], ["USD", "SGD"], ["USD", "GBP"],
  ["JPY", "USD"], ["KRW", "USD"], ["TWD", "USD"], ["HKD", "USD"], ["SGD", "USD"],
] as const satisfies readonly (readonly [Currency, Currency])[];
const accountNumber = (currency: Currency) => String(9200000000 + ["USD", "KRW", "TWD", "JPY", "HKD", "SGD", "CNY", "THB", "VND", "IDR", "MYR", "INR", "PHP", "GBP", "EUR", "KWD"].indexOf(currency));
const databasePath = process.env.DATABASE_URL?.replace(/^file:/, "");
const configured = process.env.NODE_ENV !== "production" && !process.env.RENDER && process.env.QA_FIXTURE_MODE === "local-only" && process.env.LIVE_PROVIDER_GATE === "local-only" && databasePath !== undefined && resolve(databasePath) === resolve("data/Citizavrexo-provider-gate.db") && process.env.APP_URL === "http://localhost:3011" && process.env.EXCHANGE_RATE_PROVIDER === "open_exchange_rates" && Boolean(process.env.OPEN_EXCHANGE_RATES_APP_ID);

describe.skipIf(!configured)("live Open Exchange Rates currency matrix", () => {
  it.each(pairs)("retrieves and persists a verified %s/%s quote", async (fromCurrency, toCurrency) => {
    const { eq } = await import("drizzle-orm");
    const { db } = await import("@/lib/db/client");
    const { accounts, transferQuotes } = await import("@/lib/db/schema");
    const { createTransferQuote } = await import("@/lib/transactions/transfer-service");
    const { getExchangeRateProvider } = await import("./provider");
    const provider = getExchangeRateProvider();
    const snapshot = await provider!.getRate({ fromCurrency, toCurrency });
    expect(snapshot).toMatchObject({ fromCurrency, toCurrency, provider: "open_exchange_rates" });
    expect(snapshot.rate).toMatch(/^\d+(?:\.\d+)?$/);
    expect(Number.isFinite(Number(snapshot.rate))).toBe(true);
    expect(Number(snapshot.rate)).toBeGreaterThan(0);
    expect(snapshot.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(snapshot.publishedAt))).toBe(false);
    const amountMinor = 100 * 10 ** currencyFractionDigits(fromCurrency);
    const expectedRecipientMinor = convertMinorAmount(amountMinor, fromCurrency, toCurrency, snapshot.rate);
    expect(expectedRecipientMinor).toBeGreaterThan(0);
    const senderAccountId = `qa-sender-${fromCurrency.toLowerCase()}`;
    const senderBefore = db.select({ balanceMinor: accounts.balanceMinor }).from(accounts).where(eq(accounts.id, senderAccountId)).get();
    const recipientBefore = db.select({ balanceMinor: accounts.balanceMinor }).from(accounts).where(eq(accounts.number, accountNumber(toCurrency))).get();
    const quote = await createTransferQuote({ userId: "qa-local-customer", senderAccountId, recipientAccountNumber: accountNumber(toCurrency), amountMinor, provider: { id: provider!.id, getRate: async () => snapshot } });
    expect(db.select().from(transferQuotes).where(eq(transferQuotes.id, quote.id)).get()).toMatchObject({
      sourceAmountMinor: amountMinor,
      sourceCurrency: fromCurrency,
      recipientAmountMinor: expectedRecipientMinor,
      recipientCurrency: toCurrency,
      exchangeRate: snapshot.rate,
      rateDate: snapshot.effectiveDate,
      rateTimestamp: snapshot.publishedAt,
      rateProvider: "open_exchange_rates",
      consumedAt: null,
    });
    expect(db.select({ balanceMinor: accounts.balanceMinor }).from(accounts).where(eq(accounts.id, senderAccountId)).get()).toEqual(senderBefore);
    expect(db.select({ balanceMinor: accounts.balanceMinor }).from(accounts).where(eq(accounts.number, accountNumber(toCurrency))).get()).toEqual(recipientBefore);
  });

  it("returns a date-specific historical snapshot", async () => {
    const { getExchangeRateProvider } = await import("./provider");
    const provider = getExchangeRateProvider();
    const date = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    const snapshot = await provider!.getRate({ fromCurrency: "USD", toCurrency: "JPY", date });
    expect(snapshot).toMatchObject({ fromCurrency: "USD", toCurrency: "JPY", effectiveDate: date, provider: "open_exchange_rates" });
  });
});
