import "server-only";

import type { Currency } from "@/lib/currency";
import { getExchangeRateProvider } from "./provider";

export const DEMONSTRATION_CURRENCIES = ["USD", "KRW", "TWD", "JPY", "HKD", "SGD", "CNY", "THB", "VND", "IDR", "MYR", "INR", "PHP", "GBP", "EUR", "KWD"] as const satisfies readonly Currency[];

export type LiveRateVerification = {
  status: "ok";
  provider: "open_exchange_rates";
  currencies: readonly Currency[];
  currencyCount: number;
  publishedAt: string;
  ageSeconds: number;
  maxAgeSeconds: number;
  providerUpdateCadenceSeconds: number;
  cacheTtlSeconds: number;
  quoteExpirySeconds: number;
  reciprocalAccuracy: boolean;
  simulatedOnly: true;
};

let verification: Promise<LiveRateVerification> | undefined;

export function verifyLiveExchangeRates(now = new Date()): Promise<LiveRateVerification> {
  verification ??= runVerification(now);
  return verification;
}

async function runVerification(now: Date): Promise<LiveRateVerification> {
  const provider = getExchangeRateProvider();
  const snapshots = await Promise.all(DEMONSTRATION_CURRENCIES.map((currency) => provider.getRate({ fromCurrency: "USD", toCurrency: currency })));
  const reciprocals = await Promise.all(DEMONSTRATION_CURRENCIES.filter((currency) => currency !== "USD").map((currency) => provider.getRate({ fromCurrency: currency, toCurrency: "USD" })));
  const publishedAt = snapshots[0].publishedAt;
  const sameSnapshot = snapshots.every((snapshot) => snapshot.publishedAt === publishedAt && Number(snapshot.rate) > 0 && Number.isFinite(Number(snapshot.rate)));
  const reciprocalAccuracy = reciprocals.every((snapshot, index) => Math.abs(Number(snapshot.rate) * Number(snapshots[index + 1].rate) - 1) < 1e-12);
  const publishedTime = Date.parse(publishedAt);
  const maxAgeSeconds = Number(process.env.EXCHANGE_RATE_MAX_AGE_SECONDS ?? "21600");
  const ageSeconds = Math.floor((now.getTime() - publishedTime) / 1_000);
  if (!sameSnapshot || !reciprocalAccuracy || !Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds !== 21_600 || !Number.isFinite(publishedTime) || ageSeconds < -300 || ageSeconds > maxAgeSeconds) {
    throw new Error("Live exchange-rate verification failed.");
  }
  return { status: "ok", provider: "open_exchange_rates", currencies: DEMONSTRATION_CURRENCIES, currencyCount: DEMONSTRATION_CURRENCIES.length, publishedAt, ageSeconds, maxAgeSeconds, providerUpdateCadenceSeconds: 3_600, cacheTtlSeconds: 3_600, quoteExpirySeconds: 300, reciprocalAccuracy, simulatedOnly: true };
}